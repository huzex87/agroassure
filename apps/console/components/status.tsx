import { Badge } from "./ui";
import {
  CERTIFICATE_STATUS_LABEL,
  FINDING_STATUS_LABEL,
  RATING_LABEL,
  SEVERITY_LABEL,
  label,
} from "../lib/format";

// Every status is a word first. Colour is a second channel that helps a sighted
// reader scan a column; it never carries meaning on its own, so the registry
// stays readable to a colour-blind user and in a printed export.
//
// The tones used to be tints of one blue, which meant a valid certificate and a
// critical finding looked the same. Colour was doing no work. Now good, caution
// and critical are distinct hues and mean the same thing wherever they appear:
// green is settled, amber wants attention this week, red wants it today.

export function CertificateStatus({ status }: { status: string }) {
  const tone =
    status === "valid"
      ? "good"
      : status === "due_soon"
        ? "caution"
        : status === "overdue"
          ? "critical"
          : "neutral";
  return (
    <Badge tone={tone} dot>
      {label(CERTIFICATE_STATUS_LABEL, status)}
    </Badge>
  );
}

export function Rating({
  band,
  percent,
}: {
  band: string | null;
  percent?: string | number | null;
}) {
  if (!band) return <span className="text-sm text-ink-faint">Not rated</span>;
  const tone =
    band === "satisfactory" ? "good" : band === "needs_improvement" ? "caution" : "critical";
  return (
    <Badge tone={tone} dot>
      {label(RATING_LABEL, band)}
      {percent !== undefined && percent !== null ? ` · ${Math.round(Number(percent))}%` : ""}
    </Badge>
  );
}

export function Severity({ severity }: { severity: string }) {
  const tone =
    severity === "critical" ? "critical" : severity === "major" ? "caution" : "neutral";
  return <Badge tone={tone}>{label(SEVERITY_LABEL, severity)}</Badge>;
}

export function FindingStatus({
  status,
  daysPastDue,
}: {
  status: string;
  daysPastDue?: number | null;
}) {
  const tone =
    status === "closed"
      ? "good"
      : status === "escalated" || status === "overdue"
        ? "critical"
        : status === "awaiting_verification"
          ? "caution"
          : "primary";
  const overdue = daysPastDue !== null && daysPastDue !== undefined && daysPastDue > 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={tone} dot>
        {label(FINDING_STATUS_LABEL, status)}
      </Badge>
      {overdue && status !== "closed" && (
        <span className="text-xs font-medium text-critical">
          {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past due
        </span>
      )}
    </span>
  );
}

export function Response({ response }: { response: "yes" | "no" | "na" }) {
  // Three responses, and only three: the instrument offers what the paper form
  // offers, so the review screen shows exactly the same vocabulary.
  const tone = response === "yes" ? "good" : response === "no" ? "critical" : "neutral";
  const text = response === "yes" ? "Yes" : response === "no" ? "No" : "N/A";
  return <Badge tone={tone}>{text}</Badge>;
}
