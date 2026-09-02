import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import {
  computeEventHash,
  hlcCompare,
  verifyEventSignature,
  type DeviceEvent,
} from "@agroassure/domain";
import { EVENT_STORE, type EventStorePort } from "./ports";

export interface IngestResult {
  acked: string[];
  rejected: string[];
  serverCursor: string;
}

// The heart of the sync gateway. For each pushed event it verifies the hash,
// the device signature, and chain continuity, then appends idempotently. It
// never rejects a well-formed, well-signed event on business grounds: a finding
// is a finding even when inconvenient. A broken chain or bad signature rejects
// the whole batch and flags the device, rather than accepting a corrupt log.

@Injectable()
export class IngestService {
  private readonly logger = new Logger("Ingest");

  constructor(@Inject(EVENT_STORE) private readonly store: EventStorePort) {}

  async ingest(deviceId: string, events: DeviceEvent[]): Promise<IngestResult> {
    const device = await this.store.getDevice(deviceId);
    if (!device) throw new ForbiddenException("unknown device");
    if (device.status !== "active") throw new ForbiddenException("device is not active");

    // The hash chain is per device, not per aggregate: an inspector's day
    // interleaves inspection and finding events on one chain, so prev_hash
    // continuity only holds in authoring order. The HLC stamp is monotonic per
    // device, so sorting by it restores the device's own order even when a
    // batch arrives shuffled. Sorting by aggregate here would break the chain.
    const ordered = [...events].sort((a, b) => hlcCompare(a.hlc, b.hlc));

    const acked: string[] = [];
    let head = await this.store.getChainHead(deviceId); // hex or null

    for (const e of ordered) {
      // Idempotent replay: an already-stored event is acked and skipped. The
      // chain head already reflects it, so we do not re-check or re-advance.
      if (await this.store.eventExists(e.eventId)) {
        acked.push(e.eventId);
        continue;
      }

      // 1. hash integrity: the claimed hash must match the canonical bytes
      const recomputed = computeEventHash(e);
      if (recomputed !== e.eventHash) {
        this.flag(deviceId, e, "hash mismatch");
        throw new ConflictException({ reason: "hash", eventId: e.eventId });
      }

      // 2. authenticity: the device signature must verify over the hash
      if (!verifyEventSignature(e.eventHash, e.deviceSig, device.publicKey)) {
        this.flag(deviceId, e, "signature invalid");
        throw new ConflictException({ reason: "sig", eventId: e.eventId });
      }

      // 3. chain continuity: prevHash must equal the current head
      if ((e.prevHash ?? null) !== (head ?? null)) {
        this.flag(deviceId, e, "chain break");
        throw new ConflictException({ reason: "chain", eventId: e.eventId });
      }

      // 4. idempotent append, then advance the local head
      await this.store.appendEvent(e);
      head = e.eventHash;
      acked.push(e.eventId);
    }

    if (head !== null) await this.store.setChainHead(deviceId, head);
    const serverCursor = await this.store.latestCursor();
    return { acked, rejected: [], serverCursor };
  }

  private flag(deviceId: string, e: DeviceEvent, reason: string): void {
    // In production this raises a security alert and marks the device for
    // supervisor review. Here it logs; the batch is rejected by the caller.
    this.logger.warn(`device ${deviceId} event ${e.eventId} rejected: ${reason}`);
  }
}
