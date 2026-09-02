import { Injectable } from "@nestjs/common";
import type { DeviceEvent } from "@agroassure/domain";
import { hexToBytes } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import type { EnrolledDevice, EventStorePort } from "./ports";

// PostgreSQL-backed event store. Append is idempotent on event_id. The database
// blocks UPDATE and DELETE on event_store via triggers, so this class only ever
// inserts. Hashes are stored as bytea; hex is used at the boundary.

@Injectable()
export class PgEventStore implements EventStorePort {
  constructor(private readonly pg: PgService) {}

  async getDevice(deviceId: string): Promise<EnrolledDevice | null> {
    const rows = await this.pg.query<{
      id: string;
      status: string;
      public_key: Buffer;
      jurisdiction_id: string;
    }>(
      `SELECT id, status, public_key, jurisdiction_id
       FROM device WHERE id = $1`,
      [deviceId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status === "active" ? "active" : "revoked",
      publicKey: new Uint8Array(row.public_key),
      jurisdictionId: row.jurisdiction_id,
    };
  }

  async eventExists(eventId: string): Promise<boolean> {
    const rows = await this.pg.query<{ one: number }>(
      `SELECT 1 AS one FROM event_store WHERE event_id = $1`,
      [eventId],
    );
    return rows.length > 0;
  }

  async getChainHead(deviceId: string): Promise<string | null> {
    const rows = await this.pg.query<{ last_event_hash: Buffer | null }>(
      `SELECT last_event_hash FROM device_chain_head WHERE device_id = $1`,
      [deviceId],
    );
    const head = rows[0]?.last_event_hash ?? null;
    return head ? head.toString("hex") : null;
  }

  async appendEvent(event: DeviceEvent): Promise<void> {
    await this.pg.query(
      `INSERT INTO event_store
         (event_id, aggregate_type, aggregate_id, seq, event_type, payload,
          actor_user_id, device_id, hlc, prev_hash, event_hash, device_sig)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.aggregateType,
        event.aggregateId,
        event.seq,
        event.eventType,
        JSON.stringify(event.payload),
        event.actorUserId,
        event.deviceId,
        event.hlc,
        event.prevHash ? Buffer.from(hexToBytes(event.prevHash)) : null,
        Buffer.from(hexToBytes(event.eventHash)),
        Buffer.from(event.deviceSig, "base64"),
      ],
    );
  }

  async setChainHead(deviceId: string, eventHashHex: string): Promise<void> {
    await this.pg.query(
      `INSERT INTO device_chain_head (device_id, last_event_hash, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (device_id)
       DO UPDATE SET last_event_hash = EXCLUDED.last_event_hash, updated_at = now()`,
      [deviceId, Buffer.from(hexToBytes(eventHashHex))],
    );
  }

  async latestCursor(): Promise<string> {
    const rows = await this.pg.query<{ cursor: string | null }>(
      `SELECT to_char(max(recorded_at), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor
       FROM event_store`,
    );
    return rows[0]?.cursor ?? new Date(0).toISOString();
  }
}
