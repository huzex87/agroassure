import { Injectable } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// The regulator dashboard. Every tile reads a projection, never the event
// store, so a heavy dashboard query can never contend with field ingest.

@Injectable()
export class DashboardService {
  constructor(private readonly pg: PgService) {}

  async summary(principal: Principal) {
    const scope = jurisdictionFilter(principal);

    const [tiles] = await this.pg.query<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM facility f
           WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS facilities,
         (SELECT count(*) FROM inspection i JOIN facility f ON f.id = i.facility_id
           WHERE i.status = 'submitted' AND i.submitted_at >= current_date - 30
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS inspections_30d,
         (SELECT count(*) FROM finding fd
            JOIN inspection i ON i.id = fd.inspection_id
            JOIN facility f   ON f.id = i.facility_id
           WHERE fd.status <> 'closed'
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS open_findings,
         (SELECT count(*) FROM finding fd
            JOIN inspection i ON i.id = fd.inspection_id
            JOIN facility f   ON f.id = i.facility_id
           WHERE fd.status <> 'closed' AND fd.due_date < current_date
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS overdue_findings,
         (SELECT count(*) FROM certificate c JOIN facility f ON f.id = c.facility_id
           WHERE c.status = 'valid' AND c.valid_to >= current_date
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS valid_certificates,
         (SELECT count(*) FROM certificate c JOIN facility f ON f.id = c.facility_id
           WHERE c.status = 'valid' AND c.valid_to BETWEEN current_date AND current_date + 30
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS certificates_due_soon`,
      [scope],
    );

    // The statutory window made measurable: of the inspections submitted in the
    // last 90 days, how many reached an officer decision within 30 days.
    const [clock] = await this.pg.query<{ decided: string; total: string }>(
      `SELECT
         count(*) FILTER (
           WHERE d.decided_at IS NOT NULL AND d.decided_at <= i.submitted_at + interval '30 days'
         )::text AS decided,
         count(*)::text AS total
       FROM inspection i
       JOIN facility f ON f.id = i.facility_id
       LEFT JOIN LATERAL (
         SELECT min(d.decided_at) AS decided_at FROM decision d WHERE d.inspection_id = i.id
       ) d ON true
       WHERE i.status = 'submitted' AND i.submitted_at >= current_date - 90
         AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)`,
      [scope],
    );

    const complianceTrend = await this.pg.query(
      `SELECT to_char(date_trunc('month', i.submitted_at), 'YYYY-MM') AS month,
              round(avg(i.rating_percent), 1)::float8 AS avg_rating,
              count(*)::int AS inspections,
              count(*) FILTER (WHERE i.rating_band = 'satisfactory')::int AS satisfactory
       FROM inspection i JOIN facility f ON f.id = i.facility_id
       WHERE i.status = 'submitted' AND i.submitted_at >= current_date - interval '12 months'
         AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)
       GROUP BY 1 ORDER BY 1`,
      [scope],
    );

    // Which part of the instrument fails most often, so a regulator can see
    // where the value chain is actually weak rather than guessing.
    const findingsBySection = await this.pg.query(
      `SELECT split_part(fd.checkpoint_ref, '.', 1) AS section_ordinal,
              coalesce(max(s.title_en), 'Section ' || split_part(fd.checkpoint_ref, '.', 1))
                AS section_title,
              count(*)::int AS findings,
              count(*) FILTER (WHERE fd.severity = 'critical')::int AS critical
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f   ON f.id = i.facility_id
       LEFT JOIN section s ON s.instrument_version_id = i.instrument_version_id
                          AND s.ordinal = split_part(fd.checkpoint_ref, '.', 1)::int
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
       GROUP BY 1 ORDER BY findings DESC LIMIT 12`,
      [scope],
    );

    const findingsQueue = await this.pg.query(
      `SELECT fd.status, fd.severity, count(*)::int AS count
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f   ON f.id = i.facility_id
       WHERE fd.status <> 'closed'
         AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)
       GROUP BY 1, 2`,
      [scope],
    );

    const total = Number(clock?.total ?? 0);
    return {
      tiles: {
        facilities: Number(tiles?.facilities ?? 0),
        inspections30d: Number(tiles?.inspections_30d ?? 0),
        openFindings: Number(tiles?.open_findings ?? 0),
        overdueFindings: Number(tiles?.overdue_findings ?? 0),
        validCertificates: Number(tiles?.valid_certificates ?? 0),
        certificatesDueSoon: Number(tiles?.certificates_due_soon ?? 0),
      },
      decisionsWithin30Days: {
        decided: Number(clock?.decided ?? 0),
        total,
        percent: total === 0 ? null : Math.round((Number(clock?.decided ?? 0) / total) * 100),
      },
      complianceTrend,
      findingsBySection,
      findingsQueue,
    };
  }
}
