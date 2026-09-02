import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import {
  computeEventHash,
  hexToBytes,
  hlcInit,
  hlcSend,
  uuidv7,
  type AggregateType,
  type HlcState,
} from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { ProjectorService } from "../projections/projector.service";

// Server-authored events: officer decisions, escalations, registry edits,
// certificate authorisations. They are appended by the application tier, so
// they carry no device signature; their attribution is the verified principal
// the gateway resolved from the bearer token, recorded in actor_user_id.
//
// prev_hash is null: the hash chain is a per-device tamper-evidence mechanism
// for field authorship. Server events are append-only in the same table and are
// protected by the same triggers, and their integrity rests on the fact that no
// application role holds UPDATE or DELETE on event_store.

export interface AppendRequest {
  aggregateType: AggregateType;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  actorUserId: string | null;
}

@Injectable()
export class EventAppender {
  private hlc: HlcState = hlcInit("server");

  constructor(
    private readonly pg: PgService,
    private readonly projector: ProjectorService,
  ) {}

  /** Append one server event and bring projections up to date. */
  async append(req: AppendRequest): Promise<string> {
    const eventId = await this.pg.transaction((client) => this.appendIn(client, req));
    await this.projector.applyPending();
    return eventId;
  }

  /** Append several events atomically, then bring projections up to date. */
  async appendAll(reqs: AppendRequest[]): Promise<string[]> {
    const ids = await this.pg.transaction(async (client) => {
      const out: string[] = [];
      for (const r of reqs) out.push(await this.appendIn(client, r));
      return out;
    });
    await this.projector.applyPending();
    return ids;
  }

  private async appendIn(client: PoolClient, req: AppendRequest): Promise<string> {
    // Serialise appends per aggregate so two concurrent commands cannot mint the
    // same seq and collide on the (aggregate_type, aggregate_id, seq) unique key.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${req.aggregateType}:${req.aggregateId}`,
    ]);

    const next = await client.query<{ seq: string }>(
      `SELECT coalesce(max(seq), 0) + 1 AS seq FROM event_store
       WHERE aggregate_type = $1 AND aggregate_id = $2`,
      [req.aggregateType, req.aggregateId],
    );
    const seq = Number(next.rows[0]?.seq ?? 1);

    const eventId = uuidv7();
    const sent = hlcSend(this.hlc);
    this.hlc = sent.state;

    const signable = {
      eventId,
      aggregateType: req.aggregateType,
      aggregateId: req.aggregateId,
      seq,
      eventType: req.eventType,
      payload: req.payload,
      hlc: sent.stamp,
      prevHash: null,
      deviceId: null,
      actorUserId: req.actorUserId,
    };
    const eventHash = computeEventHash(signable);

    await client.query(
      `INSERT INTO event_store
         (event_id, aggregate_type, aggregate_id, seq, event_type, payload,
          actor_user_id, device_id, hlc, prev_hash, event_hash, device_sig)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NULL,$8,NULL,$9,NULL)`,
      [
        eventId,
        req.aggregateType,
        req.aggregateId,
        seq,
        req.eventType,
        JSON.stringify(req.payload),
        req.actorUserId,
        sent.stamp,
        Buffer.from(hexToBytes(eventHash)),
      ],
    );

    return eventId;
  }
}
