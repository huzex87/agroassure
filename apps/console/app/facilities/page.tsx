import Link from "next/link";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { get, type FacilityRow } from "../../lib/api";
import { Button, ChipNav, Panel, Cell, Empty, Row, DataTable, FilterBar, PageHeader } from "../../components/ui";
import { CertificateStatus, Rating } from "../../components/status";
import { RegistryMap } from "../../components/registry-map";
import { Pagination } from "../../components/pagination";
import { FACILITY_TYPE_LABEL, formatDate, label } from "../../lib/format";
import { pageParam, paginate } from "../../lib/paging";

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
  searchParams: Promise<{ q?: string; type?: string; lga?: string; status?: string; page?: string }>;
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
  const paged = paginate(facilities, pageParam(params.page));

  // The current search and status, as an address: the base of the page links and
  // of the spreadsheet download, so both always match what is on screen.
  const current = new URLSearchParams(query);
  if (status) current.set("status", status);
  const pageHref = (n: number) => {
    const next = new URLSearchParams(current);
    if (n > 1) next.set("page", String(n));
    const qs = next.toString();
    return qs ? `/facilities?${qs}` : "/facilities";
  };

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
        summary="Every regulated site in this jurisdiction, with the standing of its certificate."
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={`/api/facilities/export?${current}`} download>
                <Download aria-hidden /> Export
              </a>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/facilities/new?tab=import">
                <FileSpreadsheet aria-hidden /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/facilities/new">
                <Plus aria-hidden /> Add facility
              </Link>
            </Button>
          </>
        }
      />

      <ChipNav
        label="Filter by certificate status"
        items={([["", "All"], ...STATUSES] as Array<[string, string]>).map(([value, text]) => ({
          label: text,
          href: chipHref(value),
          active: status === value,
          count: value ? (counts[value] ?? 0) : everyone.length,
          dot: CHIP_DOT[value],
        }))}
      />

      <Panel>
        <RegistryMap facilities={facilities} />
      </Panel>

      <Panel flush>
        <FilterBar action="/facilities" active={Boolean(params.q || params.type || params.lga || status)}>
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name or licence number"
            aria-label="Search by business name or licence number"
            className="field min-w-[15rem] flex-1"
          />
          <select name="type" defaultValue={params.type ?? ""} aria-label="Facility type" className="field w-52">
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
        </FilterBar>

        <DataTable
          head={["Business", "Type", "LGA", "Last inspected", "Rating", "Certificate"]}
          empty={
            facilities.length === 0 ? (
              params.q || params.type || params.lga || status ? (
                <Empty>No facility matches this search.</Empty>
              ) : (
                <Empty
                  action={
                    <Button asChild>
                      <Link href="/facilities/new?tab=import">
                        <FileSpreadsheet aria-hidden /> Import your registry
                      </Link>
                    </Button>
                  }
                >
                  No facilities yet. Import the spreadsheet you already keep, or add them one at a time.
                </Empty>
              )
            ) : undefined
          }
        >
          {paged.items.map((f) => (
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
        <Pagination paged={paged} hrefFor={pageHref} />
      </Panel>
    </>
  );
}
