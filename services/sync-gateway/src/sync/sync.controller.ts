import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { DeviceAuthGuard, getPrincipal } from "../common/device-auth.guard";
import { base64ToBytes } from "@agroassure/domain";
import { IngestService } from "./ingest.service";
import { QueryService } from "./query.service";
import { StorageService } from "./storage.service";
import { ProjectorService } from "../projections/projector.service";
import type { PushEventsDto, UploadEvidenceDto } from "./dto/push-events.dto";
import type { PullQueryDto } from "./dto/pull-query.dto";

// The field-app sync surface. Every route requires a valid device/human token.

@Controller("v1/sync")
@UseGuards(DeviceAuthGuard)
export class SyncController {
  constructor(
    private readonly ingest: IngestService,
    private readonly queries: QueryService,
    private readonly storage: StorageService,
    private readonly projector: ProjectorService,
  ) {}

  // Push a batch of device-signed events. Idempotent on event_id.
  @Post("events")
  @HttpCode(200)
  async pushEvents(@Req() req: Request, @Body() body: PushEventsDto) {
    const principal = getPrincipal(req);
    // A device token may only push for its own device.
    if (principal.deviceId && principal.deviceId !== body.deviceId) {
      throw new ForbiddenException("device id does not match token");
    }
    const result = await this.ingest.ingest(body.deviceId, body.events);
    // Bring read models up to date before acking, so a supervisor refreshing the
    // console the moment an inspector syncs sees the inspection, not a gap.
    await this.projector.applyPending();
    return {
      acked: result.acked,
      rejected: result.rejected,
      server_cursor: result.serverCursor,
    };
  }

  // Upload one evidence file. The server recomputes the checksum and refuses a
  // mismatch, then stores the bytes write-once (object-locked in production).
  @Post("evidence")
  @HttpCode(200)
  async uploadEvidence(@Body() body: UploadEvidenceDto) {
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(body.contentBase64);
    } catch {
      throw new UnprocessableEntityException("invalid base64 content");
    }
    try {
      const stored = await this.storage.store(body.sha256, bytes);
      // The capture event already recorded the exhibit and its content address.
      // This marks the moment the bytes themselves became immutable in storage.
      await this.storage.markLocked(body.evidenceId, stored.objectKey);
      return {
        evidence_id: body.evidenceId,
        object_key: stored.objectKey,
        sha256: stored.sha256,
        locked: stored.locked,
        deduplicated: stored.deduplicated,
      };
    } catch (err) {
      throw new UnprocessableEntityException(
        err instanceof Error ? err.message : "evidence rejected",
      );
    }
  }

  // Pull server-authored events (decisions, escalations, registry updates).
  @Get("pull")
  async pull(@Req() req: Request, @Query() query: PullQueryDto) {
    const principal = getPrincipal(req);
    const result = await this.queries.pull(
      principal.jurisdictionId,
      query.since ?? "",
    );
    return { events: result.events, next_cursor: result.nextCursor };
  }

  // Pre-departure bundle: assigned facilities, in-force instruments, prior findings.
  @Post("bootstrap")
  @HttpCode(200)
  async bootstrap(@Req() req: Request) {
    const principal = getPrincipal(req);
    return this.queries.bootstrap(principal.userId, principal.jurisdictionId);
  }
}
