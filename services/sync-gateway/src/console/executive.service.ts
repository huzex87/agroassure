import { Injectable } from "@nestjs/common";
import { PgService } from "../db/pg.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// The executive view.
//
// The operational dashboard answers "what do I do today". This answers a
// different question, and the difference matters: is the programme working, and
// is the regulator keeping the promises it made?
//
// So the figures here are deliberately uncomfortable ones. Coverage, because a
// regulator's commonest failure is that most of the register is never visited
// and the inspections that do happen look fine. Findings closed against
// findings raised, because raising them and never closing them is not
// regulation. Repeat failures, because the same site failing the same
// checkpoint twice means either enforcement is not working or a finding was
// closed without anything changing. And the regulator's own clock, because an
// institution that measures everyone except itself is not credible.
//
// Every query reads a projection, never the event store, so nothing here can
// contend with field ingest.

@Injectable()
export class ExecutiveService {
  constructor(private readonly pg: PgService) {}

  async summary(principal: Principal) {
    const scope = jurisdictionFilter(principal);

    const [coverage] = await this.pg.query<Record<string, string>>(
      `SELECT
         count(*)::text AS total,
         count(*) FILTER (WHERE last.submitted_at >= current_date - 365)::text AS inspected_12m,
         count(*) FILTER (WHERE last.submitted_at IS NULL)::text AS never_inspected,
         count(*) FILTER (
           WHERE last.submitted_at IS NOT NULL AND last.submitted_at < current_date - 365
         )::text AS lapsed_over_a_year
       FROM facility f
       LEFT JOIN LATERAL (
         SELECT max(i.submitted_at) AS submitted_at
         FROM inspection i WHERE i.facility_id = f.id AND i.status = 'submitted'
       ) last ON true
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)`,
      [scope],
    );

    // Twelve months of it, so a director sees a direction rather than a number.
    const ratingTrend = await this.pg.query(
      `SELECT to_char(date_trunc('month', i.submitted_at), 'YYYY-MM') AS month,
              round(avg(i.rating_percent)::numeric, 1)::float8 AS avg_rating,
              count(*)::int AS inspections
       FROM inspection i
       JOIN facility f ON f.id = i.facility_id
       WHERE i.status = 'submitted' AND i.submitted_at >= current_date - interval '12 months'
         AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)
       GROUP BY 1 ORDER BY 1`,
      [scope],
    );

    // Raised against closed. A line that only goes up is a regulator producing
    // paperwork, not compliance.
    const findingsFlow = await this.pg.query(
      `WITH months AS (
         SELECT to_char(generate_series(
           date_trunc('month', current_date) - interval '11 months',
           date_trunc('month', current_date), interval '1 month'), 'YYYY-MM') AS month
       )
       SELECT m.month,
              coalesce(r.raised, 0)::int AS raised,
              coalesce(c.closed, 0)::int AS closed
       FROM months m
       LEFT JOIN (
         SELECT to_char(date_trunc('month', fd.created_at), 'YYYY-MM') AS month, count(*) AS raised
         FROM finding fd
         JOIN inspection i ON i.id = fd.inspection_id
         JOIN facility f ON f.id = i.facility_id
         WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
         GROUP BY 1
       ) r ON r.month = m.month
       LEFT JOIN (
         SELECT to_char(date_trunc('month', fd.closed_at), 'YYYY-MM') AS month, count(*) AS closed
         FROM finding fd
         JOIN inspection i ON i.id = fd.inspection_id
         JOIN facility f ON f.id = i.facility_id
         WHERE fd.closed_at IS NOT NULL AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)
         GROUP BY 1
       ) c ON c.month = m.month
       ORDER BY m.month`,
      [scope],
    );

    // The median, not the mean: one finding left open for two years should not
    // be able to make the average look like a policy.
    const [closure] = await this.pg.query<Record<string, string | null>>(
      `SELECT
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (fd.closed_at - fd.created_at)) / 86400
         )::text AS median_days,
         count(*)::text AS closed_count
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f ON f.id = i.facility_id
       WHERE fd.closed_at IS NOT NULL AND ($1::uuid IS NULL OR f.jurisdiction_id = $1)`,
      [scope],
    );

    // Where the value chain is failing geographically, which is what decides
    // where the next inspector is posted.
    const byLga = await this.pg.query(
      `SELECT coalesce(f.lga, 'Not recorded') AS lga,
              count(DISTINCT f.id)::int AS facilities,
              count(DISTINCT i.facility_id)::int AS inspected,
              round(avg(i.rating_percent)::numeric, 1)::float8 AS avg_rating,
              count(fd.id) FILTER (WHERE fd.status <> 'closed')::int AS open_findings
       FROM facility f
       LEFT JOIN inspection i ON i.facility_id = f.id AND i.status = 'submitted'
       LEFT JOIN finding fd ON fd.inspection_id = i.id
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
       GROUP BY 1 ORDER BY open_findings DESC, facilities DESC
       LIMIT 12`,
      [scope],
    );

    // The same site failing the same checkpoint more than once. Either the
    // enforcement is not working or the finding was closed without anything
    // actually changing, and both are worth a director's attention.
    const repeatFailures = await this.pg.query(
      `SELECT f.name AS facility, f.lga, fd.checkpoint_ref,
              count(*)::int AS times, max(fd.created_at) AS last_raised
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f ON f.id = i.facility_id
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
       GROUP BY f.id, f.name, f.lga, fd.checkpoint_ref
       HAVING count(*) > 1
       ORDER BY times DESC, last_raised DESC
       LIMIT 10`,
      [scope],
    );

    // What the regulator owes, measured the same way it measures everyone else.
    const [promises] = await this.pg.query<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM finding fd
            JOIN inspection i ON i.id = fd.inspection_id
            JOIN facility f ON f.id = i.facility_id
           WHERE fd.status <> 'closed' AND fd.due_date < current_date
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS overdue_findings,
         (SELECT count(*) FROM certificate c JOIN facility f ON f.id = c.facility_id
           WHERE c.status = 'valid' AND c.valid_to BETWEEN current_date AND current_date + 30
             AND ($1::uuid IS NULL OR f.jurisdiction_id = $1))::text AS certificates_due_soon,
         (SELECT count(*) FROM device d
           WHERE d.status = 'pending'
             AND ($1::uuid IS NULL OR d.jurisdiction_id = $1))::text AS devices_awaiting_approval`,
      [scope],
    );

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

    const total = Number(coverage?.total ?? 0);
    const inspected12m = Number(coverage?.inspected_12m ?? 0);
    const decided = Number(clock?.decided ?? 0);
    const clockTotal = Number(clock?.total ?? 0);

    return {
      coverage: {
        total,
        inspected12m,
        neverInspected: Number(coverage?.never_inspected ?? 0),
        lapsedOverAYear: Number(coverage?.lapsed_over_a_year ?? 0),
        // Null rather than zero on an empty register: nothing has been measured,
        // which is not the same as measuring nothing.
        percent: total === 0 ? null : Math.round((inspected12m / total) * 1000) / 10,
      },
      ratingTrend,
      findingsFlow,
      closure: {
        medianDays:
          closure?.median_days === null || closure?.median_days === undefined
            ? null
            : Math.round(Number(closure.median_days) * 10) / 10,
        closedCount: Number(closure?.closed_count ?? 0),
      },
      byLga,
      repeatFailures,
      promises: {
        overdueFindings: Number(promises?.overdue_findings ?? 0),
        certificatesDueSoon: Number(promises?.certificates_due_soon ?? 0),
        devicesAwaitingApproval: Number(promises?.devices_awaiting_approval ?? 0),
        decisionsWithin30Days: {
          decided,
          total: clockTotal,
          percent: clockTotal === 0 ? null : Math.round((decided / clockTotal) * 1000) / 10,
        },
      },
    };
  }
}
