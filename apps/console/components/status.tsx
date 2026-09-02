import { Badge } from "./ui";
import {
  CERTIFICATE_STATUS_LABEL,
  FINDING_STATUS_LABEL,
  RATING_LABEL,
  SEVERITY_LABEL,
  label,
} from "../lib/format";

// Every status in this console is a word first. Colour is a second channel that
// helps a sighted reader scan; it never carries meaning on its own, so the
// registry stays readable to a colour-blind user and in a printed export.

export function CertificateStatus({ status }: { status: string }) {
  const tone =
    status === "valid" ? "primary" : status === "due_soon" ? "warn" : "quiet";
  return <Badge tone={tone}>{label(CERTIFICATE_STATUS_LABEL, status)}</Badge>;
}

export function Rating({
  band,
  percent,
}: {
  band: string | null;
  percent?: string | number | null;
}) {
  if (!band) return <span className="text-ink-muted">Not rated</span>;
  const tone = band === "satisfactory" ? "primary" : band === "needs_improvement" ? "warn" : "quiet";
  return (
    <Badge tone={tone}>
      {label(RATING_LABEL, band)}
      {percent !== undefined && percent !== null ? ` · ${Math.round(Number(percent))}%` : ""}
    </Badge>
  );
}

export function Severity({ severity }: { severity: string }) {
  const tone = severity === "critical" ? "warn" : severity === "major" ? "primary" : "quiet";
  return <Badge tone={tone}>{label(SEVERITY_LABEL, severity)}</Badge>;
}

export function FindingStatus({
  status,
  daysPastDue,
}: {
  status: string;
  daysPastDue?: number | null;
}) {
  const tone = status === "closed" ? "quiet" : status === "escalated" ? "warn" : "primary";
  const overdue = daysPastDue !== null && daysPastDue !== undefined && daysPastDue > 0;
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone={tone}>{label(FINDING_STATUS_LABEL, status)}</Badge>
      {overdue && status !== "closed" && (
        <span className="text-xs text-ink-muted">
          {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past due
        </span>
      )}
    </span>
  );
}

export function Response({ response }: { response: "yes" | "no" | "na" }) {
  // Three responses, and only three: the instrument offers what the paper form
  // offers, so the review screen shows exactly the same vocabulary.
  const tone = response === "yes" ? "primary" : response === "no" ? "warn" : "quiet";
  const text = response === "yes" ? "Yes" : response === "no" ? "No" : "N/A";
  return <Badge tone={tone}>{text}</Badge>;
}
