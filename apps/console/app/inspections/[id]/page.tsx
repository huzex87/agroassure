import Link from "next/link";
import { get, type InspectionDetail } from "../../../lib/api";
import { Badge, Button, Card, Cell, Empty, Row, Table } from "../../../components/ui";
import { FindingStatus, Rating, Response, Severity } from "../../../components/status";
import {
  DECISION_LABEL,
  compareCheckpointRefs,
  formatDate,
  formatDateTime,
  label,
} from "../../../lib/format";
import { authoriseCertificate, recordDecision, verifyFinding } from "./actions";

// The full case: what was answered, what was seen, what it was rated, what was
// found, and who decided what. An inspection is immutable once submitted, so
// nothing on this page edits it — a supervisor's act is a decision appended
// alongside the record, never a change to it.

export const dynamic = "force-dynamic";

const DECISION_OPTIONS = [
  ["accept", "Accept"],
  ["request_clarification", "Request clarification"],
  ["direct_follow_up", "Direct a follow-up"],
  ["escalate", "Escalate"],
  ["authorise_certificate", "Authorise a certificate"],
] as const;

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await get<InspectionDetail>(`/v1/inspections/${id}`);
  const i = detail.inspection as Record<string, string | number | boolean | null>;

  const evidenceByRef = new Map<string, InspectionDetail["evidence"]>();
  for (const e of detail.evidence) {
    const list = evidenceByRef.get(e.checkpoint_ref) ?? [];
    list.push(e);
    evidenceByRef.set(e.checkpoint_ref, list);
  }

  const responses = [...detail.responses].sort((a, b) =>
    compareCheckpointRefs(a.checkpoint_ref, b.checkpoint_ref),
  );
  const openFindings = detail.findings.filter((f) => f.status !== "closed");
  const authorised = detail.decisions.some((d) => d.decision_type === "authorise_certificate");

  return (
    <div className="space-y-6">
      <header>
        <Link href="/inspections" className="text-sm text-ink-muted hover:text-primary-700">
          ← Inspections
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{String(i.reference)}</h1>
          <Rating band={i.rating_band as string} percent={i.rating_percent as string} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {String(i.facility_name)} · {String(i.licence_number)} · inspected by{" "}
          {String(i.inspector_name)} on {formatDate(i.submitted_at as string)} using{" "}
          {String(i.version_label)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Check-in" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Distance from registered point</dt>
              <dd className="tabular-nums">
                {i.checkin_distance_m === null ? "—" : `${Math.round(Number(i.checkin_distance_m))} m`}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">GPS accuracy</dt>
              <dd className="tabular-nums">
                {i.checkin_accuracy_m === null ? "—" : `${Number(i.checkin_accuracy_m)} m`}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Status</dt>
              <dd>
                {i.checkin_flagged ? (
                  <Badge tone="warn">Flagged for review</Badge>
                ) : (
                  <Badge tone="quiet">Within range</Badge>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Signatures" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-ink-muted">Inspector</dt>
              <dd>
                {String(i.inspector_name)} · {formatDateTime(i.inspector_signed_at as string)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Facility representative</dt>
              <dd>
                {i.facility_rep_name ? String(i.facility_rep_name) : "—"} ·{" "}
                {formatDateTime(i.facility_signed_at as string)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Instrument" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Version</dt>
              <dd>{String(i.version_label)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Structure hash</dt>
              {/* The inspection is bound to the exact structure it was worked
                  against, so its meaning cannot drift with a later version. */}
              <dd className="break-all font-mono text-xs">{String(i.structure_hash_hex)}</dd>
            </div>
            {i.version_discrepancy ? (
              <p className="text-xs text-ink-muted">
                This version was superseded between download and the visit. The record shows the
                instrument actually worked.
              </p>
            ) : null}
          </dl>
        </Card>
      </div>

      <Card
        title="Findings"
        subtitle={`${openFindings.length} open of ${detail.findings.length}`}
      >
        <Table
          head={["Reference", "Checkpoint", "Summary", "Severity", "Due", "Status", ""]}
          empty={
            detail.findings.length === 0 ? (
              <Empty>No adverse response was recorded on this inspection.</Empty>
            ) : undefined
          }
        >
          {detail.findings.map((f) => (
            <Row key={f.id}>
              <Cell className="font-mono text-xs">{f.reference}</Cell>
              <Cell className="tabular-nums">{f.checkpoint_ref}</Cell>
              <Cell>{f.summary}</Cell>
              <Cell>
                <Severity severity={f.severity} />
              </Cell>
              <Cell className="text-ink-muted">{formatDate(f.due_date)}</Cell>
              <Cell>
                <FindingStatus status={f.status} />
                {f.escalated_at && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Escalated to {f.escalated_to?.replace("_", " ")} on{" "}
                    {formatDate(f.escalated_at)}
                  </p>
                )}
              </Cell>
              <Cell>
                {f.status === "awaiting_verification" && (
                  <form action={verifyFinding.bind(null, id, f.id)}>
                    <Button variant="quiet">Verify closed</Button>
                  </form>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <Card
        title="Responses"
        subtitle="Every checkpoint as answered on site, with the remark and exhibits captured at the moment of observation."
      >
        <ul className="divide-y divide-line">
          {responses.map((r) => {
            const exhibits = evidenceByRef.get(r.checkpoint_ref) ?? [];
            return (
              <li key={r.checkpoint_ref} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="w-12 shrink-0 font-mono text-xs text-ink-muted">
                    {r.checkpoint_ref}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{r.prompt_en ?? "(checkpoint removed)"}</p>
                    {r.remark && (
                      <p className="mt-1 rounded-[12px] bg-canvas px-3 py-2 text-sm text-ink-muted">
                        {r.remark}
                      </p>
                    )}
                    {exhibits.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {exhibits.map((e) => (
                          <li key={e.id} className="text-xs text-ink-muted">
                            <span className="font-mono">{e.sha256.slice(0, 12)}…</span> ·{" "}
                            {formatDateTime(e.captured_at)}
                            {e.lat !== null && e.lng !== null && (
                              <>
                                {" "}
                                · {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                              </>
                            )}{" "}
                            ·{" "}
                            {e.locked ? (
                              <span>checksummed at capture, stored write-once</span>
                            ) : (
                              <span>awaiting upload from the device</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Response response={r.response} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Decisions" subtitle="Append-only. A reversal is a new decision.">
          {detail.decisions.length === 0 ? (
            <Empty>No decision has been recorded on this inspection.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {detail.decisions.map((d) => (
                <li key={d.id} className="py-3">
                  <p className="text-sm font-medium text-ink">
                    {label(DECISION_LABEL, d.decision_type)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {d.officer} · {formatDateTime(d.decided_at)}
                  </p>
                  {d.basis && <p className="mt-1 text-sm text-ink-muted">{d.basis}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Record a decision">
          <form action={recordDecision.bind(null, id)} className="space-y-3">
            <label className="block text-sm">
              <span className="text-ink-muted">Decision</span>
              <select
                name="decisionType"
                required
                className="mt-1 w-full rounded-[12px] border border-line px-3 py-2 text-sm"
              >
                {DECISION_OPTIONS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Basis</span>
              <textarea
                name="basis"
                rows={3}
                placeholder="What this decision rests on."
                className="mt-1 w-full rounded-[12px] border border-line px-3 py-2 text-sm"
              />
            </label>
            <Button>Record decision</Button>
          </form>

          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-ink">Certificate</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Rendered on behalf of the mandated regulator, never issued by this platform. It
              requires an authorising decision by you, every finding verified closed, and a
              rating that supports issuance.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li className={authorised ? "text-ink" : "text-ink-muted"}>
                {authorised ? "✓" : "○"} An authorising decision is on record
              </li>
              <li className={openFindings.length === 0 ? "text-ink" : "text-ink-muted"}>
                {openFindings.length === 0 ? "✓" : "○"} All findings verified closed
                {openFindings.length > 0 ? ` (${openFindings.length} open)` : ""}
              </li>
              <li className={i.rating_band === "satisfactory" ? "text-ink" : "text-ink-muted"}>
                {i.rating_band === "satisfactory" ? "✓" : "○"} Rating supports issuance
              </li>
            </ul>
            <form action={authoriseCertificate.bind(null, id)} className="mt-3">
              <Button
                disabled={!authorised || openFindings.length > 0 || i.rating_band !== "satisfactory"}
              >
                Authorise certificate
              </Button>
            </form>
            {/* The button being enabled is a courtesy. The API checks all three
                conditions again, and the schema refuses an officer-less row. */}
          </div>
        </Card>
      </div>
    </div>
  );
}
