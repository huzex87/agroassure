import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { CONFIG, type AppConfig } from "../config/config";
import type { BlobStore, PutResult } from "./blob-store.port";

// Evidence under object-lock.
//
// This is the store that makes "an exhibit cannot be replaced after submission"
// a property of the storage rather than a rule this application politely
// follows. The bucket must be created with versioning and object-lock enabled —
// object-lock cannot be turned on afterwards — and the retention below is
// applied per object in COMPLIANCE mode, which means no one can shorten or
// remove it before it expires. Not the operator, not the account root user, not
// the regulator, and not this code.
//
// The bucket policy should also deny s3:PutObject where the object already
// exists is not expressible in S3, so write-once is enforced here by checking
// first and by the content address itself: the same key can only ever hold the
// same bytes, because the key is the SHA-256 of those bytes.

@Injectable()
export class S3BlobStore implements BlobStore {
  private readonly logger = new Logger("S3BlobStore");
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly retentionYears: number;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
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

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // Sent to S3 so it verifies the transfer itself and rejects a corrupted
        // upload. The value is the content address, so this is the same hash the
        // device computed at the shutter and the gateway re-computed on arrival.
        ChecksumSHA256: Buffer.from(key.split("/").pop() ?? "", "hex").toString("base64"),
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil,
      }),
    );

    this.logger.log(`stored ${key} (${bytes.length} bytes), retained until ${retainUntil.toISOString().slice(0, 10)}`);
    return { deduplicated: false, locked: true };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
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
