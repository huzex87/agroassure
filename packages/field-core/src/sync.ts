import type { DeviceEvent } from "@agroassure/domain";
import { toDeviceEvent } from "./outbox";
import type { AssignedFacility, FieldStore, LocalInstrumentVersion } from "./sqlite";

// The queue drains when a signal returns. Nothing is fetched during the day and
// nothing is lost while there is no network: the outbox is the record until the
// server acknowledges it, and every step here is safe to repeat, because ingest
// is idempotent by event id and evidence is content-addressed.

export interface BootstrapBundle {
  facilities: AssignedFacility[];
  instrumentVersions: LocalInstrumentVersion[];
  priorFindings: Array<{
    id: string;
    facilityId: string;
    reference: string;
    summary: string;
    severity: string;
    status: string;
    dueDate: string | null;
  }>;
}

export interface PushAck {
  acked: string[];
  rejected: string[];
  serverCursor: string;
}

export interface PulledEvent {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface SyncTransport {
  pushEvents(deviceId: string, events: DeviceEvent[]): Promise<PushAck>;
  uploadEvidence(input: {
    evidenceId: string;
    sha256: string;
    mime: string;
    bytes: Uint8Array;
  }): Promise<{ locked: boolean }>;
  pull(since: string): Promise<{ events: PulledEvent[]; nextCursor: string }>;
}

export interface DrainDeps {
  transport: SyncTransport;
  /** Read an exhibit's bytes back off the device for upload. */
  readFile(localUri: string): Promise<Uint8Array>;
}

export interface DrainResult {
  eventsPushed: number;
  evidenceUploaded: number;
  eventsPulled: number;
  /**
   * Set when the server refused the chain. The device stops pushing and the
   * inspector is told to contact their supervisor; retrying a rejected chain
   * would only repeat the rejection, and the events stay queued and intact.
   */
  blocked?: string;
}

const PULL_CURSOR = "server";
const PUSH_BATCH = 100;

/** Apply the pre-departure bundle. After this the day needs no network. */
export function applyBootstrap(store: FieldStore, bundle: BootstrapBundle): void {
  store.replaceAssignedFacilities(bundle.facilities);
  store.replaceInstrumentVersions(bundle.instrumentVersions);
  store.replacePriorFindings(bundle.priorFindings);
}

export async function drain(
  store: FieldStore,
  deviceId: string,
  deps: DrainDeps,
): Promise<DrainResult> {
  const result: DrainResult = { eventsPushed: 0, evidenceUploaded: 0, eventsPulled: 0 };

  // 1. Push events in authoring order. The chain only verifies in that order,
  //    and a partial push is safe: whatever was acked is durable, and the rest
  //    goes next time.
  for (;;) {
    const pending = store.pendingEvents(PUSH_BATCH);
    if (pending.length === 0) break;

    let ack: PushAck;
    try {
      ack = await deps.transport.pushEvents(deviceId, pending.map(toDeviceEvent));
    } catch (err) {
      // A refused batch is not a lost batch. The rows stay pending.
      result.blocked = err instanceof Error ? err.message : String(err);
      return result;
    }

    store.markAcked(ack.acked);
    result.eventsPushed += ack.acked.length;
    store.setCursor(PULL_CURSOR, ack.serverCursor || store.cursor(PULL_CURSOR) || "");

    // No progress means pushing again would send the same rows: stop rather
    // than spin.
    if (ack.acked.length === 0) {
      result.blocked = "the server acknowledged nothing in this batch";
      return result;
    }
    if (pending.length < PUSH_BATCH) break;
  }

  // 2. Upload the bytes behind each exhibit. The event carrying the hash is
  //    already stored, so the server can refuse anything that does not match it.
  for (const evidence of store.pendingEvidence()) {
    try {
      const bytes = await deps.readFile(evidence.localUri);
      const stored = await deps.transport.uploadEvidence({
        evidenceId: evidence.evidenceId,
        sha256: evidence.sha256,
        mime: evidence.mime,
        bytes,
      });
      if (stored.locked) {
        store.markEvidenceUploaded(evidence.evidenceId);
        result.evidenceUploaded += 1;
      }
    } catch {
      // Leave it pending. An exhibit that has not uploaded is visible as such,
      // and the next drain picks it up.
    }
  }

  // 3. Pull what the server has decided since last time.
  try {
    const since = store.cursor(PULL_CURSOR) ?? "";
    const pulled = await deps.transport.pull(since);
    for (const event of pulled.events) applyServerEvent(store, event);
    if (pulled.nextCursor) store.setCursor(PULL_CURSOR, pulled.nextCursor);
    result.eventsPulled = pulled.events.length;
  } catch {
    // A failed pull costs nothing: the cursor has not moved.
  }

  return result;
}

/**
 * Server-authored events the device cares about. It keeps only what changes
 * what an inspector sees in the field — chiefly whether a prior finding is
 * still outstanding at the facility they are about to visit.
 */
function applyServerEvent(store: FieldStore, event: PulledEvent): void {
  if (event.aggregateType !== "finding") return;
  switch (event.eventType) {
    case "FindingBecameOverdue":
      return store.updatePriorFindingStatus(event.aggregateId, "overdue");
    case "FindingEscalated":
      return store.updatePriorFindingStatus(event.aggregateId, "escalated");
    case "FindingClosureSubmitted":
      return store.updatePriorFindingStatus(event.aggregateId, "awaiting_verification");
    case "FindingClosed":
      return store.updatePriorFindingStatus(event.aggregateId, "closed");
    default:
      return;
  }
}
