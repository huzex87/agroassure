import { Injectable, NotFoundException } from "@nestjs/common";
import { uuidv7, type DecisionRecordedPayload, type DecisionType } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { EventAppender } from "../events/event-appender.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// Inspection review. Inspections are device-owned and immutable once submitted:
// nothing here edits one. A supervisor's act on an inspection is a Decision,
// appended alongside the record rather than written on top of it.

export interface InspectionFilter {
  facilityId?: string;
  status?: string;
  ratingBand?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class InspectionsService {
  constructor(
    private readonly pg: PgService,
    private readonly events: EventAppender,
  ) {}

  async list(principal: Principal, filter: InspectionFilter) {
    return this.pg.query(
      `SELECT i.id, i.reference, i.status, i.rating_percent, i.rating_band,
              i.findings_count, i.checkin_flagged, i.version_discrepancy, i.submitted_at,
              f.name AS facility_name, f.licence_number, f.lga,
              u.full_name AS inspector,
              EXISTS (SELECT 1 FROM decision d WHERE d.inspection_id = i.id) AS reviewed
       FROM inspection i
       JOIN facility f ON f.id = i.facility_id
       JOIN app_user u ON u.id = i.inspector_user_id
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
         AND ($2::uuid IS NULL OR i.facility_id = $2)
         AND ($3::text IS NULL OR i.status = $3)
         AND ($4::text IS NULL OR i.rating_band = $4)
         AND ($5::date IS NULL OR i.submitted_at >= $5::date)
         AND ($6::date IS NULL OR i.submitted_at < ($6::date + 1))
       ORDER BY i.submitted_at DESC NULLS LAST, i.created_at DESC
       LIMIT 500`,
      [
        jurisdictionFilter(principal),
        filter.facilityId ?? null,
        filter.status ?? null,
        filter.ratingBand ?? null,
        filter.from ?? null,
        filter.to ?? null,
      ],
    );
  }

  /** The full case an officer reviews: responses, evidence, findings, decisions. */
  async detail(principal: Principal, inspectionId: string) {
    const rows = await this.pg.query(
      `SELECT i.*, f.name AS facility_name, f.licence_number, f.facility_type, f.lga,
              f.jurisdiction_id,
              ST_Y(i.checkin_point::geometry) AS checkin_lat,
              ST_X(i.checkin_point::geometry) AS checkin_lng,
              u.full_name AS inspector_name,
              iv.version_label, encode(i.structure_hash,'hex') AS structure_hash_hex
       FROM inspection i
       JOIN facility f ON f.id = i.facility_id
       JOIN app_user u ON u.id = i.inspector_user_id
       JOIN instrument_version iv ON iv.id = i.instrument_version_id
       WHERE i.id = $1 AND ($2::uuid IS NULL OR f.jurisdiction_id = $2)`,
      [inspectionId, jurisdictionFilter(principal)],
    );
    const inspection = rows[0];
    if (!inspection) throw new NotFoundException("inspection");

    const responses = await this.pg.query(
      `SELECT r.checkpoint_ref, r.response, r.remark, r.weight,
              s.title_en AS section_title_en, s.title_ha AS section_title_ha,
              c.prompt_en, c.prompt_ha
       FROM checkpoint_response r
       JOIN inspection i ON i.id = r.inspection_id
       LEFT JOIN section s ON s.instrument_version_id = i.instrument_version_id
                          AND s.ordinal = split_part(r.checkpoint_ref, '.', 1)::int
       LEFT JOIN checkpoint c ON c.section_id = s.id
                          AND c.ordinal = split_part(r.checkpoint_ref, '.', 2)::int
       WHERE r.inspection_id = $1
       ORDER BY split_part(r.checkpoint_ref,'.',1)::int, split_part(r.checkpoint_ref,'.',2)::int`,
      [inspectionId],
    );

    const evidence = await this.pg.query(
      `SELECT id, checkpoint_ref, encode(sha256,'hex') AS sha256, object_key, mime,
              captured_at, locked,
              ST_Y(point::geometry) AS lat, ST_X(point::geometry) AS lng, accuracy_m
       FROM evidence WHERE inspection_id = $1 ORDER BY captured_at`,
      [inspectionId],
    );

    const findings = await this.pg.query(
      `SELECT id, reference, checkpoint_ref, summary, severity, status, due_date,
              owner_label, escalated_to, escalated_at, closed_at
       FROM finding WHERE inspection_id = $1
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END, due_date`,
      [inspectionId],
    );

    const decisions = await this.pg.query(
      `SELECT d.id, d.decision_type, d.basis, d.decided_at, u.full_name AS officer
       FROM decision d JOIN app_user u ON u.id = d.officer_id
       WHERE d.inspection_id = $1 ORDER BY d.decided_at`,
      [inspectionId],
    );

    return { inspection, responses, evidence, findings, decisions };
  }

  /**
   * Record an officer decision. A decision is append-only: a reversal is a new
   * decision, never an edit, so the reasoning trail stays intact.
   */
  async recordDecision(
    principal: Principal,
    inspectionId: string,
    decisionType: DecisionType,
    basis?: string,
  ): Promise<string> {
    await this.detail(principal, inspectionId); // 404 and jurisdiction scope

    const decisionId = uuidv7();
    const payload: DecisionRecordedPayload = {
      decisionId,
      inspectionId,
      officerId: principal.userId,
      decisionType,
      basis,
      decidedAt: new Date().toISOString(),
    };
    await this.events.append({
      aggregateType: "decision",
      aggregateId: decisionId,
      eventType: "DecisionRecorded",
      payload,
      actorUserId: principal.userId,
    });
    return decisionId;
  }
}
