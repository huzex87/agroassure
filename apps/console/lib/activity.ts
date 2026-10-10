// The activity summary, in words. The gateway counts events by their type name;
// a regulator reads "Inspections submitted", not "InspectionSubmitted".

export interface ActivityRow {
  event_type: string;
  events: number;
  actors: number;
  devices: number;
  first_at: string | null;
  last_at: string | null;
}

export interface ActorRow {
  full_name: string;
  events: number;
  first_at: string | null;
  last_at: string | null;
}

export interface ProcessingLog {
  generatedAt: string;
  period: { from: string; to: string };
  residency: string;
  byActivity: ActivityRow[];
  byActor: ActorRow[];
}

const EVENT_LABEL: Record<string, string> = {
  InspectionStarted: "Inspections started",
  ResponseRecorded: "Checklist answers recorded",
  EvidenceCaptured: "Photos and signatures captured",
  InspectionSubmitted: "Inspections submitted",
  FacilityRegistered: "Facilities registered",
  FacilityUpdated: "Facilities updated",
  FindingRaised: "Findings raised",
  FindingBecameOverdue: "Findings past due",
  FindingEscalated: "Findings escalated",
  FindingClosureSubmitted: "Closures submitted",
  FindingClosed: "Findings verified closed",
  DecisionRecorded: "Decisions recorded",
  CertificateAuthorised: "Certificates authorised",
  CertificateRevoked: "Certificates revoked",
};

/** A readable name for an event type; an unknown one is split into words rather than hidden. */
export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export const PERIODS = [7, 30, 90] as const;

/** The number of days asked for in the address bar, restricted to the offered periods. */
export function periodDays(raw: string | undefined): (typeof PERIODS)[number] {
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as (typeof PERIODS)[number]) : 30;
}

/** The first and last day of a period ending today, as the dates the gateway expects. */
export function periodRange(days: number, now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}
