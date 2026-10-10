import Link from "next/link";
import { Circle, CircleCheck, Paperclip } from "lucide-react";
import { get, type InspectionDetail } from "../../../lib/api";
import { Badge, Empty, Panel } from "../../../components/ui";
import { Button } from "../../../components/ui/button";
import { PageHeader } from "../../../components/ui";
import { ActionForm } from "../../../components/action-form";
import { Field, SubmitButton } from "../../../components/forms";
import { FindingStatus, Rating, Response, Severity } from "../../../components/status";
import { DECISION_LABEL, compareCheckpointRefs, formatDate, formatDateTime, label } from "../../../lib/format";
import { authoriseCertificate, recordDecision, verifyFinding } from "./actions";

// The full case: what was answered, what was seen, what it was rated, what was
// found, and who decided what. An inspection is immutable once submitted, so
// nothing on this page edits it — a supervisor's act is a decision appended
// alongside the record, never a change to it.
//
// The page is two columns because it does two jobs. On the left is the
// evidence, read top to bottom: how the visit went, what it found, every answer.
// On the right, kept in view while that is read, is what the officer does about
// it: decide, check the certificate's conditions, and see what has already been
// decided.

export const dynamic = "force-dynamic";

const DECISION_OPTIONS = [
  ["accept", "Accept"],
  ["request_clarification", "Request clarification"],
  ["direct_follow_up", "Direct a follow-up"],
  ["escalate", "Escalate"],
  ["authorise_certificate", "Authorise a certificate"],
] as const;

type Row_ = InspectionDetail["responses"][number];

/**
 * The responses in checkpoint order, gathered under the section they belong to.
 * Gathered by name rather than by adjacency, so a section is one group however
 * its checkpoints happen to be numbered.
 */
