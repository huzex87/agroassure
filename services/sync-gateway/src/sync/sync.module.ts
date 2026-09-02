import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { IngestService } from "./ingest.service";
import { QueryService } from "./query.service";
import { StorageService } from "./storage.service";
import { PgEventStore } from "./pg-event-store";
import { EVENT_STORE } from "./ports";

@Module({
  controllers: [SyncController],
  providers: [
    IngestService,
    QueryService,
    StorageService,
    { provide: EVENT_STORE, useClass: PgEventStore },
  ],
})
export class SyncModule {}
