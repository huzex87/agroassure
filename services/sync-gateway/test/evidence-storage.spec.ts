import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "@agroassure/domain";
import { LocalBlobStore } from "../src/sync/local-blob-store";
import { StorageService } from "../src/sync/storage.service";
import { evidenceObjectKey } from "../src/sync/object-key";
import type { AppConfig } from "../src/config/config";

// An exhibit is a photograph someone may later dispute. What has to hold is
// that the bytes stored are the bytes the device hashed at the shutter, and that
// nothing this application can do will replace them afterwards.

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const OTHER_PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);

class FakePg {
  updates: unknown[][] = [];
  async query<T>(_text: string, params: unknown[] = []): Promise<T[]> {
    this.updates.push(params);
    return [] as T[];
  }
}

describe("evidence storage", () => {
  let dir: string;
  let storage: StorageService;
  let blobs: LocalBlobStore;
  let pg: FakePg;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agroassure-evidence-"));
    const config = { evidenceStoreDir: dir } as AppConfig;
    blobs = new LocalBlobStore(config);
    pg = new FakePg();
    storage = new StorageService(blobs, pg as never);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("refuses bytes that do not match the declared checksum", async () => {
    // The declared hash came from a signed capture event. Storing these bytes
    // under it would mean the signed record described a different photograph.
    await expect(storage.store(sha256Hex(OTHER_PHOTO), PHOTO)).rejects.toThrow(/hash mismatch/);
    expect(await readdir(dir)).toEqual([]);
  });

  it("stores bytes under their own content address and locks them", async () => {
    const result = await storage.store(sha256Hex(PHOTO), PHOTO, "image/jpeg");
    expect(result.objectKey).toBe(evidenceObjectKey(sha256Hex(PHOTO)));
    expect(result.locked).toBe(true);
    expect(result.deduplicated).toBe(false);
  });

  it("treats a re-upload of the same exhibit as already stored", async () => {
    // A device retries an upload it never got an answer to. That must not be an
    // error, and must not write a second copy.
    await storage.store(sha256Hex(PHOTO), PHOTO);
    const again = await storage.store(sha256Hex(PHOTO), PHOTO);
    expect(again.deduplicated).toBe(true);
    expect(again.locked).toBe(true);
  });

  it("verifies a stored exhibit against its own content address", async () => {
    const { objectKey } = await storage.store(sha256Hex(PHOTO), PHOTO);
    expect(await storage.verify(objectKey)).toEqual({ present: true, intact: true });
  });

  it("reports an exhibit that is missing rather than claiming it is intact", async () => {
    expect(await storage.verify(evidenceObjectKey(sha256Hex(PHOTO)))).toEqual({
      present: false,
      intact: false,
    });
  });

  it("detects an exhibit altered underneath it", async () => {
    // The local store emulates WORM; it does not enforce it, which is exactly
    // why verify() exists and why production uses object-lock. Someone with a
    // shell edits the file: the content address no longer matches the bytes.
    const { objectKey } = await storage.store(sha256Hex(PHOTO), PHOTO);
    const path = join(dir, ...objectKey.split("/"));
    await chmod(path, 0o644);
    await writeFile(path, OTHER_PHOTO);

    expect(await storage.verify(objectKey)).toEqual({ present: true, intact: false });
  });

  it("will not overwrite an object that already exists", async () => {
    await storage.store(sha256Hex(PHOTO), PHOTO);
    const key = evidenceObjectKey(sha256Hex(PHOTO));
    // Same key, different bytes, straight at the blob store: refused as already
    // present rather than written over.
    const result = await blobs.putIfAbsent(key, OTHER_PHOTO, "image/jpeg");
    expect(result.deduplicated).toBe(true);
    expect(await storage.verify(key)).toEqual({ present: true, intact: true });
  });

  it("marks the row locked only against the key that was actually stored", async () => {
    const { objectKey } = await storage.store(sha256Hex(PHOTO), PHOTO);
    await storage.markLocked("018f0000-0000-7000-8000-0000000000ee", objectKey);
    expect(pg.updates.at(-1)).toEqual(["018f0000-0000-7000-8000-0000000000ee", objectKey]);
  });
});
