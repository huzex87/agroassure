import { Injectable, Logger } from "@nestjs/common";
import {
  DEFAULT_SLA,
  escalationReason,
  shouldEscalate,
  type FindingSeverity,
  type FindingStatus,
} from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { EventAppender } from "../events/event-appender.service";

// Overdue and escalation are time-driven transitions, not something evaluated
// lazily when a page happens to be opened. They happen even when nobody is
// looking, and each one is an event, so "escalated to Desk Supervisor on 14 Aug
// 2026" is a recorded fact rather than a label the UI computed.

interface DueFinding {
  id: string;
  severity: FindingSeverity;
  status: FindingStatus;
  due_date: string;
  reference: string;
  summary: string;
  supervisor_id: string | null;
}

export interface SweepResult {
  markedOverdue: number;
  escalated: number;
}

@Injectable()
export class EscalationService {
  private readonly logger = new Logger("Escalation");

  constructor(
    private readonly pg: PgService,
    private readonly events: EventAppender,
  ) {}

  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const findings = await this.pg.query<DueFinding>(
      `SELECT fd.id, fd.severity, fd.status, fd.due_date::text AS due_date,
              fd.reference, fd.summary,
              (SELECT ur.user_id FROM user_role ur
                WHERE ur.role_code = 'desk_supervisor'
                  AND (ur.jurisdiction_id IS NULL OR ur.jurisdiction_id = f.jurisdiction_id)
                LIMIT 1) AS supervisor_id
       FROM finding fd
       JOIN inspection i ON i.id = fd.inspection_id
       JOIN facility f   ON f.id = i.facility_id
       WHERE fd.status IN ('open','overdue')
         AND fd.due_date IS NOT NULL
         AND fd.due_date < $1::date`,
      [now.toISOString().slice(0, 10)],
    );

    let markedOverdue = 0;
    let escalated = 0;

    for (const f of findings) {
      const dueDate = new Date(`${f.due_date}T00:00:00Z`);

      if (f.status === "open") {
        await this.events.append({
          aggregateType: "finding",
          aggregateId: f.id,
          eventType: "FindingBecameOverdue",
          payload: { at: now.toISOString() },
          actorUserId: null, // a time transition has no human actor
        });
        markedOverdue += 1;
      }

      if (shouldEscalate({ status: f.status, severity: f.severity, dueDate }, now, DEFAULT_SLA)) {
        const reason = escalationReason(f.severity, dueDate, now);
        await this.events.append({
          aggregateType: "finding",
          aggregateId: f.id,
          eventType: "FindingEscalated",
          payload: { at: now.toISOString(), to: "desk_supervisor", reason },
          actorUserId: null,
        });
        if (f.supervisor_id) {
          await this.pg.query(
            `INSERT INTO notification (user_id, kind, payload)
             VALUES ($1, 'finding_escalated', $2::jsonb)`,
            [
              f.supervisor_id,
              JSON.stringify({ findingId: f.id, reference: f.reference, summary: f.summary, reason }),
            ],
          );
        }
        escalated += 1;
      }
    }

    if (markedOverdue > 0 || escalated > 0) {
      this.logger.log(`marked ${markedOverdue} overdue, escalated ${escalated}`);
    }
    return { markedOverdue, escalated };
  }
}
