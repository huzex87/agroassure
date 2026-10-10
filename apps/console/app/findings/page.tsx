import Link from "next/link";
import { get, type FindingRow } from "../../lib/api";
import { Badge, Panel, Cell, Empty, Row, DataTable, FilterBar, PageHeader } from "../../components/ui";
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
    <>
      <PageHeader
        title="Findings"
        summary="Corrective actions raised by inspections, most urgent first. Overdue and escalated states arrive on their own."
        badges={
          <>
            {overdue > 0 ? (
              <Badge variant="destructive" dot>
                {overdue} past due
              </Badge>
            ) : null}
            {escalated > 0 ? (
              <Badge variant="warning" dot>
                {escalated} escalated
              </Badge>
            ) : null}
          </>
        }
      />

      <Panel flush>
        <FilterBar action="/findings" active={Boolean(params.status || params.severity || params.overdueOnly)}>
          <select name="status" defaultValue={params.status ?? ""} aria-label="Status" className="field w-48">
            <option value="">All states</option>
            {STATUSES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <select name="severity" defaultValue={params.severity ?? ""} aria-label="Severity" className="field w-44">
            <option value="">All severities</option>
            {SEVERITIES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <label className="text-body text-muted-foreground flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              name="overdueOnly"
              value="true"
              defaultChecked={params.overdueOnly === "true"}
              className="size-4 accent-[var(--primary)]"
            />
            Past due only
          </label>
        </FilterBar>

        <DataTable
          head={["Reference", "Facility", "Finding", "Severity", "Due", "Status"]}
          empty={
            findings.length === 0 ? (
              <Empty>Nothing outstanding matches this filter.</Empty>
            ) : undefined
          }
        >
          {findings.map((f) => (
            <Row key={f.id}>
              <Cell className="whitespace-nowrap">
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
              <Cell className="text-ink-muted whitespace-nowrap">{formatDate(f.due_date)}</Cell>
              <Cell>
                <FindingStatus status={f.status} daysPastDue={f.days_past_due} />
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
