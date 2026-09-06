import { BadRequestException } from "@nestjs/common";
import type { DeviceEvent } from "@agroassure/domain";
import { boundedArray, hex, requiredString, uuid } from "../../common/validate";

// Wire shapes for the sync surface.
//
// These were interfaces, and interfaces are erased at compile time. So the
// global ValidationPipe had nothing to validate against and every one of these
// bodies reached the service layer exactly as it arrived: a batch with no
// `events` array crashed on the spread, an event with no `hlc` crashed inside
// the comparator, and both came back as a 500 from a handset that had simply
// sent the wrong thing.
//
// The cryptographic checks in ingest are still what matter — this only
// guarantees the fields those checks dereference are present and are the right
// kind of thing, so a malformed batch is a 400 naming the field rather than a
// stack trace. Parsing here, not decorating: the console surface already
// validates this way and one idiom is easier to trust than two.

/** A batch is bounded because it is read wholly into memory and hashed one by one. */
const MAX_EVENTS_PER_PUSH = 500;

export interface PushEventsDto {
  deviceId: string;
  events: DeviceEvent[];
}

export interface UploadEvidenceDto {
  evidenceId: string;
  sha256: string; // hex, declared by the device; the server recomputes it
  mime: string;
  contentBase64: string; // skeleton transport; production streams multipart
}

function asRecord(field: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * The fields ingest dereferences before it can decide anything: it sorts on
 * `hlc`, re-hashes over the signable fields, and verifies `deviceSig` against
 * `eventHash`. The payload stays unknown on purpose — its shape is the event
 * type's business, and the hash covers it either way.
 */
function parseEvent(value: unknown, index: number): DeviceEvent {
  const at = `events[${index}]`;
  const e = asRecord(at, value);

  return {
    eventId: uuid(`${at}.eventId`, e.eventId),
    aggregateType: requiredString(`${at}.aggregateType`, e.aggregateType, 40) as DeviceEvent["aggregateType"],
    aggregateId: uuid(`${at}.aggregateId`, e.aggregateId),
    seq: parseSeq(`${at}.seq`, e.seq),
    eventType: requiredString(`${at}.eventType`, e.eventType, 80),
    payload: e.payload,
    hlc: requiredString(`${at}.hlc`, e.hlc, 120),
    // Null is meaningful, not missing: it is what the first event on a device's
    // chain carries, and ingest compares it against a null head.
    prevHash: e.prevHash === null || e.prevHash === undefined ? null : hex(`${at}.prevHash`, e.prevHash, 64),
    deviceId: e.deviceId === null || e.deviceId === undefined ? null : uuid(`${at}.deviceId`, e.deviceId),
    actorUserId:
      e.actorUserId === null || e.actorUserId === undefined ? null : uuid(`${at}.actorUserId`, e.actorUserId),
    eventHash: hex(`${at}.eventHash`, e.eventHash, 64),
    deviceSig: requiredString(`${at}.deviceSig`, e.deviceSig, 200),
  };
}

function parseSeq(field: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${field} must be a whole number of 1 or more`);
  }
  return value;
}

export function parsePushEvents(body: unknown): PushEventsDto {
  const b = asRecord("body", body);
  return {
    deviceId: uuid("deviceId", b.deviceId),
    events: boundedArray("events", b.events, MAX_EVENTS_PER_PUSH).map(parseEvent),
  };
}

export function parseUploadEvidence(body: unknown): UploadEvidenceDto {
  const b = asRecord("body", body);
  return {
    evidenceId: uuid("evidenceId", b.evidenceId),
    sha256: hex("sha256", b.sha256, 64),
    mime: requiredString("mime", b.mime, 120),
    contentBase64: requiredString("contentBase64", b.contentBase64, 40_000_000),
  };
}