function bySection(responses: Row_[]): Array<{ title: string; rows: Row_[] }> {
  const sorted = [...responses].sort((a, b) => compareCheckpointRefs(a.checkpoint_ref, b.checkpoint_ref));
  const groups = new Map<string, Row_[]>();
  for (const r of sorted) {
    const title = r.section_title_en ?? "Other";
    groups.set(title, [...(groups.get(title) ?? []), r]);
  }
  return [...groups].map(([title, rows]) => ({ title, rows }));
}

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await get<InspectionDetail>(`/v1/inspections/${id}`);
  const i = detail.inspection as Record<string, string | number | boolean | null>;

  const evidenceByRef = new Map<string, InspectionDetail["evidence"]>();
  for (const e of detail.evidence) {
    const list = evidenceByRef.get(e.checkpoint_ref) ?? [];
    list.push(e);
    evidenceByRef.set(e.checkpoint_ref, list);
  }

  const sections = bySection(detail.responses);
  const tally = {
    yes: detail.responses.filter((r) => r.response === "yes").length,
    no: detail.responses.filter((r) => r.response === "no").length,
    na: detail.responses.filter((r) => r.response === "na").length,
  };
  const openFindings = detail.findings.filter((f) => f.status !== "closed");
  const authorised = detail.decisions.some((d) => d.decision_type === "authorise_certificate");
  const ratingOk = i.rating_band === "satisfactory";
  const canAuthorise = authorised && openFindings.length === 0 && ratingOk;

  // The three things a certificate needs, each with what is missing in words.
  const conditions: Array<{ met: boolean; text: string; hint: string }> = [
    {
      met: authorised,
      text: "An authorising decision is on record",
      hint: authorised ? "Recorded below." : "Record “Authorise a certificate” above.",
    },
    {
      met: openFindings.length === 0,
      text: "Every finding is verified closed",
      hint:
        openFindings.length === 0
          ? "Nothing is outstanding."
          : `${openFindings.length} ${openFindings.length === 1 ? "finding is" : "findings are"} still open.`,
    },
    {
      met: ratingOk,
      text: "The rating supports issuance",
      hint: ratingOk ? "Rated satisfactory." : "Only a satisfactory rating can be certified.",
    },
  ];

  const facilityId = typeof i.facility_id === "string" ? i.facility_id : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Inspections", href: "/inspections" }, { label: String(i.reference) }]}
        title={String(i.reference)}
        badges={
          <>
            <Rating band={i.rating_band as string} percent={i.rating_percent as string} />
            {detail.decisions.length > 0 ? (
              <Badge variant="success" dot>
                Decided
              </Badge>
            ) : (
              <Badge variant="warning" dot>
                Awaiting decision
              </Badge>
            )}
          </>
        }
        summary={
          <>
            {facilityId ? (
              <Link href={`/facilities/${facilityId}`} className="text-foreground hover:text-primary-700 font-medium">
                {String(i.facility_name)}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{String(i.facility_name)}</span>
            )}{" "}
            · {String(i.licence_number)} · inspected by {String(i.inspector_name)} on{" "}
            {formatDate(i.submitted_at as string)}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="The visit"
            footer={
              <span className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <span>
                  Checklist {String(i.version_label)} · structure hash{" "}
                  <span className="font-mono" title={String(i.structure_hash_hex)}>
                    {String(i.structure_hash_hex).slice(0, 10)}…{String(i.structure_hash_hex).slice(-6)}
                  </span>
                </span>
                {i.version_discrepancy ? (
                  <span>
                    This version was superseded between download and the visit. The record shows the checklist actually
                    worked.
                  </span>
                ) : (
                  <span>Bound at sign-off, so its meaning cannot drift.</span>
                )}
              </span>
            }
          >
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-caption text-muted-foreground font-medium">Check-in</dt>
                <dd className="text-heading mt-1 font-semibold tabular">
                  {i.checkin_distance_m === null ? "—" : `${Math.round(Number(i.checkin_distance_m))} m`}
                </dd>
                <dd className="mt-1.5">
                  {i.checkin_flagged ? (
                    <Badge variant="warning" dot>
                      Flagged for review
                    </Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Within range
                    </Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground font-medium">GPS accuracy</dt>
                <dd className="text-heading mt-1 font-semibold tabular">
                  {i.checkin_accuracy_m === null ? "—" : `± ${Number(i.checkin_accuracy_m)} m`}
                </dd>
                <dd className="text-caption text-muted-foreground mt-1.5">At check-in</dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground font-medium">Inspector signed</dt>
                <dd className="text-heading mt-1 font-semibold">{String(i.inspector_name)}</dd>
                <dd className="text-caption text-muted-foreground mt-1.5">
                  {formatDateTime(i.inspector_signed_at as string)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-muted-foreground font-medium">Facility signed</dt>
                <dd className="text-heading mt-1 font-semibold">
                  {i.facility_rep_name ? String(i.facility_rep_name) : "—"}
                </dd>
                <dd className="text-caption text-muted-foreground mt-1.5">
                  {formatDateTime(i.facility_signed_at as string)}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel flush title="Findings" subtitle={`${openFindings.length} open of ${detail.findings.length}`}>
            {detail.findings.length === 0 ? (
              <Empty>No adverse response was recorded on this inspection.</Empty>
            ) : (
              <ul className="divide-border divide-y">
                {detail.findings.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4">
                    <div className="min-w-0 flex-1 basis-72">
                      <div className="flex flex-wrap items-center gap-2">
                        <Severity severity={f.severity} />
                        <span className="text-caption text-muted-foreground font-mono">{f.reference}</span>
                        <span className="text-caption text-muted-foreground">· Checkpoint {f.checkpoint_ref}</span>
                      </div>
                      <p className="text-body mt-1.5 font-medium">{f.summary}</p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        Due {formatDate(f.due_date)}
                        {f.owner_label ? ` · Owner: ${f.owner_label}` : ""}
                      </p>
                      {f.escalated_at && (
                        <p className="text-caption text-warning mt-0.5">
                          Escalated to {f.escalated_to?.replace("_", " ")} on {formatDate(f.escalated_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <FindingStatus status={f.status} />
                      {f.status === "awaiting_verification" && (
                        <ActionForm action={verifyFinding.bind(null, id, f.id)} success="Closure verified.">
                          <Button size="sm" variant="secondary">
                            Verify closed
                          </Button>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            flush
            title="Responses"
            subtitle="Every checkpoint as answered on site, with the remark and exhibits captured at the moment of observation."
            actions={
              <span className="flex flex-wrap justify-end gap-1.5">
                <Badge variant="success">{tally.yes} Yes</Badge>
                <Badge variant="destructive">{tally.no} No</Badge>
                <Badge variant="secondary">{tally.na} N/A</Badge>
              </span>
            }
          >
            {sections.map((section) => {
              const adverse = section.rows.filter((r) => r.response === "no").length;
              return (
                <section key={section.title} aria-label={section.title}>
                  <div className="bg-muted/50 border-border flex items-center justify-between gap-3 border-b px-5 py-2">
                    <h3 className="text-caption text-muted-foreground font-semibold tracking-[0.06em] uppercase">
                      {section.title}
                    </h3>
                    <span className="text-caption text-muted-foreground tabular">
                      {adverse > 0
                        ? `${adverse} of ${section.rows.length} adverse`
                        : `${section.rows.length} ${section.rows.length === 1 ? "checkpoint" : "checkpoints"}`}
                    </span>
                  </div>
                  <ul className="divide-border divide-y">
                    {section.rows.map((r) => {
                      const exhibits = evidenceByRef.get(r.checkpoint_ref) ?? [];
                      const no = r.response === "no";
                      return (
                        <li key={r.checkpoint_ref} className={`px-5 py-3.5 ${no ? "bg-destructive-muted/30" : ""}`}>
                          <div className="flex items-start gap-4">
                            <span className="text-caption text-muted-foreground w-9 shrink-0 pt-0.5 font-mono tabular">
                              {r.checkpoint_ref}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-body">{r.prompt_en ?? "(checkpoint removed)"}</p>
                              {r.remark && (
                                <p
                                  className={`text-body mt-2 rounded-control border px-3 py-2 ${
                                    no
                                      ? "border-destructive-border bg-card text-foreground"
                                      : "border-border bg-muted/50 text-muted-foreground"
                                  }`}
                                >
                                  {r.remark}
                                </p>
                              )}
                              {exhibits.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {exhibits.map((e) => (
                                    <li
                                      key={e.id}
                                      className="text-caption text-muted-foreground flex items-start gap-1.5"
                                    >
                                      <Paperclip className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                      <span>
                                        <span className="font-mono">{e.sha256.slice(0, 12)}…</span> ·{" "}
                                        {formatDateTime(e.captured_at)}
                                        {e.lat !== null && e.lng !== null && (
                                          <>
                                            {" "}
                                            · {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                                          </>
                                        )}{" "}
                                        ·{" "}
                                        {e.locked
                                          ? "checksummed at capture, stored write-once"
                                          : "awaiting upload from the phone"}
                                      </span>
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
                </section>
              );
            })}
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <Panel title="Record a decision" subtitle="Added to the record. A change of mind is a new decision.">
            <ActionForm action={recordDecision.bind(null, id)} success="Decision recorded." className="space-y-4">
              <Field label="Decision">
                <select name="decisionType" required className="field">
                  {DECISION_OPTIONS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Basis" hint="optional">
                <textarea name="basis" rows={3} placeholder="What this decision rests on." className="field" />
              </Field>
              <SubmitButton pendingText="Recording…" size="default">
                Record decision
              </SubmitButton>
            </ActionForm>
          </Panel>

          <Panel
            title="Certificate"
            subtitle="Rendered on behalf of the mandated regulator, never issued by this platform."
          >
            <ul className="space-y-3">
              {conditions.map((c) => (
                <li key={c.text} className="flex items-start gap-2.5">
                  {c.met ? (
                    <CircleCheck className="text-success mt-0.5 size-[1.125rem] shrink-0" aria-hidden />
                  ) : (
                    <Circle className="text-border mt-0.5 size-[1.125rem] shrink-0" aria-hidden />
                  )}
                  <span>
                    <span className={`text-body block font-medium ${c.met ? "" : "text-muted-foreground"}`}>
                      <span className="sr-only">{c.met ? "Met: " : "Not met: "}</span>
                      {c.text}
                    </span>
                    <span className="text-caption text-muted-foreground block">{c.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* The button being enabled is a courtesy. The API checks all three
                conditions again, and the schema refuses an officer-less row. */}
            <ActionForm
              action={authoriseCertificate.bind(null, id)}
              success="Certificate authorised."
              className="mt-5"
              confirm={{
                title: "Authorise this certificate?",
                body: "It is recorded against your name and cannot be taken back; a later change is a new certificate or a revocation.",
                confirmLabel: "Authorise certificate",
              }}
            >
              <SubmitButton pendingText="Authorising…" size="default" disabled={!canAuthorise}>
                Authorise certificate
              </SubmitButton>
            </ActionForm>
          </Panel>

          <Panel title="Decisions" subtitle="Append-only, newest last.">
            {detail.decisions.length === 0 ? (
              <p className="text-body text-muted-foreground">No decision has been recorded on this inspection yet.</p>
            ) : (
              <ol className="relative space-y-5">
                <span aria-hidden className="bg-border absolute top-1.5 bottom-1.5 left-[0.3125rem] w-px" />
                {detail.decisions.map((d) => (
                  <li key={d.id} className="relative pl-6">
                    <span
                      aria-hidden
                      className="bg-primary ring-card absolute top-1.5 left-0 size-[0.6875rem] rounded-full ring-4"
                    />
                    <p className="text-body font-semibold">{label(DECISION_LABEL, d.decision_type)}</p>
                    <p className="text-caption text-muted-foreground">
                      {d.officer} · {formatDateTime(d.decided_at)}
                    </p>
                    {d.basis && <p className="text-body text-muted-foreground mt-1.5">{d.basis}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
