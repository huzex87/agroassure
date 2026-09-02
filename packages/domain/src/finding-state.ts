import type { FindingSeverity, FindingStatus } from "./types";

// The corrective-action state machine. Overdue and Escalated are reached by
// time-driven transitions (a worker), not by user action. A facility cannot
// close its own finding; only a verifier moves a finding to Closed.

export const FINDING_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  open: ["awaiting_verification", "overdue"],
  overdue: ["awaiting_verification", "escalated"],
  escalated: ["awaiting_verification"],
  awaiting_verification: ["closed", "open"],
  closed: [],
};

export function canTransition(from: FindingStatus, to: FindingStatus): boolean {
  return FINDING_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: FindingStatus, to: FindingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal finding transition: ${from} -> ${to}`);
  }
}

// SLA windows in days per severity: how long until due, and the extra grace
// after due before automatic escalation. These are configuration defaults.
export interface FindingSla {
  dueInDays: number;
  escalateAfterOverdueDays: number;
}

export const DEFAULT_SLA: Record<FindingSeverity, FindingSla> = {
  critical: { dueInDays: 3, escalateAfterOverdueDays: 3 },
  major: { dueInDays: 7, escalateAfterOverdueDays: 7 },
  minor: { dueInDays: 21, escalateAfterOverdueDays: 14 },
};

export function dueDateFor(
  severity: FindingSeverity,
  raisedOn: Date,
  sla: Record<FindingSeverity, FindingSla> = DEFAULT_SLA,
): Date {
  const d = new Date(raisedOn);
  d.setUTCDate(d.getUTCDate() + sla[severity].dueInDays);
  return d;
}

export interface EscalationCheck {
  status: FindingStatus;
  severity: FindingSeverity;
  dueDate: Date;
}

/** True when an open/overdue finding has breached its escalation window. */
export function shouldEscalate(
  f: EscalationCheck,
  now: Date,
  sla: Record<FindingSeverity, FindingSla> = DEFAULT_SLA,
): boolean {
  if (f.status === "closed" || f.status === "escalated") return false;
  if (f.status === "awaiting_verification") return false;
  const graceMs = sla[f.severity].escalateAfterOverdueDays * 86_400_000;
  return now.getTime() > f.dueDate.getTime() + graceMs;
}

export function isOverdue(dueDate: Date, now: Date): boolean {
  return now.getTime() > dueDate.getTime();
}

export function escalationReason(
  severity: FindingSeverity,
  dueDate: Date,
  now: Date,
): string {
  const days = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
  const sev = severity.charAt(0).toUpperCase() + severity.slice(1);
  return `${sev} finding overdue by ${days} day${days === 1 ? "" : "s"}`;
}
