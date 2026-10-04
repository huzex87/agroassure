import Link from "next/link";
import { get, type InspectionRow } from "../../lib/api";
import { Badge, Panel, Cell, Empty, Row, DataTable, FilterBar, PageHeader } from "../../components/ui";
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
    <>
      <PageHeader
        title="Inspections"
        summary="Every submitted inspection, with the rating it earned and whether an officer has decided."
        badges={
          awaiting > 0 ? (
            <Badge variant="warning" dot>
              {awaiting} awaiting a decision
            </Badge>
          ) : null
        }
      />

      <Panel flush>
        <FilterBar action="/inspections" active={Boolean(params.ratingBand || params.status || params.from || params.to)}>
          <select
            name="ratingBand"
            defaultValue={params.ratingBand ?? ""}
            aria-label="Rating"
            className="field w-48"
          >
            <option value="">All ratings</option>
            {BANDS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <label className="text-body text-muted-foreground flex items-center gap-2">
            From
            <input type="date" name="from" defaultValue={params.from ?? ""} className="field w-40" />
          </label>
          <label className="text-body text-muted-foreground flex items-center gap-2">
            To
            <input type="date" name="to" defaultValue={params.to ?? ""} className="field w-40" />
          </label>
        </FilterBar>

        <DataTable
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
                  {i.checkin_flagged && <Badge variant="warning">Check-in flagged</Badge>}
                  {i.version_discrepancy && <Badge variant="secondary">Version superseded mid-visit</Badge>}
                </div>
              </Cell>
              <Cell>
                <span className="text-ink">{i.facility_name}</span>
                <p className="text-xs text-ink-muted">
                  {i.licence_number}
                  {i.lga ? ` · ${i.lga}` : ""}
                </p>
              </Cell>
              <Cell className="text-ink-muted whitespace-nowrap">{i.inspector}</Cell>
              <Cell className="text-ink-muted whitespace-nowrap">{formatDate(i.submitted_at)}</Cell>
              <Cell>
                <Rating band={i.rating_band} percent={i.rating_percent} />
              </Cell>
              <Cell className="tabular-nums">{i.findings_count}</Cell>
              <Cell>
                {i.reviewed ? (
                  <Badge variant="success" dot>Decided</Badge>
                ) : (
                  <Badge variant="warning" dot>Awaiting decision</Badge>
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
