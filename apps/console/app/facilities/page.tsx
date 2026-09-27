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

export default async function FacilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; lga?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.type) query.set("type", params.type);
  if (params.lga) query.set("lga", params.lga);

  const facilities = await get<FacilityRow[]>(`/v1/facilities?${query}`);
  const counts = facilities.reduce<Record<string, number>>((acc, f) => {
    acc[f.certificate_status] = (acc[f.certificate_status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Facilities"
        summary={
          <>
          {facilities.length} in this jurisdiction · {counts.valid ?? 0} valid ·{" "}
          {counts.due_soon ?? 0} due soon · {counts.overdue ?? 0} overdue ·{" "}
          {counts.never_inspected ?? 0} not yet inspected
          </>
        }
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

      <Panel>
        <RegistryMap facilities={facilities} />
      </Panel>

      <Panel>
        <form className="mb-4 flex flex-wrap gap-3" action="/facilities">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Business name or licence number"
            aria-label="Search by business name or licence number"
            className="field"
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
            className="field"
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
              params.q || params.type || params.lga ? (
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
