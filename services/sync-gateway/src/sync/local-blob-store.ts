import { Inject, Injectable, Logger } from "@nestjs/common";
import { mkdir, writeFile, chmod, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG, type AppConfig } from "../config/config";
import type { BlobStore, PutResult } from "./blob-store.port";

// Evidence on a filesystem. This is what a development machine and the shared
// preview use, and it emulates WORM rather than providing it: `wx` refuses to
// overwrite and the file is then made read-only, which stops this application
// from replacing an exhibit but not an operator with a shell.
//
// That distinction is the whole reason the S3 store exists. Do not deploy this
// one where an exhibit might be evidence in a dispute.

@Injectable()
export class LocalBlobStore implements BlobStore {
  private readonly logger = new Logger("LocalBlobStore");

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  describe(): string {
    return `local:${this.config.evidenceStoreDir} (WORM emulated, not enforced)`;
  }

  async putIfAbsent(key: string, bytes: Uint8Array): Promise<PutResult> {
    const path = this.pathFor(key);
    const existing = await this.readOrNull(path);
    if (existing) return { deduplicated: true, locked: true };

    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, bytes, { flag: "wx" }); // wx: fail if it exists
    } catch (err) {
      // Another request wrote the same content address between our read and our
      // write. Content-addressed, so it holds the same bytes: not an error.
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        return { deduplicated: true, locked: true };
      }
      throw err;
    }
    await chmod(path, 0o444);
    this.logger.log(`stored ${key} (${bytes.length} bytes)`);
    return { deduplicated: false, locked: true };
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.readOrNull(this.pathFor(key));
  }

  private pathFor(key: string): string {
    // The key uses "/" as part of the record; the filesystem may not.
    return join(this.config.evidenceStoreDir, ...key.split("/"));
  }

  private async readOrNull(path: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      return null;
    }
  }
}
