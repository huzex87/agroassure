import Link from "next/link";
import { get } from "../../../lib/api";
import { Card, Cell, Empty, Row, Table } from "../../../components/ui";
import { Rating } from "../../../components/status";
import { FACILITY_TYPE_LABEL, formatDate, formatPercent, label } from "../../../lib/format";

export const dynamic = "force-dynamic";

interface FacilityDetail {
  facility: Record<string, unknown>;
  inspections: Array<{
    id: string;
    reference: string;
    submitted_at: string | null;
    rating_percent: string | null;
    rating_band: string | null;
    findings_count: number;
    checkin_flagged: boolean;
    inspector: string;
  }>;
  certificates: Array<{
    id: string;
    serial: string;
    rating_band: string;
    issued_on: string;
    valid_to: string;
    next_due_on: string;
    status: string;
  }>;
}

export default async function FacilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { facility, inspections, certificates } = await get<FacilityDetail>(
    `/v1/facilities/${id}`,
  );

  const lat = facility.lat as number | null;
  const lng = facility.lng as number | null;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/facilities" className="text-sm text-ink-muted hover:text-primary-700">
          ← Facilities
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-ink">{String(facility.name)}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {String(facility.licence_number)} ·{" "}
          {label(FACILITY_TYPE_LABEL, facility.facility_type as string)}
          {facility.lga ? ` · ${String(facility.lga)} LGA` : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Registered location" className="lg:col-span-1">
          {lat === null || lng === null ? (
            <p className="text-sm text-ink-muted">
              No registered point yet. The first inspection captures one, and every visit
              afterwards is checked against it.
            </p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Latitude</dt>
                <dd className="tabular-nums">{lat.toFixed(5)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Longitude</dt>
                <dd className="tabular-nums">{lng.toFixed(5)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Accuracy</dt>
                <dd className="tabular-nums">
                  {facility.registered_accuracy_m ? `${facility.registered_accuracy_m} m` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Recorded</dt>
                <dd>{formatDate(facility.registered_at as string)}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card title="Certificates" className="lg:col-span-2">
          <Table
            head={["Serial", "Rating", "Issued", "Valid to", "Next due", "Status"]}
            empty={
              certificates.length === 0 ? (
                <Empty>No certificate has been authorised for this facility.</Empty>
              ) : undefined
            }
          >
            {certificates.map((c) => (
              <Row key={c.id}>
                <Cell>
                  <Link
                    href={`/certificates/${c.id}`}
                    className="font-mono text-xs text-ink hover:text-primary-700"
                  >
                    {c.serial}
                  </Link>
                </Cell>
                <Cell>
                  <Rating band={c.rating_band} />
                </Cell>
                <Cell className="text-ink-muted">{formatDate(c.issued_on)}</Cell>
                <Cell className="text-ink-muted">{formatDate(c.valid_to)}</Cell>
                <Cell className="text-ink-muted">{formatDate(c.next_due_on)}</Cell>
                <Cell className="text-ink-muted capitalize">{c.status}</Cell>
              </Row>
            ))}
          </Table>
        </Card>
      </div>

      <Card title="Inspection history" subtitle="Every visit, newest first.">
        <Table
          head={["Reference", "Submitted", "Inspector", "Rating", "Findings", ""]}
          empty={
            inspections.length === 0 ? (
              <Empty>This facility has not been inspected yet.</Empty>
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
              </Cell>
              <Cell className="text-ink-muted">{formatDate(i.submitted_at)}</Cell>
              <Cell className="text-ink-muted">{i.inspector}</Cell>
              <Cell>
                <Rating band={i.rating_band} percent={i.rating_percent} />
              </Cell>
              <Cell className="tabular-nums">{i.findings_count}</Cell>
              <Cell>
                {i.checkin_flagged && (
                  <span className="text-xs text-primary-700">Check-in flagged</span>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>
    </div>
  );
}
