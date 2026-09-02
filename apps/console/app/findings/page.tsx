import Link from "next/link";
import { get, type FindingRow } from "../../lib/api";
import { Card, Cell, Empty, Row, Table } from "../../components/ui";
import { FindingStatus, Severity } from "../../components/status";
import { formatDate } from "../../lib/format";

// The corrective-action worklist: the finding projection filtered by state,
// sorted by severity then due date. Overdue and escalated states arrive here
// from the sweep, not from anyone remembering to check.

export const dynamic = "force-dynamic";

const STATUSES = [
  ["open", "Open"],
  ["overdue", "Overdue"],
  ["awaiting_verification", "Awaiting verification"],
  ["escalated", "Escalated"],
  ["closed", "Closed"],
] as const;

const SEVERITIES = [
  ["critical", "Critical"],
  ["major", "Major"],
  ["minor", "Minor"],
] as const;

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; overdueOnly?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.severity) query.set("severity", params.severity);
  if (params.overdueOnly === "true") query.set("overdueOnly", "true");

  const findings = await get<FindingRow[]>(`/v1/findings?${query}`);
  const overdue = findings.filter((f) => f.past_due && f.status !== "closed").length;
  const escalated = findings.filter((f) => f.status === "escalated").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Corrective actions</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {findings.length} shown · {overdue} past due · {escalated} escalated
        </p>
      </header>

      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-3" action="/findings">
          <select
            name="status"
            defaultValue={params.status ?? ""}
            aria-label="Status"
            className="rounded-[12px] border border-line px-3 py-2 text-sm"
          >
            <option value="">All states</option>
            {STATUSES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <select
            name="severity"
            defaultValue={params.severity ?? ""}
            aria-label="Severity"
            className="rounded-[12px] border border-line px-3 py-2 text-sm"
          >
            <option value="">All severities</option>
            {SEVERITIES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="overdueOnly"
              value="true"
              defaultChecked={params.overdueOnly === "true"}
              className="h-4 w-4 rounded border-line"
            />
            Past due only
          </label>
          <button
            type="submit"
            className="rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            Filter
          </button>
        </form>

        <Table
          head={["Reference", "Facility", "Finding", "Severity", "Due", "Status"]}
          empty={
            findings.length === 0 ? (
              <Empty>Nothing outstanding matches this filter.</Empty>
            ) : undefined
          }
        >
          {findings.map((f) => (
            <Row key={f.id}>
              <Cell>
                <Link
                  href={`/inspections/${f.inspection_id}`}
                  className="font-mono text-xs text-ink hover:text-primary-700"
                >
                  {f.reference}
                </Link>
                <p className="text-xs text-ink-muted">{f.inspection_reference}</p>
              </Cell>
              <Cell>
                <Link
                  href={`/facilities/${f.facility_id}`}
                  className="text-ink hover:text-primary-700"
                >
                  {f.facility_name}
                </Link>
                <p className="text-xs text-ink-muted">
                  {f.licence_number}
                  {f.lga ? ` · ${f.lga}` : ""}
                </p>
              </Cell>
              <Cell>
                <span className="font-mono text-xs text-ink-muted">{f.checkpoint_ref}</span>{" "}
                {f.summary}
                {f.owner_label && (
                  <p className="text-xs text-ink-muted">Owner: {f.owner_label}</p>
                )}
              </Cell>
              <Cell>
                <Severity severity={f.severity} />
              </Cell>
              <Cell className="text-ink-muted">{formatDate(f.due_date)}</Cell>
              <Cell>
                <FindingStatus status={f.status} daysPastDue={f.days_past_due} />
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>
    </div>
  );
}
