import { describe, it, expect } from "vitest";
import { EscalationService } from "../src/workers/escalation.service";

// Overdue and escalation happen on a clock, not when someone opens a page, and
// each one is an event. "Escalated to Desk Supervisor on 14 Aug 2026" has to be
// a recorded fact, otherwise it is a label the UI invented.

const CRITICAL = {
  id: "018f0000-0000-7000-8000-0000000000f1",
  severity: "critical" as const,
  status: "open" as const,
  due_date: "2026-08-08",
  reference: "CA-01184-03",
  summary: "Damaged stock not segregated",
  supervisor_id: "018f0000-0000-7000-8000-0000000000su",
};

class FakePg {
  notifications: unknown[][] = [];
  constructor(private readonly rows: unknown[]) {}
  async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    if (text.includes("INSERT INTO notification")) {
      this.notifications.push(params);
      return [] as T[];
    }
    return this.rows as T[];
  }
}

class FakeAppender {
  appended: Array<{ eventType: string; payload: Record<string, unknown>; actor: unknown }> = [];
  async append(req: {
    eventType: string;
    payload: unknown;
    actorUserId: string | null;
  }): Promise<string> {
    this.appended.push({
      eventType: req.eventType,
      payload: req.payload as Record<string, unknown>,
      actor: req.actorUserId,
    });
    return "event-id";
  }
}

function sweepWith(rows: unknown[], now: Date) {
  const pg = new FakePg(rows);
  const appender = new FakeAppender();
  const svc = new EscalationService(pg as never, appender as never);
  return { svc, pg, appender, run: () => svc.sweep(now) };
}

describe("EscalationService.sweep", () => {
  it("marks an open, past-due finding overdue", async () => {
    // One day past due: overdue, but still inside the escalation grace window.
    const { appender, run } = sweepWith([CRITICAL], new Date("2026-08-09T06:00:00Z"));
    const result = await run();

    expect(result.markedOverdue).toBe(1);
    expect(result.escalated).toBe(0);
    expect(appender.appended.map((a) => a.eventType)).toEqual(["FindingBecameOverdue"]);
  });

  it("escalates once the SLA grace window is breached, with a reason in words", async () => {
    // Critical: due + 3 days grace. Six days past due is a breach.
    const { appender, pg, run } = sweepWith(
      [{ ...CRITICAL, status: "overdue" }],
      new Date("2026-08-14T06:00:00Z"),
    );
    const result = await run();

    expect(result.markedOverdue).toBe(0); // already overdue, not re-marked
    expect(result.escalated).toBe(1);

    const event = appender.appended[0]!;
    expect(event.eventType).toBe("FindingEscalated");
    expect(event.payload.to).toBe("desk_supervisor");
    expect(event.payload.reason).toMatch(/Critical finding overdue by 6 days/);
    // A time transition has no human actor, and must not borrow one.
    expect(event.actor).toBeNull();
    expect(pg.notifications).toHaveLength(1);
  });

  it("does not escalate a finding awaiting verification", async () => {
    const { appender, run } = sweepWith(
      [{ ...CRITICAL, status: "awaiting_verification" }],
      new Date("2026-08-20T06:00:00Z"),
    );
    // The sweep query itself filters these out; this guards the domain rule too.
    const result = await run();
    expect(result.escalated).toBe(0);
    expect(appender.appended.some((a) => a.eventType === "FindingEscalated")).toBe(false);
  });

  it("is idempotent: a second sweep on the same day adds nothing", async () => {
    const { appender, run } = sweepWith(
      [{ ...CRITICAL, status: "escalated" }],
      new Date("2026-08-20T06:00:00Z"),
    );
    const result = await run();
    expect(result).toEqual({ markedOverdue: 0, escalated: 0 });
    expect(appender.appended).toHaveLength(0);
  });

  it("gives a minor finding its longer window before escalating", async () => {
    // Minor: 14 days of grace after the due date.
    const minor = { ...CRITICAL, severity: "minor" as const, status: "overdue" as const };
    const early = sweepWith([minor], new Date("2026-08-14T06:00:00Z"));
    expect((await early.run()).escalated).toBe(0);

    const late = sweepWith([minor], new Date("2026-08-25T06:00:00Z"));
    expect((await late.run()).escalated).toBe(1);
  });

  it("does nothing when nothing is past due", async () => {
    const { appender, run } = sweepWith([], new Date("2026-08-01T06:00:00Z"));
    expect(await run()).toEqual({ markedOverdue: 0, escalated: 0 });
    expect(appender.appended).toHaveLength(0);
  });
});
