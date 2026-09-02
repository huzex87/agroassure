import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sha256Hex } from "@agroassure/domain";
import { CONFIG, type AppConfig } from "../config/config";
import type { BlobStore, PutResult } from "./blob-store.port";
import { evidenceObjectKey } from "./object-key";

// Evidence under object-lock.
//
// What object-lock actually gives you, tested against a real implementation
// rather than assumed: COMPLIANCE mode makes a *version* undeletable and
// unmodifiable until its retention expires — by anyone, including the account
// root. What it does not do is make a *key* immutable. A second PutObject to the
// same key succeeds and becomes the current version, and a plain GET then
// returns those bytes while the locked original sits underneath, still there and
// still unreachable to a caller who does not ask for it by version.
//
// So two things are needed, and neither alone is enough:
//
//   1. Write conditionally. If-None-Match: * makes the store itself refuse a
//      write where the key already exists, which also removes the
//      check-then-write race that a head-then-put has.
//   2. Never trust the current version. The key is the SHA-256 of the content,
//      so a read can check itself for free: if the current version does not hash
//      to its own key, someone has written over it, and the authentic version is
//      the one that does hash correctly — still present, because object-lock
//      would not let them remove it.
//
// The bucket must be created with versioning and object-lock enabled.
// Object-lock cannot be turned on afterwards, so a bucket made without it can
// never be repaired into one that has it.

@Injectable()
export class S3BlobStore implements BlobStore {
  private readonly logger = new Logger("S3BlobStore");
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly retentionYears: number;

  constructor(@Inject(CONFIG) config: AppConfig) {
    const s3 = config.evidenceS3;
    if (!s3) throw new Error("EVIDENCE_S3_BUCKET is required when EVIDENCE_STORE=s3");

    this.bucket = s3.bucket;
    this.retentionYears = s3.retentionYears;
    this.client = new S3Client({
      region: s3.region,
      // An explicit endpoint covers a Nigeria-resident S3-compatible provider
      // and MinIO in development; omitted, the SDK talks to AWS.
      ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {}),
      ...(s3.accessKeyId && s3.secretAccessKey
        ? {
            credentials: {
              accessKeyId: s3.accessKeyId,
              secretAccessKey: s3.secretAccessKey,
            },
          }
        : {}),
    });
  }

  describe(): string {
    return `s3:${this.bucket} (object-lock COMPLIANCE, ${this.retentionYears}y)`;
  }

  async putIfAbsent(key: string, bytes: Uint8Array, contentType: string): Promise<PutResult> {
    if (await this.head(key)) return { deduplicated: true, locked: true };

    const retainUntil = new Date();
    retainUntil.setFullYear(retainUntil.getFullYear() + this.retentionYears);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          // The store refuses this write if the key already holds anything, so
          // an exhibit is never replaced by us even under a race.
          IfNoneMatch: "*",
          ObjectLockMode: "COMPLIANCE",
          ObjectLockRetainUntilDate: retainUntil,
        }),
      );
    } catch (err) {
      // Another request stored the same content address between the head and
      // the put. Content-addressed, so it holds the same bytes: not an error.
      if (isPreconditionFailed(err)) return { deduplicated: true, locked: true };
      throw err;
    }

    this.logger.log(
      `stored ${key} (${bytes.length} bytes), retained until ${retainUntil.toISOString().slice(0, 10)}`,
    );
    return { deduplicated: false, locked: true };
  }

  /**
   * Read an exhibit, checking it against its own content address.
   *
   * The fast path is one GET and one hash. The slow path only runs when the
   * current version has been written over, which should never happen and is
   * reported loudly when it does.
   */
  async get(key: string): Promise<Uint8Array | null> {
    const current = await this.getVersion(key);
    if (!current) return null;
    if (evidenceObjectKey(sha256Hex(current)) === key) return current;

    this.logger.error(
      `evidence ${key} has been written over: the current version does not match its ` +
        `content address. Recovering the locked original.`,
    );
    return this.authenticVersion(key);
  }

  /**
   * Every version of an object, newest first. Exposed because "who wrote over
   * this, and when" is the question an auditor asks next, and the answer is in
   * the version history that object-lock guarantees is still there.
   */
  async versions(key: string): Promise<Array<{ versionId: string; lastModified?: Date }>> {
    const listed = await this.client.send(
      new ListObjectVersionsCommand({ Bucket: this.bucket, Prefix: key }),
    );
    return (listed.Versions ?? [])
      .filter((v) => v.Key === key && v.VersionId)
      .map((v) => ({ versionId: v.VersionId!, lastModified: v.LastModified }));
  }

  /** The version whose bytes actually hash to the key, or null if none does. */
  private async authenticVersion(key: string): Promise<Uint8Array | null> {
    for (const { versionId } of await this.versions(key)) {
      const bytes = await this.getVersion(key, versionId);
      if (bytes && evidenceObjectKey(sha256Hex(bytes)) === key) return bytes;
    }
    return null;
  }

  private async getVersion(key: string, versionId?: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId }),
      );
      const body = await result.Body?.transformToByteArray();
      return body ? new Uint8Array(body) : null;
    } catch {
      return null;
    }
  }

  private async head(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

function isPreconditionFailed(err: unknown): boolean {
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const name = (err as { name?: string })?.name;
  return status === 412 || name === "PreconditionFailed";
}
