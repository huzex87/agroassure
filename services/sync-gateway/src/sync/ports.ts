import type { DeviceEvent } from "@agroassure/domain";

// Port for the append-only event store. IngestService depends on this interface
// rather than a concrete database, so its verification logic is unit-testable
// without a live PostgreSQL. The pg-backed implementation lives in pg-event-store.ts.

export interface EnrolledDevice {
  id: string;
  status: "active" | "revoked";
  publicKey: Uint8Array; // ed25519 public key bytes
  jurisdictionId: string;
}

export interface EventStorePort {
  /** Look up an enrolled device by id, or null if unknown. */
  getDevice(deviceId: string): Promise<EnrolledDevice | null>;

  /** True if an event with this id is already stored (idempotency check). */
  eventExists(eventId: string): Promise<boolean>;

  /** The hex of the last accepted event_hash on this device's chain, or null. */
  getChainHead(deviceId: string): Promise<string | null>;

  /** Append one event. Must be idempotent on event_id (ON CONFLICT DO NOTHING). */
  appendEvent(event: DeviceEvent): Promise<void>;

  /** Advance the recorded chain head for a device. */
  setChainHead(deviceId: string, eventHashHex: string): Promise<void>;

  /** A server cursor the device can use for its next pull. */
  latestCursor(): Promise<string>;
}

export const EVENT_STORE = Symbol("EVENT_STORE");
