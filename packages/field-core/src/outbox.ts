import {
  computeEventHash,
  decode as decodeHlc,
  hlcInit,
  hlcSend,
  uuidv7,
  type AggregateType,
  type DeviceEvent,
  type EventSignable,
  type HlcState,
} from "@agroassure/domain";
import type { FieldStore } from "./sqlite";

// Authoring an event. Every response, remark, capture, and signature becomes an
// immutable, signed, hash-chained row in the outbox before anything else
// happens, so an inspection survives the app being killed mid-visit and needs
// no network to be real.
//
// Once written, an outbox row is never edited: sync_state moves from 'pending'
// to 'acked' and nothing else changes. A correction is a later event, sitting
// next to what it corrects rather than on top of it.

/**
 * Signing is a port because the device's private key lives in the Android
 * Keystore and never leaves it, so the signature comes back from a native call.
 * Tests supply an ed25519 signer from the domain package instead.
 */
export interface Signer {
  deviceId: string;
  sign(eventHashHex: string): string | Promise<string>;
}

export interface AuthorOptions {
  actorUserId: string;
  /** Injectable for tests; the device clock in production, drift and all. */
  now?: () => number;
}

export class EventAuthor {
  private readonly now: () => number;

  constructor(
    private readonly store: FieldStore,
    private readonly signer: Signer,
    private readonly options: AuthorOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Author one event onto this device's chain and queue it for sync.
   *
   * The clock is a hybrid logical clock resumed from the last event in the
   * outbox, so a restart never rewinds it and a device whose wall clock is
   * wrong still produces a causally ordered log. The stamp is what the server
   * uses to reconstruct authoring order, which is the order the chain must be
   * verified in.
   */
  async author(
    aggregateType: AggregateType,
    aggregateId: string,
    eventType: string,
    payload: unknown,
  ): Promise<DeviceEvent> {
    const seq = this.store.nextSeq(aggregateType, aggregateId);
    const prevHash = this.store.chainHead();
    const { stamp } = hlcSend(this.resumeClock(), this.now());

    const signable: EventSignable = {
      eventId: uuidv7(this.now()),
      aggregateType,
      aggregateId,
      seq,
      eventType,
      payload,
      hlc: stamp,
      prevHash,
      deviceId: this.signer.deviceId,
      actorUserId: this.options.actorUserId,
    };

    const eventHash = computeEventHash(signable);
    const deviceSig = await this.signer.sign(eventHash);
    const event: DeviceEvent = { ...signable, eventHash, deviceSig };

    this.store.appendOutbox({
      event_id: event.eventId,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      seq: event.seq,
      event_type: event.eventType,
      payload_json: JSON.stringify(event.payload),
      hlc: event.hlc,
      prev_hash: event.prevHash,
      event_hash: event.eventHash,
      device_sig: event.deviceSig,
      actor_user_id: event.actorUserId,
      device_id: this.signer.deviceId,
      createdAt: new Date(this.now()).toISOString(),
    });

    return event;
  }

  /** Continue the clock from the last authored event, or start a fresh one. */
  private resumeClock(): HlcState {
    const last = this.store.lastHlc();
    if (!last) return hlcInit(this.signer.deviceId);
    const { physical, counter } = decodeHlc(last);
    return { physical, counter, nodeId: this.signer.deviceId };
  }
}

/** Rebuild a wire event from an outbox row, for pushing. */
export function toDeviceEvent(row: {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  seq: number;
  event_type: string;
  payload_json: string;
  hlc: string;
  prev_hash: string | null;
  event_hash: string;
  device_sig: string;
  actor_user_id: string | null;
  device_id: string;
}): DeviceEvent {
  return {
    eventId: row.event_id,
    aggregateType: row.aggregate_type as AggregateType,
    aggregateId: row.aggregate_id,
    seq: row.seq,
    eventType: row.event_type,
    payload: JSON.parse(row.payload_json),
    hlc: row.hlc,
    prevHash: row.prev_hash,
    deviceId: row.device_id,
    actorUserId: row.actor_user_id,
    eventHash: row.event_hash,
    deviceSig: row.device_sig,
  };
}
