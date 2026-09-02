import { describe, it, expect, beforeAll } from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectRetentionCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { sha256Hex } from "@agroassure/domain";
import { S3BlobStore } from "../../src/sync/s3-blob-store";
import { evidenceObjectKey } from "../../src/sync/object-key";
import type { AppConfig } from "../../src/config/config";

// The claim this suite exists to test: an exhibit, once uploaded, cannot be
// removed or replaced before its retention expires — not by this application,
// not by an operator holding the storage credentials.
//
// Everywhere else that claim is a comment. Here it is put to a real S3
// implementation with real object-lock, and the delete is actually attempted.
//
//   ENDPOINT=http://127.0.0.1:9000 ... pnpm test:integration
//
// Skipped when no endpoint is configured, so the suite stays runnable without
// standing up storage first.

const ENDPOINT = process.env.EVIDENCE_S3_ENDPOINT;
// A fresh bucket per run, because the objects this suite writes cannot be
// deleted afterwards — which is the property under test.
const BUCKET = `agroassure-evidence-${Date.now()}`;
const ACCESS_KEY = process.env.EVIDENCE_S3_ACCESS_KEY_ID ?? "agroassure";
const SECRET_KEY = process.env.EVIDENCE_S3_SECRET_ACCESS_KEY ?? "agroassure-local-verification";
const RETENTION_YEARS = 7;

const PHOTO = new Uint8Array(
  Array.from({ length: 2048 }, (_, i) => (i * 31 + 7) & 0xff),
);
const REPLACEMENT = new Uint8Array(Array.from({ length: 2048 }, () => 0x41));

function config(): AppConfig {
  return {
    port: 3001,
    databaseUrl: "postgres://unused",
    publicVerifyDatabaseUrl: "postgres://unused",
    publicVerifyUsesOwnRole: false,
    authJwtSecret: "unused",
    oidc: null,
    evidenceStore: "s3",
    evidenceS3: {
      bucket: BUCKET,
      region: "us-east-1",
      endpoint: ENDPOINT ?? null,
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      retentionYears: RETENTION_YEARS,
    },
    evidenceStoreDir: "./evidence-store",
    publicVerifyBaseUrl: "https://verify.example",
    publicVerifyRatePerMinute: 60,
  };
}

describe.skipIf(!ENDPOINT)("evidence under object-lock", () => {
  let store: S3BlobStore;
  let raw: S3Client;
  const key = evidenceObjectKey(sha256Hex(PHOTO));

  beforeAll(async () => {
    raw = new S3Client({
      region: "us-east-1",
      endpoint: ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });

    // Object-lock can only be turned on at creation. A bucket made without it
    // can never be given it, which is why this is not a setting the application
    // can repair later.
    await raw.send(
      new CreateBucketCommand({ Bucket: BUCKET, ObjectLockEnabledForBucket: true }),
    );

    store = new S3BlobStore(config());
  });

  it("stores an exhibit and reports it locked", async () => {
    const result = await store.putIfAbsent(key, PHOTO, "image/jpeg");
    expect(result.locked).toBe(true);
    expect(result.deduplicated).toBe(false);
  });

  it("reads the exact bytes back", async () => {
    const back = await store.get(key);
    expect(back).not.toBeNull();
    expect(sha256Hex(back!)).toBe(sha256Hex(PHOTO));
  });

  it("applied a compliance-mode retention, not merely governance", async () => {
    // Governance mode can be bypassed by a privileged user. Compliance mode
    // cannot, by anyone, which is the only version of this worth claiming.
    const retention = await raw.send(
      new GetObjectRetentionCommand({ Bucket: BUCKET, Key: key }),
    );
    expect(retention.Retention?.Mode).toBe("COMPLIANCE");

    const until = new Date(retention.Retention!.RetainUntilDate!);
    const years = (until.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(RETENTION_YEARS - 0.1);
    expect(years).toBeLessThan(RETENTION_YEARS + 0.1);
  });

  it("REFUSES to destroy the exhibit, even holding the storage credentials", async () => {
    // The claim, actually attempted. Deleting the version is what would destroy
    // the evidence, and compliance mode refuses it.
    const [version] = await store.versions(key);
    await expect(
      raw.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: key, VersionId: version!.versionId }),
      ),
    ).rejects.toThrow();

    const still = await store.get(key);
    expect(sha256Hex(still!)).toBe(sha256Hex(PHOTO));
  });

  it("will not let the application write over an exhibit", async () => {
    // If-None-Match makes the store refuse it, rather than us checking first
    // and hoping nothing happened in between.
    const again = await store.putIfAbsent(key, REPLACEMENT, "image/jpeg");
    expect(again.deduplicated).toBe(true);
    expect(sha256Hex((await store.get(key))!)).toBe(sha256Hex(PHOTO));
  });

  it("recovers the authentic exhibit after a credentialed overwrite", async () => {
    // Object-lock protects a version, not a key: someone with credentials can
    // still PUT a new current version, and a naive GET would return it. The key
    // is the content address, so the read checks itself and falls back to the
    // locked original — which object-lock guaranteed is still there.
    await raw.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: REPLACEMENT }));

    const recovered = await store.get(key);
    expect(recovered).not.toBeNull();
    expect(sha256Hex(recovered!)).toBe(sha256Hex(PHOTO));

    // And the attempt itself is on the record, which is what an auditor needs.
    expect((await store.versions(key)).length).toBeGreaterThan(1);
  });

  it("treats a re-upload of the same exhibit as already stored", async () => {
    const again = await store.putIfAbsent(key, PHOTO, "image/jpeg");
    expect(again.deduplicated).toBe(true);
    expect(again.locked).toBe(true);
  });

  it("reports a missing object as null rather than throwing", async () => {
    expect(await store.get(evidenceObjectKey("0".repeat(64)))).toBeNull();
  });
});
