import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { get, type FacilityRow } from "../../lib/api";
import { Panel, Cell, Empty, Row, DataTable, PageHeader } from "../../components/ui";
import { CertificateStatus, Rating } from "../../components/status";
import { RegistryMap } from "../../components/registry-map";
import { FACILITY_TYPE_LABEL, formatDate, label } from "../../lib/format";

// The registry: every regulated site, with the status of its certificate.
// Status is derived at read time rather than stored, so a certificate that
// lapsed overnight reads as overdue this morning with no job having run.

export const dynamic = "force-dynamic";

const TYPES = Object.entries(FACILITY_TYPE_LABEL);

const STATUSES: Array<[string, string]> = [
  ["valid", "Valid"],
  ["due_soon", "Due soon"],
  ["overdue", "Overdue"],
  ["never_inspected", "Not yet inspected"],
];

const CHIP_DOT: Record<string, string> = {
  "": "bg-primary",
  valid: "bg-success",
  due_soon: "bg-warning",
  overdue: "bg-destructive",
  never_inspected: "bg-ink-faint",
};

export default async function FacilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; lga?: string; status?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.type) query.set("type", params.type);
  if (params.lga) query.set("lga", params.lga);

  const everyone = await get<FacilityRow[]>(`/v1/facilities?${query}`);
  const counts = everyone.reduce<Record<string, number>>((acc, f) => {
    acc[f.certificate_status] = (acc[f.certificate_status] ?? 0) + 1;
    return acc;
  }, {});
  // The status chips narrow what is already fetched, so the counts on them stay
  // the whole picture for this search rather than collapsing to the chosen one.
  const status = params.status && STATUSES.some(([value]) => value === params.status) ? params.status : "";
  const facilities = status ? everyone.filter((f) => f.certificate_status === status) : everyone;

  const chipHref = (value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set("status", value);
    const qs = next.toString();
    return qs ? `/facilities?${qs}` : "/facilities";
  };

  return (
    <>
      <PageHeader
        title="Facilities"
        summary={`Every regulated site in this jurisdiction, with the standing of its certificate.`}
        actions={
          <>
            <Link
              href="/facilities/new?tab=import"
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-card px-3 text-sm font-medium shadow-xs transition-colors hover:bg-surface-sunk"
            >
              <FileSpreadsheet className="size-4" aria-hidden /> Import
            </Link>
            <Link
              href="/facilities/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-control bg-primary px-3.5 text-sm font-semibold text-white shadow-raised transition-colors hover:bg-primary-600"
            >
              <Plus className="size-4" aria-hidden /> Add facility
            </Link>
          </>
        }
      />

      <nav aria-label="Filter by certificate status" className="flex flex-wrap gap-2">
        {([["", "All"], ...STATUSES] as Array<[string, string]>).map(([value, text]) => {
          const on = status === value;
          const n = value ? (counts[value] ?? 0) : everyone.length;
          return (
            <Link
              key={value || "all"}
              href={chipHref(value)}
              aria-current={on ? "true" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-pill border px-3.5 text-sm transition-colors ${
                on
                  ? "border-primary-200 bg-primary-50 font-semibold text-primary-700"
                  : "border-line bg-card text-ink-muted hover:bg-surface-sunk hover:text-ink"
              }`}
            >
              <span aria-hidden className={`size-2 rounded-full ${CHIP_DOT[value]}`} />
              {text}
              <span className={`tabular text-xs ${on ? "text-primary-700" : "text-ink-faint"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <Panel>
        <RegistryMap facilities={facilities} />
      </Panel>

      <Panel>
        <form className="mb-5 flex flex-wrap gap-3" action="/facilities">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name or licence number"
            aria-label="Search by business name or licence number"
            className="field min-w-[15rem] flex-1"
          />
          <select
            name="type"
            defaultValue={params.type ?? ""}
            aria-label="Facility type"
            className="field"
          >
            <option value="">All types</option>
            {TYPES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <input
            name="lga"
            defaultValue={params.lga ?? ""}
            placeholder="LGA"
            aria-label="Local government area"
            className="field w-36"
          />
          <button
            type="submit"
            className="inline-flex items-center rounded-control bg-primary px-4 py-2 text-sm font-medium text-white shadow-raised transition-colors hover:bg-primary-600"
          >
            Filter
          </button>
        </form>

        <DataTable
          head={["Business", "Type", "LGA", "Last inspected", "Rating", "Certificate"]}
          empty={
            facilities.length === 0 ? (
              params.q || params.type || params.lga || status ? (
                <Empty>No facility matches this search.</Empty>
              ) : (
                <Empty
                  action={
                    <Link
                      href="/facilities/new?tab=import"
                      className="inline-flex h-9 items-center gap-1.5 rounded-control bg-primary px-3.5 text-sm font-semibold text-white shadow-raised hover:bg-primary-600"
                    >
                      <FileSpreadsheet className="size-4" aria-hidden /> Import your registry
                    </Link>
                  }
                >
                  No facilities yet. Import the spreadsheet you already keep, or add them one at a time.
                </Empty>
              )
            ) : undefined
          }
        >
          {facilities.map((f) => (
            <Row key={f.id}>
              <Cell>
                <Link
                  href={`/facilities/${f.id}`}
                  className="font-medium text-ink hover:text-primary-700"
                >
                  {f.name}
                </Link>
                <p className="text-xs text-ink-muted">{f.licence_number}</p>
              </Cell>
              <Cell className="text-ink-muted">{label(FACILITY_TYPE_LABEL, f.facility_type)}</Cell>
              <Cell className="text-ink-muted">{f.lga ?? "—"}</Cell>
              <Cell className="text-ink-muted">{formatDate(f.last_inspected)}</Cell>
              <Cell>
                <Rating band={f.last_rating_band} />
              </Cell>
              <Cell>
                <CertificateStatus status={f.certificate_status} />
                {f.certificate_valid_to && (
                  <p className="mt-1 text-xs text-ink-muted">
                    to {formatDate(f.certificate_valid_to)}
                  </p>
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
