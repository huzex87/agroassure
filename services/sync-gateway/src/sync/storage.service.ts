import { Inject, Injectable, Logger } from "@nestjs/common";
import { mkdir, writeFile, chmod, access, readFile } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "@agroassure/domain";
import { CONFIG, type AppConfig } from "../config/config";
import { PgService } from "../db/pg.service";
import { evidenceObjectKey } from "./object-key";

// Content-addressed, write-once evidence storage. This local implementation
// emulates the object-lock (WORM) guarantee described in the guide: an object
// is written once, made read-only, and never overwritten. In production this is
// an S3-compatible bucket with object-lock in compliance mode, Nigeria-resident.

export interface StoredEvidence {
  objectKey: string;
  sha256: string;
  locked: boolean;
  deduplicated: boolean;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger("Storage");

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly pg: PgService,
  ) {}

  /**
   * Confirm the exhibit is immutable in storage. `locked` is the record that the
   * bytes are now under WORM protection; the row itself was created when the
   * capture event was projected, so an exhibit is never orphaned by a failed
   * upload, only left unlocked and visibly awaiting its bytes.
   */
  async markLocked(evidenceId: string, objectKey: string): Promise<void> {
    await this.pg.query(
      `UPDATE evidence SET locked = true, object_key = $2 WHERE id = $1`,
      [evidenceId, objectKey],
    );
  }

  // Verify the declared hash against the actual bytes, then store immutably.
  async store(declaredSha256: string, bytes: Uint8Array): Promise<StoredEvidence> {
    const actual = sha256Hex(bytes);
    if (actual !== declaredSha256.toLowerCase()) {
      throw new Error("hash mismatch: declared checksum does not match content");
    }

    const key = evidenceObjectKey(actual);
    const path = join(this.config.evidenceStoreDir, ...key.split("/"));

    // Content-addressed dedup: identical bytes map to one object.
    if (await this.exists(path)) {
      const existing = await readFile(path);
      if (sha256Hex(new Uint8Array(existing)) === actual) {
        return { objectKey: key, sha256: actual, locked: true, deduplicated: true };
      }
      // A different file at the same content-address is impossible for SHA-256;
      // treat as a hard error rather than overwrite.
      throw new Error("content-address collision detected");
    }

    await mkdir(join(this.config.evidenceStoreDir, actual.slice(0, 2)), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" }); // wx: fail if exists (write-once)
    await chmod(path, 0o444); // read-only: emulate WORM
    this.logger.log(`stored evidence ${key} (${bytes.length} bytes), locked`);
    return { objectKey: key, sha256: actual, locked: true, deduplicated: false };
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, FS.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
