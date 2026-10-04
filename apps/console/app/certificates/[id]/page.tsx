import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { get } from "../../../lib/api";
import { Badge, Button, Facts, PageHeader, Panel, Progress } from "../../../components/ui";
import { Rating } from "../../../components/status";
import { FACILITY_TYPE_LABEL, formatDate, label } from "../../../lib/format";

export const dynamic = "force-dynamic";

interface Certificate {
  id: string;
  serial: string;
  verification_token: string;
  business_name: string;
  licence_number: string;
  facility_type: string;
  lga: string | null;
  inspection_reference: string;
  inspection_id: string;
  facility_id: string;
  rating_band: string;
  rating_percent: string;
  issued_on: string;
  valid_to: string;
  next_due_on: string;
  status: string;
  authorising_officer_name: string;
  issuing_authority: string;
  issuing_authority_legal: string;
  mark_asset_url: string | null;
}

const DAY = 86_400_000;

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await get<Certificate>(`/v1/certificates/${id}`);

  // How much of its life the certificate has used, said in days. Only a valid
  // certificate has a life left to show; a revoked or superseded one has ended.
  const issued = new Date(c.issued_on).getTime();
  const end = new Date(c.valid_to).getTime();
  const total = Math.max(1, Math.round((end - issued) / DAY));
  const remaining = Math.round((end - Date.now()) / DAY);
  const used = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
  const tone = remaining < 0 ? "destructive" : remaining <= 30 ? "warning" : "success";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Facilities", href: "/facilities" },
          { label: c.business_name, href: `/facilities/${c.facility_id}` },
          { label: c.serial },
        ]}
        title={`Certificate ${c.serial}`}
        badges={
          c.status === "valid" ? (
            <Badge variant="success" dot>Valid</Badge>
          ) : (
            <Badge variant={c.status === "revoked" ? "destructive" : "secondary"} dot>
              {c.status === "revoked" ? "Revoked" : "Superseded"}
            </Badge>
          )
        }
        summary={`Rendered on behalf of ${c.issuing_authority}.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={`/api/certificates/${c.id}/html`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Preview
              </a>
            </Button>
            <Button asChild>
              <a href={`/api/certificates/${c.id}/pdf`}>
                <Download aria-hidden /> Download PDF
              </a>
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Certificate of compliance">
            <div className="border-border mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
              <div className="min-w-0">
                <p className="text-caption text-muted-foreground font-medium">Business</p>
                <p className="text-title mt-1 font-semibold tracking-tight">{c.business_name}</p>
                <p className="text-body text-muted-foreground mt-0.5 font-mono">{c.licence_number}</p>
              </div>
              <Rating band={c.rating_band} percent={c.rating_percent} />
            </div>

            <Facts
              layout="grid"
              items={[
                { label: "Facility type", value: label(FACILITY_TYPE_LABEL, c.facility_type) },
                { label: "Local government area", value: c.lga ?? "—" },
                {
                  label: "Inspection",
                  value: (
                    <Link href={`/inspections/${c.inspection_id}`} className="hover:text-primary-700 font-medium">
                      {c.inspection_reference}
                    </Link>
                  ),
                },
                // There is no certificate record without this name: the column is
                // NOT NULL, so the database refuses a row that lacks one.
                { label: "Authorising officer", value: <span className="font-medium">{c.authorising_officer_name}</span> },
                { label: "Issued", value: formatDate(c.issued_on) },
                { label: "Valid to", value: formatDate(c.valid_to) },
                { label: "Next inspection due", value: formatDate(c.next_due_on) },
              ]}
            />
          </Panel>

          {c.status === "valid" ? (
            <Panel title="Validity" subtitle="How much of this certificate's period has passed.">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-title font-semibold tracking-tight tabular">
                  {remaining >= 0 ? `${remaining} ${remaining === 1 ? "day" : "days"} remaining` : `Lapsed ${-remaining} days ago`}
                </p>
                <p className="text-caption text-muted-foreground tabular">
                  {formatDate(c.issued_on)} to {formatDate(c.valid_to)}
                </p>
              </div>
              <Progress value={used} tone={tone} className="mt-3" aria-label="Share of the validity period used" />
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <Panel title="Public verification">
            <p className="text-body text-muted-foreground">
              The code below is what the QR on the certificate resolves to. A buyer scanning it gets one of
              exactly two answers: this certificate, or a neutral statement that no current certificate is on
              record.
            </p>
            <p className="border-border bg-muted/50 mt-4 rounded-control border px-3 py-2.5 font-mono text-[0.8125rem] break-all">
              {c.verification_token}
            </p>
            <p className="text-caption text-muted-foreground mt-4">
              Issued under the authority of {c.issuing_authority_legal}. AgroAssure records and renders this
              certificate; it does not issue it.
            </p>
            {!c.mark_asset_url && (
              <p className="text-caption text-muted-foreground mt-3">
                No authority mark has been supplied. The platform never invents one, so the rendered certificate
                shows the space where the authority&rsquo;s own mark belongs.
              </p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
