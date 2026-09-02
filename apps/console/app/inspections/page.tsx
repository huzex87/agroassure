import Link from "next/link";
import { get, type InspectionRow } from "../../lib/api";
import { Badge, Card, Cell, Empty, Row, Table } from "../../components/ui";
import { Rating } from "../../components/status";
import { formatDate } from "../../lib/format";

export const dynamic = "force-dynamic";

const BANDS = [
  ["satisfactory", "Satisfactory"],
  ["needs_improvement", "Needs Improvement"],
  ["critical_issues", "Critical Issues"],
] as const;

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ratingBand?: string; status?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["ratingBand", "status", "from", "to"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }

  const inspections = await get<InspectionRow[]>(`/v1/inspections?${query}`);
  const awaiting = inspections.filter((i) => i.status === "submitted" && !i.reviewed).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Inspections</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {inspections.length} shown · {awaiting} awaiting a decision
        </p>
      </header>

      <Card>
        <form className="mb-4 flex flex-wrap gap-3" action="/inspections">
          <select
            name="ratingBand"
            defaultValue={params.ratingBand ?? ""}
            aria-label="Rating"
            className="rounded-[12px] border border-line px-3 py-2 text-sm"
          >
            <option value="">All ratings</option>
            {BANDS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            From
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="rounded-[12px] border border-line px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            To
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="rounded-[12px] border border-line px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            Filter
          </button>
        </form>

        <Table
          head={["Reference", "Facility", "Inspector", "Submitted", "Rating", "Findings", "Review"]}
          empty={
            inspections.length === 0 ? (
              <Empty>No inspection matches this filter.</Empty>
            ) : undefined
          }
        >
          {inspections.map((i) => (
            <Row key={i.id}>
              <Cell>
                <Link
                  href={`/inspections/${i.id}`}
                  className="font-medium text-ink hover:text-primary-700"
                >
                  {i.reference}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  {/* Both of these are recorded facts, flagged for a human to
                      judge rather than reasons to have refused the record. */}
                  {i.checkin_flagged && <Badge tone="warn">Check-in flagged</Badge>}
                  {i.version_discrepancy && <Badge tone="quiet">Version superseded mid-visit</Badge>}
                </div>
              </Cell>
              <Cell>
                <span className="text-ink">{i.facility_name}</span>
                <p className="text-xs text-ink-muted">
                  {i.licence_number}
                  {i.lga ? ` · ${i.lga}` : ""}
                </p>
              </Cell>
              <Cell className="text-ink-muted">{i.inspector}</Cell>
              <Cell className="text-ink-muted">{formatDate(i.submitted_at)}</Cell>
              <Cell>
                <Rating band={i.rating_band} percent={i.rating_percent} />
              </Cell>
              <Cell className="tabular-nums">{i.findings_count}</Cell>
              <Cell>
                {i.reviewed ? (
                  <Badge tone="quiet">Decided</Badge>
                ) : (
                  <Badge tone="primary">Awaiting decision</Badge>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>
    </div>
  );
}
