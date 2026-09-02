// Where the bytes of an exhibit actually live.
//
// This is a port because the WORM guarantee is a property of the storage, not
// of this application. On a laptop it is a read-only file; in production it is
// an S3 object under a compliance-mode lock that the regulator's own operators
// cannot delete before its retention expires. The difference matters legally
// and not at all to the code above it, which is exactly why it is an interface.
//
// Note what is NOT here: no delete, no overwrite, no move. An exhibit is
// content-addressed and written once. Leaving those operations out of the port
// means no future caller can reach for them by accident.

export interface PutResult {
  /** These exact bytes were already stored; nothing was written. */
  deduplicated: boolean;
  /**
   * The object is now immutable in storage. False would mean the bytes are
   * present but not yet protected, which the upload endpoint reports honestly
   * rather than claiming a lock it did not get.
   */
  locked: boolean;
}

export interface BlobStore {
  /**
   * Write these bytes at this key, unless the key already holds them. Must not
   * overwrite: the key is a content address, so an existing object with the
   * same key already has the same bytes.
   */
  putIfAbsent(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult>;

  /** Read an object back, for verification. Null if the key holds nothing. */
  get(key: string): Promise<Uint8Array | null>;

  /** A short description of the backing store, for /health and the logs. */
  describe(): string;
}

export const BLOB_STORE = Symbol("BLOB_STORE");
