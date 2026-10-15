import type { BootstrapBundle, DeviceEvent } from "@agroassure/domain";
import { toDeviceEvent } from "./outbox";
import type { FieldStore } from "./sqlite";

export type { BootstrapBundle };

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
  readFile(localUri: string): Promise<Uint8Array>;
}

export interface DrainResult {
  eventsPushed: number;
  evidenceUploaded: number;
  eventsPulled: number;
  blocked?: string;
}

const PULL_CURSOR = "server";
const PUSH_BATCH = 100;

/** Apply the pre-departure bundle. After this the day needs no network. */
export function applyBootstrap(store: FieldStore, bundle: BootstrapBundle): void {
  if (bundle.jurisdictionCode) {
    store.setJurisdictionCode(bundle.jurisdictionCode);
  }
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

  for (;;) {
    const pending = store.pendingEvents(PUSH_BATCH);
    if (pending.length === 0) break;

    let ack: PushAck;
    try {
      ack = await deps.transport.pushEvents(deviceId, pending.map(toDeviceEvent));
    } catch (err) {
      result.blocked = err instanceof Error ? err.message : String(err);
      return result;
    }

    store.markAcked(ack.acked);
    result.eventsPushed += ack.acked.length;
    store.setCursor(PULL_CURSOR, ack.serverCursor || store.cursor(PULL_CURSOR) || "");

    if (ack.acked.length === 0) {
      result.blocked = "the server acknowledged nothing in this batch";
      return result;
    }
    if (pending.length < PUSH_BATCH) break;
  }

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
      // Leave pending.
    }
  }

  try {
    const since = store.cursor(PULL_CURSOR) ?? "";
    const pulled = await deps.transport.pull(since);
    for (const event of pulled.events) applyServerEvent(store, event);
    if (pulled.nextCursor) store.setCursor(PULL_CURSOR, pulled.nextCursor);
    result.eventsPulled = pulled.events.length;
  } catch {
    // Cursor unchanged.
  }

  return result;
}

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
