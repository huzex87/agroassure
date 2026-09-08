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
// The variants used to be tints of one blue, which meant a valid certificate
// and a critical finding looked the same. Colour was doing no work. Now success,
// warning and destructive are distinct hues and mean the same thing wherever
// they appear: green is settled, amber wants attention this week, red wants it
// today.

export function CertificateStatus({ status }: { status: string }) {
  const variant =
    status === "valid"
      ? "success"
      : status === "due_soon"
        ? "warning"
        : status === "overdue"
          ? "destructive"
          : "secondary";
  return (
    <Badge variant={variant} dot>
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
  if (!band) return <span className="text-sm text-muted-foreground">Not rated</span>;
  const variant =
    band === "satisfactory" ? "success" : band === "needs_improvement" ? "warning" : "destructive";
  return (
    <Badge variant={variant} dot>
      {label(RATING_LABEL, band)}
      {percent !== undefined && percent !== null ? ` · ${Math.round(Number(percent))}%` : ""}
    </Badge>
  );
}

export function Severity({ severity }: { severity: string }) {
  const variant =
    severity === "critical" ? "destructive" : severity === "major" ? "warning" : "secondary";
  return <Badge variant={variant}>{label(SEVERITY_LABEL, severity)}</Badge>;
}

export function FindingStatus({
  status,
  daysPastDue,
}: {
  status: string;
  daysPastDue?: number | null;
}) {
  const variant =
    status === "closed"
      ? "success"
      : status === "escalated" || status === "overdue"
        ? "destructive"
        : status === "awaiting_verification"
          ? "warning"
          : "accent";
  const overdue = daysPastDue !== null && daysPastDue !== undefined && daysPastDue > 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant={variant} dot>
        {label(FINDING_STATUS_LABEL, status)}
      </Badge>
      {overdue && status !== "closed" && (
        <span className="text-xs font-medium text-destructive">
          {daysPastDue} day{daysPastDue === 1 ? "" : "s"} past due
        </span>
      )}
    </span>
  );
}

export function Response({ response }: { response: "yes" | "no" | "na" }) {
  // Three responses, and only three: the instrument offers what the paper form
  // offers, so the review screen shows exactly the same vocabulary.
  const variant = response === "yes" ? "success" : response === "no" ? "destructive" : "secondary";
  const text = response === "yes" ? "Yes" : response === "no" ? "No" : "N/A";
  return <Badge variant={variant}>{text}</Badge>;
}
