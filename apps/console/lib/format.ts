// Labels and formatting. The vocabulary shown to a regulator is the
// regulator's own, so these maps are the single place a wire value becomes a
// word on a screen.

export const FACILITY_TYPE_LABEL: Record<string, string> = {
  agro_dealer: "Agro-dealer warehouse",
  blending_plant: "Processing and blending plant",
  manufacturing: "Manufacturing plant",
  importer: "Importer",
};

export const RATING_LABEL: Record<string, string> = {
  satisfactory: "Satisfactory",
  needs_improvement: "Needs Improvement",
  critical_issues: "Critical Issues",
};

export const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

export const FINDING_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  overdue: "Overdue",
  awaiting_verification: "Awaiting verification",
  escalated: "Escalated",
  closed: "Closed",
};

export const DECISION_LABEL: Record<string, string> = {
  accept: "Accepted",
  request_clarification: "Clarification requested",
  direct_follow_up: "Follow-up directed",
  escalate: "Escalated",
  authorise_certificate: "Certificate authorised",
};

export const CERTIFICATE_STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  due_soon: "Due soon",
  overdue: "Overdue",
  never_inspected: "Not yet inspected",
};

export const RESPONSE_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key;
}

/** A date a Nigerian regulator would write: 18 Aug 2026. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(value)}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })}`;
}

/** Ratings are shown whole, the way the sign-off screen showed the inspector. */
export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : "—";
}

/** "2.10" belongs after "2.9", which a string sort would get wrong. */
export function compareCheckpointRefs(a: string, b: string): number {
  const [as = "0", ac = "0"] = a.split(".");
  const [bs = "0", bc = "0"] = b.split(".");
  return Number(as) - Number(bs) || Number(ac) - Number(bc);
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return null;
  return Math.round((then - Date.now()) / 86_400_000);
}
