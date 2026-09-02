import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  assertTransition,
  type FindingClosedPayload,
  type FindingClosurePayload,
  type FindingStatus,
} from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { EventAppender } from "../events/event-appender.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// The corrective-action worklist and the closure workflow. Field observation is
// never overwritten: a finding's summary, severity, and checkpoint come from the
// device event and stay as authored. Only its closure state advances, and only
// server-side.

export interface FindingFilter {
  status?: string;
  severity?: string;
  inspectionId?: string;
  facilityId?: string;
  overdueOnly?: boolean;
}

@Injectable()
export class FindingsService {
  constructor(
    private readonly pg: PgService,
    private readonly events: EventAppender,
  ) {}

  async worklist(principal: Principal, filter: FindingFilter) {
    return this.pg.query(
      `SELECT fd.id, fd.reference, fd.summary, fd.severity, fd.status, fd.due_date,
              fd.owner_label, fd.escalated_to, fd.escalated_at, fd.checkpoint_ref,
              fd.closure_submitted_at, fd.closed_at,
              (fd.due_date < current_date AND fd.status <> 'closed') AS past_due,
              (current_date - fd.due_date) AS days_past_due,
              i.id AS inspection_id, i.reference AS inspection_reference, i.submitted_at,
              f.id AS facility_id, f.name AS facility_name, f.licence_number, f.lga
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f   ON f.id = i.facility_id
       WHERE ($1::uuid IS NULL OR f.jurisdiction_id = $1)
         AND ($2::text IS NULL OR fd.status = $2)
         AND ($3::text IS NULL OR fd.severity = $3)
         AND ($4::uuid IS NULL OR fd.inspection_id = $4)
         AND ($5::uuid IS NULL OR f.id = $5)
         AND ($6::boolean IS NOT TRUE OR (fd.due_date < current_date AND fd.status <> 'closed'))
       ORDER BY CASE fd.severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,
                fd.due_date NULLS LAST
       LIMIT 500`,
      [
        jurisdictionFilter(principal),
        filter.status ?? null,
        filter.severity ?? null,
        filter.inspectionId ?? null,
        filter.facilityId ?? null,
        filter.overdueOnly ?? null,
      ],
    );
  }

  /** Closure evidence submitted by the owner or the facility representative. */
  async submitClosure(
    principal: Principal,
    findingId: string,
    note?: string,
    evidenceIds?: string[],
  ): Promise<void> {
    const finding = await this.load(principal, findingId);
    assertTransition(finding.status, "awaiting_verification");

    const payload: FindingClosurePayload = {
      at: new Date().toISOString(),
      note,
      evidenceIds,
    };
    await this.events.append({
      aggregateType: "finding",
      aggregateId: findingId,
      eventType: "FindingClosureSubmitted",
      payload,
      actorUserId: principal.userId,
    });
  }

  /**
   * Verify and close. A facility cannot close its own finding: closing requires
   * a verifying role, and the closure records who verified it and when.
   */
  async verifyClosure(principal: Principal, findingId: string): Promise<void> {
    const finding = await this.load(principal, findingId);
    if (finding.status !== "awaiting_verification") {
      throw new ConflictException(
        `finding is ${finding.status}; only a finding awaiting verification can be closed`,
      );
    }
    assertTransition(finding.status, "closed");

    const payload: FindingClosedPayload = {
      at: new Date().toISOString(),
      verifiedByUserId: principal.userId,
    };
    await this.events.append({
      aggregateType: "finding",
      aggregateId: findingId,
      eventType: "FindingClosed",
      payload,
      actorUserId: principal.userId,
    });
  }

  /** Verification rejected: the finding returns to open and stays tracked. */
  async rejectClosure(principal: Principal, findingId: string, reason: string): Promise<void> {
    const finding = await this.load(principal, findingId);
    if (finding.status !== "awaiting_verification") {
      throw new ConflictException("only a finding awaiting verification can be rejected");
    }
    await this.events.append({
      aggregateType: "finding",
      aggregateId: findingId,
      eventType: "FindingClosureRejected",
      payload: { at: new Date().toISOString(), reason, byUserId: principal.userId },
      actorUserId: principal.userId,
    });
  }

  private async load(
    principal: Principal,
    findingId: string,
  ): Promise<{ id: string; status: FindingStatus; jurisdictionId: string }> {
    const rows = await this.pg.query<{
      id: string;
      status: FindingStatus;
      jurisdiction_id: string;
    }>(
      `SELECT fd.id, fd.status, f.jurisdiction_id
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f   ON f.id = i.facility_id
       WHERE fd.id = $1`,
      [findingId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException("finding");

    const scope = jurisdictionFilter(principal);
    if (scope !== null && scope !== row.jurisdiction_id) {
      throw new ForbiddenException("finding is outside your jurisdiction");
    }
    return { id: row.id, status: row.status, jurisdictionId: row.jurisdiction_id };
  }
}
