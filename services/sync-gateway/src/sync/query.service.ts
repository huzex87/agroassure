import { Injectable } from "@nestjs/common";
import { PgService } from "../db/pg.service";

// Read side of sync: server-authored events to pull, and the pre-departure
// bootstrap bundle. These read from projections, never from the event store
// directly for large scans, so ingest is never blocked by a heavy read.

export interface PullResult {
  events: unknown[];
  nextCursor: string;
}

export interface BootstrapBundle {
  facilities: unknown[];
  instrumentVersions: unknown[];
  priorFindings: unknown[];
}

@Injectable()
export class QueryService {
  constructor(private readonly pg: PgService) {}

  // Server-authored events (device_id IS NULL) recorded after the cursor, scoped
  // to the device's jurisdiction through the aggregates the device cares about.
  async pull(jurisdictionId: string | null, since: string): Promise<PullResult> {
    const rows = await this.pg.query<{
      event_id: string;
      aggregate_type: string;
      aggregate_id: string;
      seq: string;
      event_type: string;
      payload: unknown;
      hlc: string;
      recorded_at: string;
    }>(
      `SELECT event_id, aggregate_type, aggregate_id, seq, event_type, payload, hlc,
              to_char(recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at
       FROM event_store
       WHERE device_id IS NULL
         AND recorded_at > $1::timestamptz
       ORDER BY recorded_at ASC, event_id ASC
       LIMIT 200`,
      [since || new Date(0).toISOString()],
    );

    const events = rows.map((r) => ({
      eventId: r.event_id,
      aggregateType: r.aggregate_type,
      aggregateId: r.aggregate_id,
      seq: Number(r.seq),
      eventType: r.event_type,
      payload: r.payload,
      hlc: r.hlc,
      recordedAt: r.recorded_at,
    }));

    const last = rows[rows.length - 1];
    const nextCursor = last ? last.recorded_at : since;
    return { events, nextCursor };
  }

  // Pre-departure bundle: after this the field app needs no network for the day.
  async bootstrap(userId: string, jurisdictionId: string | null): Promise<BootstrapBundle> {
    const facilities = await this.pg.query(
      `SELECT id, licence_number, facility_type, name, address, lga,
              ST_Y(registered_point::geometry) AS reg_lat,
              ST_X(registered_point::geometry) AS reg_lng,
              registered_accuracy_m
       FROM facility
       WHERE ($1::uuid IS NULL OR jurisdiction_id = $1)`,
      [jurisdictionId],
    );

    const instrumentVersions = await this.pg.query(
      `SELECT iv.id, iv.instrument_id, i.facility_type, iv.version_label,
              iv.satisfactory_min, iv.needs_improve_min, encode(iv.structure_hash, 'hex') AS structure_hash
       FROM instrument_version iv
       JOIN instrument i ON i.id = iv.instrument_id
       WHERE iv.status = 'in_force'
         AND ($1::uuid IS NULL OR i.jurisdiction_id = $1)`,
      [jurisdictionId],
    );

    const priorFindings = await this.pg.query(
      `SELECT f.id, f.reference, f.inspection_id, f.summary, f.severity, f.status, f.due_date,
              insp.facility_id
       FROM finding f
       JOIN inspection insp ON insp.id = f.inspection_id
       JOIN facility fac ON fac.id = insp.facility_id
       WHERE f.status <> 'closed'
         AND ($1::uuid IS NULL OR fac.jurisdiction_id = $1)`,
      [jurisdictionId],
    );

    return { facilities, instrumentVersions, priorFindings };
  }
}
