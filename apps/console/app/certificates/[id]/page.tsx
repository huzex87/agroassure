import Link from "next/link";
import { get } from "../../../lib/api";
import { Badge, Card } from "../../../components/ui";
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

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await get<Certificate>(`/v1/certificates/${id}`);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/facilities/${c.facility_id}`}
          className="text-sm text-ink-muted hover:text-primary-700"
        >
          ← {c.business_name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">Certificate {c.serial}</h1>
          {c.status === "valid" ? (
            <Badge tone="primary">Valid</Badge>
          ) : (
            <Badge tone="quiet">{c.status === "revoked" ? "Revoked" : "Superseded"}</Badge>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Certificate of compliance" className="lg:col-span-2">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Business</dt>
              <dd className="font-medium">{c.business_name}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Licence number</dt>
              <dd>{c.licence_number}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Facility type</dt>
              <dd>{label(FACILITY_TYPE_LABEL, c.facility_type)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Local government area</dt>
              <dd>{c.lga ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Inspection</dt>
              <dd>
                <Link
                  href={`/inspections/${c.inspection_id}`}
                  className="text-ink hover:text-primary-700"
                >
                  {c.inspection_reference}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Rating</dt>
              <dd>
                <Rating band={c.rating_band} percent={c.rating_percent} />
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Issued</dt>
              <dd>{formatDate(c.issued_on)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Valid to</dt>
              <dd>{formatDate(c.valid_to)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Next inspection due</dt>
              <dd>{formatDate(c.next_due_on)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Authorising officer</dt>
              {/* There is no certificate record without this name: the column is
                  NOT NULL, so the database refuses a row that lacks one. */}
              <dd className="font-medium">{c.authorising_officer_name}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
            <a
              href={`/api/certificates/${c.id}/pdf`}
              className="rounded-[12px] bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              Download PDF
            </a>
            <a
              href={`/api/certificates/${c.id}/html`}
              className="rounded-[12px] bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line hover:bg-primary-50"
            >
              Preview
            </a>
          </div>
        </Card>

        <Card title="Public verification">
          <p className="text-sm text-ink-muted">
            The code below is what the QR on the certificate resolves to. A buyer scanning it
            gets one of exactly two answers: this certificate, or a neutral statement that no
            current certificate is on record.
          </p>
          <p className="mt-3 break-all rounded-[12px] bg-canvas px-3 py-2 font-mono text-xs">
            {c.verification_token}
          </p>
          <p className="mt-4 text-sm text-ink-muted">
            Issued under the authority of {c.issuing_authority_legal}. AgroAssure records and
            renders this certificate; it does not issue it.
          </p>
          {!c.mark_asset_url && (
            <p className="mt-3 text-xs text-ink-muted">
              No authority mark has been supplied. The platform never invents one, so the
              rendered certificate shows the space where the authority&rsquo;s own mark belongs.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
