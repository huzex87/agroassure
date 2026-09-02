import Link from "next/link";
import { get, type FacilityRow } from "../../lib/api";
import { Card, Cell, Empty, Row, Table } from "../../components/ui";
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
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Facilities</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {facilities.length} in this jurisdiction · {counts.valid ?? 0} valid ·{" "}
          {counts.due_soon ?? 0} due soon · {counts.overdue ?? 0} overdue ·{" "}
          {counts.never_inspected ?? 0} not yet inspected
        </p>
      </header>

      <Card>
        <RegistryMap facilities={facilities} />
      </Card>

      <Card>
        <form className="mb-4 flex flex-wrap gap-3" action="/facilities">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Business name or licence number"
            aria-label="Search by business name or licence number"
            className="min-w-56 flex-1 rounded-[12px] border border-line px-3 py-2 text-sm"
          />
          <select
            name="type"
            defaultValue={params.type ?? ""}
            aria-label="Facility type"
            className="rounded-[12px] border border-line px-3 py-2 text-sm"
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
            className="w-32 rounded-[12px] border border-line px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-[12px] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            Filter
          </button>
        </form>

        <Table
          head={["Business", "Type", "LGA", "Last inspected", "Rating", "Certificate"]}
          empty={
            facilities.length === 0 ? (
              <Empty>No facility matches this search.</Empty>
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
        </Table>
      </Card>
    </div>
  );
}
