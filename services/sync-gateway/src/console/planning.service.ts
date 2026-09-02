import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { buildRiskSignals, facilityRisk, type FacilityRiskInput } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// Planning. Routine cyclical scheduling is the default; risk targeting
// supplements it. The engine proposes and always says why, in words a
// supervisor can disagree with; a human does the scheduling.

const CYCLE_TARGET_MONTHS = 12;

export interface RiskSuggestion {
  facilityId: string;
  facilityName: string;
  licenceNumber: string;
  lga: string | null;
  score: number;
  reasons: string[];
  leadingReason: string;
}

export interface CreateAssignmentInput {
  facilityId: string;
  assignedToUserId: string;
  kind: "routine" | "risk_targeted" | "follow_up";
  reason?: string;
  dueBy?: string;
}

interface RiskRow {
  facility_id: string;
  facility_name: string;
  licence_number: string;
  lga: string | null;
  months_since_last: string | null;
  open_findings: string;
  overdue_findings: string;
  cert_days_to_expiry: string | null;
  recent_bands: string[] | null;
}

@Injectable()
export class PlanningService {
  constructor(private readonly pg: PgService) {}

  async assignments(principal: Principal, forUserId?: string, status?: string) {
    return this.pg.query(
      `SELECT a.id, a.kind, a.reason, a.due_by, a.status, a.created_at,
              a.inspection_id,
              f.id AS facility_id, f.name AS facility_name, f.licence_number,
              f.facility_type, f.lga,
              ST_Y(f.registered_point::geometry) AS lat,
              ST_X(f.registered_point::geometry) AS lng,
              u.full_name AS assigned_to
       FROM assignment a
       JOIN facility f ON f.id = a.facility_id
       JOIN app_user u ON u.id = a.assigned_to_user_id
       WHERE ($1::uuid IS NULL OR a.jurisdiction_id = $1)
         AND ($2::uuid IS NULL OR a.assigned_to_user_id = $2)
         AND ($3::text IS NULL OR a.status = $3)
       ORDER BY a.due_by NULLS LAST, a.created_at DESC
       LIMIT 500`,
      [jurisdictionFilter(principal), forUserId ?? null, status ?? null],
    );
  }

  /**
   * Schedule a visit. The reason travels with the assignment, so an inspector
   * arriving at a facility can see why this one was chosen, and a later reviewer
   * can see what the supervisor was acting on.
   */
  async createAssignment(principal: Principal, input: CreateAssignmentInput): Promise<string> {
    const facility = await this.pg.query<{ jurisdiction_id: string }>(
      `SELECT jurisdiction_id FROM facility WHERE id = $1`,
      [input.facilityId],
    );
    const jurisdictionId = facility[0]?.jurisdiction_id;
    if (!jurisdictionId) throw new NotFoundException("facility");

    const scope = jurisdictionFilter(principal);
    if (scope !== null && scope !== jurisdictionId) {
      throw new ForbiddenException("facility is outside your jurisdiction");
    }

    const rows = await this.pg.query<{ id: string }>(
      `INSERT INTO assignment (jurisdiction_id, facility_id, assigned_to_user_id,
                               created_by_user_id, kind, reason, due_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date)
       RETURNING id`,
      [
        jurisdictionId,
        input.facilityId,
        input.assignedToUserId,
        principal.userId,
        input.kind,
        input.reason ?? null,
        input.dueBy ?? null,
      ],
    );
    return rows[0]!.id;
  }

  async cancelAssignment(principal: Principal, assignmentId: string): Promise<void> {
    const rows = await this.pg.query(
      `UPDATE assignment SET status = 'cancelled'
       WHERE id = $1 AND status = 'planned'
         AND ($2::uuid IS NULL OR jurisdiction_id = $2)
       RETURNING id`,
      [assignmentId, jurisdictionFilter(principal)],
    );
    if (rows.length === 0) throw new NotFoundException("planned assignment");
  }

  /**
   * Risk-targeted suggestions. Every signal that contributes is turned into a
   * sentence, and the sentences are ranked by how much they contributed, so the
   * top line of a suggestion is the strongest reason for it.
   */
  async riskSuggestions(principal: Principal, limit = 20): Promise<RiskSuggestion[]> {
    const rows = await this.pg.query<RiskRow>(
      `SELECT f.id AS facility_id, f.name AS facility_name, f.licence_number, f.lga,
              CASE WHEN last_i.submitted_at IS NULL THEN NULL
                   ELSE floor(extract(epoch FROM (now() - last_i.submitted_at)) / 2629746)::text
              END AS months_since_last,
              (SELECT count(*) FROM finding fd JOIN inspection i2 ON i2.id = fd.inspection_id
                WHERE i2.facility_id = f.id AND fd.status <> 'closed')::text AS open_findings,
              (SELECT count(*) FROM finding fd JOIN inspection i2 ON i2.id = fd.inspection_id
                WHERE i2.facility_id = f.id AND fd.status <> 'closed'
                  AND fd.due_date < current_date)::text AS overdue_findings,
              CASE WHEN cert.valid_to IS NULL THEN NULL
                   ELSE (cert.valid_to - current_date)::text END AS cert_days_to_expiry,
              recent.bands AS recent_bands
       FROM facility f
       LEFT JOIN LATERAL (
         SELECT i.submitted_at FROM inspection i
         WHERE i.facility_id = f.id AND i.status = 'submitted'
         ORDER BY i.submitted_at DESC LIMIT 1
       ) last_i ON true
       LEFT JOIN LATERAL (
         SELECT c.valid_to FROM certificate c
         WHERE c.facility_id = f.id AND c.status = 'valid'
         ORDER BY c.valid_to DESC LIMIT 1
       ) cert ON true
       LEFT JOIN LATERAL (
         SELECT array_agg(b.rating_band ORDER BY b.submitted_at DESC) AS bands
         FROM (SELECT i.rating_band, i.submitted_at FROM inspection i
               WHERE i.facility_id = f.id AND i.status = 'submitted'
               ORDER BY i.submitted_at DESC LIMIT 2) b
       ) recent ON true
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)`,
      [jurisdictionFilter(principal)],
    );

    const suggestions = rows.map((r) => {
      const bands = r.recent_bands ?? [];
      const input: FacilityRiskInput = {
        monthsSinceLastInspection:
          r.months_since_last === null ? null : Number(r.months_since_last),
        cycleTargetMonths: CYCLE_TARGET_MONTHS,
        twoConsecutiveNeedsImprovement:
          bands.length >= 2 && bands[0] === "needs_improvement" && bands[1] === "needs_improvement",
        lastRatingCriticalIssues: bands[0] === "critical_issues",
        openFindings: Number(r.open_findings),
        overdueFindings: Number(r.overdue_findings),
        certDaysToExpiry:
          r.cert_days_to_expiry === null ? null : Number(r.cert_days_to_expiry),
      };
      const { score, reasons } = facilityRisk(buildRiskSignals(input));
      return {
        facilityId: r.facility_id,
        facilityName: r.facility_name,
        licenceNumber: r.licence_number,
        lga: r.lga,
        score,
        reasons,
        leadingReason: reasons[0] ?? "no risk signals",
      };
    });

    return suggestions
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
