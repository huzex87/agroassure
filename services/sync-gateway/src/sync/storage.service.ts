import { Inject, Injectable } from "@nestjs/common";
import { sha256Hex } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { evidenceObjectKey } from "./object-key";
import { BLOB_STORE, type BlobStore } from "./blob-store.port";

// Content-addressed, write-once evidence storage.
//
// The check that matters lives here rather than in either backing store: the
// declared hash is verified against the actual bytes before anything is written,
// so a device cannot upload one file while claiming the checksum of another. The
// hash was computed on the handset at the instant of capture and is already in a
// signed event, which is what binds these bytes to that moment.

export interface StoredEvidence {
  objectKey: string;
  sha256: string;
  locked: boolean;
  deduplicated: boolean;
}

@Injectable()
export class StorageService {
  constructor(
    @Inject(BLOB_STORE) private readonly blobs: BlobStore,
    private readonly pg: PgService,
  ) {}

  /**
   * Confirm the exhibit is immutable in storage. `locked` is the record that the
   * bytes are now under WORM protection; the row itself was created when the
   * capture event was projected, so an exhibit is never orphaned by a failed
   * upload, only left unlocked and visibly awaiting its bytes.
   */
  async markLocked(evidenceId: string, objectKey: string): Promise<void> {
    await this.pg.query(`UPDATE evidence SET locked = true, object_key = $2 WHERE id = $1`, [
      evidenceId,
      objectKey,
    ]);
  }

  /** Verify the declared hash against the actual bytes, then store immutably. */
  async store(
    declaredSha256: string,
    bytes: Uint8Array,
    contentType = "application/octet-stream",
  ): Promise<StoredEvidence> {
    const actual = sha256Hex(bytes);
    if (actual !== declaredSha256.toLowerCase()) {
      throw new Error("hash mismatch: declared checksum does not match content");
    }

    const key = evidenceObjectKey(actual);
    const result = await this.blobs.putIfAbsent(key, bytes, contentType);

    return {
      objectKey: key,
      sha256: actual,
      locked: result.locked,
      deduplicated: result.deduplicated,
    };
  }

  /**
   * Re-read an exhibit and confirm the stored bytes still hash to their own
   * content address. Storage says an object is locked; this proves it, which is
   * what an auditor asking "has this photograph been altered" actually needs.
   */
  async verify(objectKey: string): Promise<{ present: boolean; intact: boolean }> {
    const bytes = await this.blobs.get(objectKey);
    if (!bytes) return { present: false, intact: false };
    return { present: true, intact: evidenceObjectKey(sha256Hex(bytes)) === objectKey };
  }

  describeStore(): string {
    return this.blobs.describe();
  }
}
