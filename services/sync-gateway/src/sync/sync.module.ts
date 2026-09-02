import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { IngestService } from "./ingest.service";
import { QueryService } from "./query.service";
import { StorageService } from "./storage.service";
import { PgEventStore } from "./pg-event-store";
import { EVENT_STORE } from "./ports";
import { BLOB_STORE } from "./blob-store.port";
import { LocalBlobStore } from "./local-blob-store";
import { S3BlobStore } from "./s3-blob-store";
import { CONFIG, type AppConfig } from "../config/config";

@Module({
  controllers: [SyncController],
  providers: [
    IngestService,
    QueryService,
    StorageService,
    { provide: EVENT_STORE, useClass: PgEventStore },
    {
      // Chosen once at boot from configuration. The S3 client is only
      // constructed when it is the one in use, so a development machine needs
      // no credentials and a production deployment cannot silently fall back to
      // the filesystem if its bucket is misconfigured — S3BlobStore throws.
      provide: BLOB_STORE,
      inject: [CONFIG],
      useFactory: (config: AppConfig) =>
        config.evidenceStore === "s3" ? new S3BlobStore(config) : new LocalBlobStore(config),
    },
  ],
  exports: [StorageService],
})
export class SyncModule {}
