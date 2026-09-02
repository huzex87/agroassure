import { Injectable } from "@nestjs/common";
import type {
  AssignedFacility,
  BootstrapBundle,
  BootstrapInstrumentVersion,
  BootstrapPriorFinding,
  InstrumentStructure,
} from "@agroassure/domain";
import { PgService } from "../db/pg.service";

// Read side of sync: server-authored events to pull, and the pre-departure
// bootstrap bundle. These read from projections, never from the event store
// directly for large scans, so ingest is never blocked by a heavy read.

export interface PullResult {
  events: unknown[];
  nextCursor: string;
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

  /**
   * The pre-departure bundle. Its shape is BootstrapBundle from the shared
   * domain, which the field app consumes, so a field renamed or left out here
   * is a build error rather than an empty checklist in a warehouse with no
   * signal.
   *
   * The instrument arrives whole — every section and checkpoint, in both
   * languages, with its weights — because the device has to render and score
   * the form with no network. Sending only the version label would leave an
   * inspector holding an app that knows which form to use and not what is on it.
   */
  async bootstrap(userId: string, jurisdictionId: string | null): Promise<BootstrapBundle> {
    // Today's list: what this inspector has been assigned, with the reason the
    // supervisor scheduled it travelling alongside (principle P6).
    const facilities = await this.pg.query<{
      id: string;
      licence_number: string;
      facility_type: string;
      name: string;
      lga: string | null;
      reg_lat: string | null;
      reg_lng: string | null;
      registered_accuracy_m: string | null;
      assignment_kind: string | null;
      assignment_reason: string | null;
      due_by: string | null;
    }>(
      `SELECT f.id, f.licence_number, f.facility_type, f.name, f.lga,
              ST_Y(f.registered_point::geometry) AS reg_lat,
              ST_X(f.registered_point::geometry) AS reg_lng,
              f.registered_accuracy_m,
              a.kind   AS assignment_kind,
              a.reason AS assignment_reason,
              a.due_by::text AS due_by
       FROM assignment a
       JOIN facility f ON f.id = a.facility_id
       WHERE a.assigned_to_user_id = $1
         AND a.status IN ('planned','in_progress')
         AND ($2::uuid IS NULL OR f.jurisdiction_id = $2)
       ORDER BY a.due_by NULLS LAST, f.name`,
      [userId, jurisdictionId],
    );

    const versions = await this.pg.query<{
      id: string;
      instrument_id: string;
      facility_type: string;
      version_label: string;
      satisfactory_min: string;
      needs_improve_min: string;
      structure_hash: string;
      structure: InstrumentStructure | null;
    }>(
      `SELECT iv.id, iv.instrument_id, i.facility_type, iv.version_label,
              iv.satisfactory_min, iv.needs_improve_min,
              encode(iv.structure_hash, 'hex') AS structure_hash,
              (
                SELECT json_build_object('sections', coalesce(json_agg(sec ORDER BY sec->>'ordinal'), '[]'::json))
                FROM (
                  SELECT json_build_object(
                           'ordinal', s.ordinal,
                           'titleEn', s.title_en,
                           'titleHa', s.title_ha,
                           'checkpoints', coalesce((
                             SELECT json_agg(json_build_object(
                               'ordinal', c.ordinal,
                               'promptEn', c.prompt_en,
                               'promptHa', c.prompt_ha,
                               'weight', c.weight,
                               'severityOnFail', c.severity_on_fail,
                               'allowsNa', c.allows_na
                             ) ORDER BY c.ordinal)
                             FROM checkpoint c WHERE c.section_id = s.id
                           ), '[]'::json)
                         ) AS sec
                  FROM section s
                  WHERE s.instrument_version_id = iv.id
                  ORDER BY s.ordinal
                ) sections
              ) AS structure
       FROM instrument_version iv
       JOIN instrument i ON i.id = iv.instrument_id
       WHERE iv.status = 'in_force'
         AND ($1::uuid IS NULL OR i.jurisdiction_id = $1)`,
      [jurisdictionId],
    );

    // Prior findings at the facilities on today's list: what is still
    // outstanding when the inspector arrives.
    const priorFindings = await this.pg.query<{
      id: string;
      facility_id: string;
      reference: string;
      summary: string;
      severity: string;
      status: string;
      due_date: string | null;
    }>(
      `SELECT f.id, insp.facility_id, f.reference, f.summary, f.severity, f.status,
              f.due_date::text AS due_date
       FROM finding f
       JOIN inspection insp ON insp.id = f.inspection_id
       JOIN facility fac    ON fac.id = insp.facility_id
       WHERE f.status <> 'closed'
         AND ($2::uuid IS NULL OR fac.jurisdiction_id = $2)
         AND EXISTS (
           SELECT 1 FROM assignment a
           WHERE a.facility_id = fac.id AND a.assigned_to_user_id = $1
             AND a.status IN ('planned','in_progress')
         )`,
      [userId, jurisdictionId],
    );

    return {
      facilities: facilities.map<AssignedFacility>((f) => ({
        id: f.id,
        licenceNumber: f.licence_number,
        facilityType: f.facility_type,
        name: f.name,
        lga: f.lga,
        regLat: f.reg_lat === null ? null : Number(f.reg_lat),
        regLng: f.reg_lng === null ? null : Number(f.reg_lng),
        regAccuracyM:
          f.registered_accuracy_m === null ? null : Number(f.registered_accuracy_m),
        assignmentKind: f.assignment_kind,
        assignmentReason: f.assignment_reason,
        dueBy: f.due_by,
      })),
      instrumentVersions: versions.map<BootstrapInstrumentVersion>((v) => ({
        id: v.id,
        instrumentId: v.instrument_id,
        facilityType: v.facility_type,
        versionLabel: v.version_label,
        satisfactoryMin: Number(v.satisfactory_min),
        needsImprovementMin: Number(v.needs_improve_min),
        structureHash: v.structure_hash,
        structure: v.structure ?? { sections: [] },
      })),
      priorFindings: priorFindings.map<BootstrapPriorFinding>((f) => ({
        id: f.id,
        facilityId: f.facility_id,
        reference: f.reference,
        summary: f.summary,
        severity: f.severity,
        status: f.status,
        dueDate: f.due_date,
      })),
    };
  }
}
