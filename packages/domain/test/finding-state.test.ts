import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  dueDateFor,
  shouldEscalate,
  escalationReason,
} from "../src";

describe("finding state machine", () => {
  it("allows open -> overdue and open -> awaiting_verification", () => {
    expect(canTransition("open", "overdue")).toBe(true);
    expect(canTransition("open", "awaiting_verification")).toBe(true);
  });

  it("forbids closing directly from open (must be verified)", () => {
    expect(canTransition("open", "closed")).toBe(false);
    expect(() => assertTransition("open", "closed")).toThrow();
  });

  it("only closes from awaiting_verification", () => {
    expect(canTransition("awaiting_verification", "closed")).toBe(true);
    expect(canTransition("escalated", "closed")).toBe(false);
  });

  it("computes a due date from severity SLA", () => {
    const raised = new Date("2026-08-18T00:00:00Z");
    expect(dueDateFor("critical", raised).toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(dueDateFor("minor", raised).toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("escalates a Critical finding past its grace window", () => {
    const due = new Date("2026-08-12T00:00:00Z");
    const now = new Date("2026-08-18T00:00:00Z"); // 6 days overdue, grace 3
    expect(shouldEscalate({ status: "overdue", severity: "critical", dueDate: due }, now)).toBe(true);
    expect(escalationReason("critical", due, now)).toBe("Critical finding overdue by 6 days");
  });

  it("does not escalate an awaiting_verification finding", () => {
    const due = new Date("2026-08-01T00:00:00Z");
    const now = new Date("2026-08-30T00:00:00Z");
    expect(
      shouldEscalate({ status: "awaiting_verification", severity: "critical", dueDate: due }, now),
    ).toBe(false);
  });
});
