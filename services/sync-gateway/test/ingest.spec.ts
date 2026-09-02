import { describe, it, expect, beforeEach } from "vitest";
import {
  uuidv7,
  computeEventHash,
  signEventHash,
  derivePublicKey,
  type DeviceEvent,
  type EventSignable,
} from "@agroassure/domain";
import { IngestService } from "../src/sync/ingest.service";
import type { EnrolledDevice, EventStorePort } from "../src/sync/ports";

// A fake event store so the ingest verification logic can be tested with real
// cryptography but no database. It records appends and tracks the chain head.
class FakeStore implements EventStorePort {
  device: EnrolledDevice | null;
  stored = new Map<string, DeviceEvent>();
  head: string | null = null;

  constructor(device: EnrolledDevice | null) {
    this.device = device;
  }
  async getDevice(id: string) {
    return this.device && this.device.id === id ? this.device : null;
  }
  async eventExists(eventId: string) {
    return this.stored.has(eventId);
  }
  async getChainHead() {
    return this.head;
  }
  async appendEvent(event: DeviceEvent) {
    this.stored.set(event.eventId, event);
  }
  async setChainHead(_deviceId: string, hex: string) {
    this.head = hex;
  }
  async latestCursor() {
    return "2026-08-18T09:40:00.000000Z";
  }
}

// Deterministic device keypair for tests.
const priv = new Uint8Array(32);
for (let i = 0; i < 32; i++) priv[i] = (i * 11 + 5) & 0xff;
const pub = derivePublicKey(priv);
const DEVICE_ID = "018f0000-0000-7000-8000-0000000000dd";

function device(status: "active" | "revoked" = "active"): EnrolledDevice {
  return { id: DEVICE_ID, status, publicKey: pub, jurisdictionId: "jx-kt" };
}

// Build a signed, hash-chained device event.
function makeEvent(
  aggregateId: string,
  seq: number,
  eventType: string,
  payload: unknown,
  prevHash: string | null,
): DeviceEvent {
  const signable: EventSignable = {
    eventId: uuidv7(),
    aggregateType: "inspection",
    aggregateId,
    seq,
    eventType,
    payload,
    hlc: `00000000000000${seq}:0000${seq}:device`,
    prevHash,
    deviceId: DEVICE_ID,
    actorUserId: "user-1",
  };
  const eventHash = computeEventHash(signable);
  const deviceSig = signEventHash(eventHash, priv);
  return { ...signable, eventHash, deviceSig };
}

describe("IngestService", () => {
  let store: FakeStore;
  let ingest: IngestService;
  const agg = "018f0000-0000-7000-8000-0000000000a1";

  beforeEach(() => {
    store = new FakeStore(device());
    ingest = new IngestService(store);
  });

  it("accepts a well-formed, well-signed, correctly chained batch", async () => {
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "INS-KT-2026-01184" }, null);
    const e2 = makeEvent(agg, 2, "ResponseRecorded", { checkpointRef: "2.3", response: "no" }, e1.eventHash);

    const result = await ingest.ingest(DEVICE_ID, [e1, e2]);
    expect(result.acked).toEqual([e1.eventId, e2.eventId]);
    expect(store.stored.size).toBe(2);
    expect(store.head).toBe(e2.eventHash);
  });

  it("is idempotent: replaying an already-stored batch acks without duplicating", async () => {
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "INS-KT-2026-01184" }, null);
    await ingest.ingest(DEVICE_ID, [e1]);

    const again = await ingest.ingest(DEVICE_ID, [e1]);
    expect(again.acked).toEqual([e1.eventId]);
    expect(store.stored.size).toBe(1);
  });

  it("accepts a later event after a replayed one (partial resend)", async () => {
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "R" }, null);
    await ingest.ingest(DEVICE_ID, [e1]);
    const e2 = makeEvent(agg, 2, "ResponseRecorded", { checkpointRef: "2.1", response: "yes" }, e1.eventHash);

    const result = await ingest.ingest(DEVICE_ID, [e1, e2]); // e1 replayed, e2 new
    expect(result.acked).toEqual([e1.eventId, e2.eventId]);
    expect(store.stored.size).toBe(2);
  });

  it("rejects a tampered payload (hash mismatch)", async () => {
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "R" }, null);
    const tampered: DeviceEvent = { ...e1, payload: { reference: "CHANGED" } };
    await expect(ingest.ingest(DEVICE_ID, [tampered])).rejects.toThrow();
    expect(store.stored.size).toBe(0);
  });

  it("rejects a forged signature", async () => {
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "R" }, null);
    const forged: DeviceEvent = { ...e1, deviceSig: signEventHashWithOtherKey(e1.eventHash) };
    await expect(ingest.ingest(DEVICE_ID, [forged])).rejects.toThrow();
    expect(store.stored.size).toBe(0);
  });

  it("rejects a broken chain (wrong prevHash)", async () => {
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "R" }, null);
    const e2bad = makeEvent(agg, 2, "ResponseRecorded", { checkpointRef: "2.2", response: "yes" }, "deadbeef");
    await expect(ingest.ingest(DEVICE_ID, [e1, e2bad])).rejects.toThrow();
    // e1 appended before e2 failed; the transaction boundary in production rolls
    // this back. The fake store does not model rollback, so we assert e2 absent.
    expect(store.stored.has(e2bad.eventId)).toBe(false);
  });

  it("refuses a revoked device", async () => {
    store = new FakeStore(device("revoked"));
    ingest = new IngestService(store);
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "R" }, null);
    await expect(ingest.ingest(DEVICE_ID, [e1])).rejects.toThrow();
  });

  it("refuses an unknown device", async () => {
    store = new FakeStore(null);
    ingest = new IngestService(store);
    const e1 = makeEvent(agg, 1, "InspectionStarted", { reference: "R" }, null);
    await expect(ingest.ingest(DEVICE_ID, [e1])).rejects.toThrow();
  });
});

// Sign with a different key to simulate forgery.
function signEventHashWithOtherKey(eventHashHex: string): string {
  const other = new Uint8Array(32);
  for (let i = 0; i < 32; i++) other[i] = (i * 3 + 1) & 0xff;
  return signEventHash(eventHashHex, other);
}
