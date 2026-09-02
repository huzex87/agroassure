import { describe, it, expect } from "vitest";
import {
  computeEventHash,
  derivePublicKey,
  signEventHash,
  uuidv7,
  type DeviceEvent,
  type EventSignable,
} from "@agroassure/domain";
import { IngestService } from "../src/sync/ingest.service";
import type { EnrolledDevice, EventStorePort } from "../src/sync/ports";

// The hash chain is per device, not per aggregate. An inspector's day produces
// inspection events and finding events on one chain, interleaved in authoring
// order, so prev_hash continuity only holds in that order. This is the guard
// for it: a batch that mixes aggregates must still ingest, and a batch that
// really is out of order must still be refused.

const priv = new Uint8Array(32);
for (let i = 0; i < 32; i++) priv[i] = (i * 7 + 3) & 0xff;
const pub = derivePublicKey(priv);
const DEVICE_ID = "018f0000-0000-7000-8000-0000000000dd";

// Two aggregates whose ids sort in the opposite direction to authoring order,
// so a sort by aggregate id would visibly break the chain.
const INSPECTION = "018f0000-0000-7000-8000-0000000000bb";
const FINDING = "018f0000-0000-7000-8000-0000000000aa";

class FakeStore implements EventStorePort {
  stored = new Map<string, DeviceEvent>();
  head: string | null = null;
  async getDevice(id: string): Promise<EnrolledDevice | null> {
    return id === DEVICE_ID
      ? { id: DEVICE_ID, status: "active", publicKey: pub, jurisdictionId: "jx" }
      : null;
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

/** Author the next event on this device's chain. `tick` is the HLC position. */
function author(
  aggregateType: "inspection" | "finding",
  aggregateId: string,
  seq: number,
  tick: number,
  prevHash: string | null,
): DeviceEvent {
  const signable: EventSignable = {
    eventId: uuidv7(),
    aggregateType,
    aggregateId,
    seq,
    eventType: aggregateType === "inspection" ? "ResponseRecorded" : "FindingRaised",
    payload: { tick },
    hlc: `${String(tick).padStart(15, "0")}:00000:device`,
    prevHash,
    deviceId: DEVICE_ID,
    actorUserId: "018f0000-0000-7000-8000-000000000001",
  };
  const eventHash = computeEventHash(signable);
  return { ...signable, eventHash, deviceSig: signEventHash(eventHash, priv) };
}

/** A day's chain: response, finding, response, finding, across two aggregates. */
function aDaysChain(): DeviceEvent[] {
  const chain: DeviceEvent[] = [];
  let prev: string | null = null;
  const steps: Array<["inspection" | "finding", string, number]> = [
    ["inspection", INSPECTION, 1],
    ["finding", FINDING, 1],
    ["inspection", INSPECTION, 2],
    ["finding", FINDING, 2],
    ["inspection", INSPECTION, 3],
  ];
  steps.forEach(([type, id, seq], i) => {
    const e = author(type, id, seq, i + 1, prev);
    prev = e.eventHash;
    chain.push(e);
  });
  return chain;
}

describe("ingest: chain continuity across interleaved aggregates", () => {
  it("accepts a batch that interleaves two aggregates on one device chain", async () => {
    const store = new FakeStore();
    const chain = aDaysChain();

    const result = await new IngestService(store).ingest(DEVICE_ID, chain);

    expect(result.acked).toHaveLength(chain.length);
    expect(store.stored.size).toBe(chain.length);
    expect(store.head).toBe(chain[chain.length - 1]!.eventHash);
  });

  it("restores authoring order from the HLC when a batch arrives shuffled", async () => {
    const store = new FakeStore();
    const chain = aDaysChain();
    // Transport, retries, and a client that batches per aggregate can all
    // deliver these in a different order than they were authored.
    const shuffled = [chain[3]!, chain[0]!, chain[4]!, chain[1]!, chain[2]!];

    const result = await new IngestService(store).ingest(DEVICE_ID, shuffled);

    expect(result.acked).toHaveLength(chain.length);
    expect(store.head).toBe(chain[chain.length - 1]!.eventHash);
  });

  it("still refuses a genuine chain break", async () => {
    const store = new FakeStore();
    const chain = aDaysChain();
    const broken = [...chain];
    broken[2] = author("inspection", INSPECTION, 2, 3, "deadbeef");

    await expect(new IngestService(store).ingest(DEVICE_ID, broken)).rejects.toThrow();
  });

  it("still refuses a gap: an event whose predecessor was never sent", async () => {
    const store = new FakeStore();
    const chain = aDaysChain();

    // Skip the first event. The second links to a hash the server has never seen.
    await expect(new IngestService(store).ingest(DEVICE_ID, chain.slice(1))).rejects.toThrow();
    expect(store.stored.size).toBe(0);
  });
});
