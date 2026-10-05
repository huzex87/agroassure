import Link from "next/link";
import { get } from "../../../lib/api";
import { Badge, Cell, DataTable, Empty, Facts, PageHeader, Panel, Row } from "../../../components/ui";
import { Rating } from "../../../components/status";
import { FACILITY_TYPE_LABEL, formatDate, label } from "../../../lib/format";

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
  const current = certificates.find((c) => c.status === "valid");

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Facilities", href: "/facilities" }, { label: String(facility.name) }]}
        title={String(facility.name)}
        badges={
          current ? (
            <Badge variant="success" dot>
              Certificate valid to {formatDate(current.valid_to)}
            </Badge>
          ) : (
            <Badge variant="secondary" dot>No valid certificate</Badge>
          )
        }
        summary={
          <>
            <span className="font-mono text-[0.8125rem]">{String(facility.licence_number)}</span> ·{" "}
            {label(FACILITY_TYPE_LABEL, facility.facility_type as string)}
            {facility.lga ? ` · ${String(facility.lga)} LGA` : ""}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title="Registered location" subtitle="Every visit is checked against this point.">
          {lat === null || lng === null ? (
            <p className="text-body text-muted-foreground">
              No registered point yet. The first inspection captures one, and every visit afterwards is checked
              against it.
            </p>
          ) : (
            <Facts
              items={[
                { label: "Latitude", value: <span className="tabular">{lat.toFixed(5)}</span> },
                { label: "Longitude", value: <span className="tabular">{lng.toFixed(5)}</span> },
                {
                  label: "Accuracy",
                  value: (
                    <span className="tabular">
                      {facility.registered_accuracy_m ? `± ${facility.registered_accuracy_m} m` : "—"}
                    </span>
                  ),
                },
                { label: "Recorded", value: formatDate(facility.registered_at as string) },
              ]}
            />
          )}
        </Panel>

        <Panel flush title="Certificates" subtitle="Newest first. A new certificate supersedes the one before it.">
          <DataTable
            head={["Serial", "Rating", "Issued", "Valid to", "Next due", "Status"]}
            empty={
              certificates.length === 0 ? (
                <Empty>No certificate has been authorised for this facility.</Empty>
              ) : undefined
            }
          >
            {certificates.map((c) => (
              <Row key={c.id}>
                <Cell className="whitespace-nowrap">
                  <Link
                    href={`/certificates/${c.id}`}
                    className="hover:text-primary-700 font-mono text-[0.8125rem] font-medium"
                  >
                    {c.serial}
                  </Link>
                </Cell>
                <Cell>
                  <Rating band={c.rating_band} />
                </Cell>
                <Cell className="text-muted-foreground whitespace-nowrap">{formatDate(c.issued_on)}</Cell>
                <Cell className="text-muted-foreground whitespace-nowrap">{formatDate(c.valid_to)}</Cell>
                <Cell className="text-muted-foreground whitespace-nowrap">{formatDate(c.next_due_on)}</Cell>
                <Cell>
                  <Badge variant={c.status === "valid" ? "success" : c.status === "revoked" ? "destructive" : "secondary"} dot>
                    {c.status === "valid" ? "Valid" : c.status === "revoked" ? "Revoked" : "Superseded"}
                  </Badge>
                </Cell>
              </Row>
            ))}
          </DataTable>
        </Panel>
      </div>

      <Panel flush title="Inspection history" subtitle="Every visit, newest first.">
        <DataTable
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
                <Link href={`/inspections/${i.id}`} className="hover:text-primary-700 font-medium">
                  {i.reference}
                </Link>
              </Cell>
              <Cell className="text-muted-foreground whitespace-nowrap">{formatDate(i.submitted_at)}</Cell>
              <Cell className="text-muted-foreground whitespace-nowrap">{i.inspector}</Cell>
              <Cell>
                <Rating band={i.rating_band} percent={i.rating_percent} />
              </Cell>
              <Cell className="tabular">{i.findings_count}</Cell>
              <Cell>{i.checkin_flagged && <Badge variant="warning">Check-in flagged</Badge>}</Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
