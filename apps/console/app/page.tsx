import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  Plus,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  get,
  tryGet,
  type DashboardSummary,
  type Me,
  type RegistrationRow,
  type RiskSuggestion,
  type SetupProgress,
  type SystemStatus,
} from "../lib/api";
import { SetupChecklist } from "../components/setup-checklist";
import { Button, Empty, PageHeader, Panel, Reason, Stat } from "../components/ui";
import { ADMIN_ROLES, canSee, PLANNERS } from "../lib/roles";
import { FindingsBySection, ComplianceTrend } from "../components/charts";

// The regulator dashboard: what to do today. Every number here reads from a
// projection, so a heavy query on this page can never contend with an
// inspector's sync.

export const dynamic = "force-dynamic";

const DASHBOARD_ROLES = ["desk_supervisor", "authorising_officer", "state_admin", "national_admin", "auditor"];

export default async function DashboardPage() {
  // Everyone lands here after signing in, and not every role may read the
  // dashboard. Send them to the record, which every role can, rather than to
  // a refusal.
  const me = await tryGet<Me>("/v1/me");
  if (me && !me.roles.some((r) => DASHBOARD_ROLES.includes(r))) redirect("/inspections");

  const [summary, suggestions, setup, requests] = await Promise.all([
    get<DashboardSummary>("/v1/dashboard"),
    get<RiskSuggestion[]>("/v1/risk-suggestions?limit=8"),
    tryGet<SetupProgress>("/v1/setup"),
    // Administrators only; anyone else gets null and sees no notice.
    tryGet<RegistrationRow[]>("/v1/registrations"),
  ]);
  const waitingToJoin = requests?.length ?? 0;

  // Administrators are told on their first screen when the server itself needs
  // something, because a setup problem shows up everywhere else as "nothing
  // arrived" and nobody can see why.
  const system = me && canSee(me.roles, ADMIN_ROLES) ? await tryGet<SystemStatus>("/v1/system/status") : null;
  const systemFailures = system?.checks.filter((c) => c.state === "fail").length ?? 0;

  const { tiles, decisionsWithin30Days: clock } = summary;
  const inspectionTrend = summary.complianceTrend.map((m) => m.inspections);
  const ratingTrend = summary.complianceTrend.filter((m) => m.avg_rating !== null).map((m) => Number(m.avg_rating));

  // The day, in the regulator's own time zone: a greeting that says "morning"
  // at ten at night because the server runs in another country is worse than
  // no greeting.
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Lagos",
    }).format(now),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Lagos",
  }).format(now);
  const first =
    me?.fullName
      .trim()
      .split(/\s+/)
      .find((p) => !/^(dr|prof|mr|mrs|ms|engr|alh|hajiya)\.?$/i.test(p)) ?? "";

  // What needs a person today, said in one sentence. The tiles below hold the
  // numbers; this holds the order to read them in.
  const attention: string[] = [];
  if (tiles.overdueFindings > 0)
    attention.push(`${tiles.overdueFindings} ${tiles.overdueFindings === 1 ? "finding is" : "findings are"} past due`);
  if (tiles.certificatesDueSoon > 0)
    attention.push(
      `${tiles.certificatesDueSoon} ${tiles.certificatesDueSoon === 1 ? "certificate expires" : "certificates expire"} within 30 days`,
    );
  if (waitingToJoin > 0)
    attention.push(`${waitingToJoin} ${waitingToJoin === 1 ? "person is" : "people are"} waiting to join`);
  // A new deployment has nothing to report yet. Showing five zeros and three
  // empty charts says "broken"; the steps below are the whole of what to do.
  const unstarted =
    tiles.facilities === 0 &&
    tiles.inspections30d === 0 &&
    tiles.openFindings === 0 &&
    tiles.validCertificates === 0 &&
    clock.total === 0;
  const summaryLine =
    attention.length === 0
      ? unstarted
        ? "Welcome. Follow the steps below; figures appear here once inspections start to arrive."
        : "Nothing is overdue today. Figures update as inspections sync."
      : `${attention.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
  const canPlan = canSee(me?.roles ?? null, PLANNERS);

  return (
    <>
      <PageHeader
        eyebrow={`${today}${me?.jurisdictionName ? ` · ${me.jurisdictionName}` : ""}`}
        title={first ? `${greeting}, ${first}` : "Compliance overview"}
        summary={summaryLine}
        actions={
          <>
            {canPlan ? (
              // The setup steps own the one filled button until there is work to plan.
              <Button asChild variant={unstarted ? "secondary" : "default"}>
                <Link href="/plan">
                  <CalendarClock aria-hidden /> Plan visits
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href="/facilities/new">
                <Plus aria-hidden /> Add facility
              </Link>
            </Button>
          </>
        }
      />

      {systemFailures > 0 ? (
        <Link
          href="/settings/status"
          className="group flex items-center gap-3 rounded-card border border-destructive-border bg-destructive-muted px-4 py-3 transition-colors hover:border-destructive"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive text-white shadow-raised">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {systemFailures === 1 ? "1 thing is not set up yet" : `${systemFailures} things are not set up yet`}
            </span>
            <span className="block text-sm text-ink-muted">
              Some people may not get their emails or sign-in links until it is fixed.
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-destructive">
            See what
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ) : null}

      {waitingToJoin > 0 ? (
        <Link
          href="/team#requests"
          className="group flex items-center gap-3 rounded-card border border-primary-100 bg-primary-50 px-4 py-3 transition-colors hover:border-primary-200"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-white shadow-raised">
            <UserPlus className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              {waitingToJoin === 1 ? "1 person is" : `${waitingToJoin} people are`} waiting to join
            </span>
            <span className="block text-sm text-ink-muted">
              Their email and phone are confirmed. Choose a role and approve them.
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700">
            Review
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ) : null}

      {setup ? <SetupChecklist progress={setup} /> : null}

      {unstarted ? (
        <Panel title="This page fills in as work comes in" subtitle="Nothing to show yet, and nothing wrong.">
          <ul className="grid gap-4 text-sm leading-relaxed text-ink-muted sm:grid-cols-3">
            <li>
              <span className="block font-medium text-ink">Today&rsquo;s priorities</span>
              Overdue findings, expiring certificates and people waiting to join, in one line at the top.
            </li>
            <li>
              <span className="block font-medium text-ink">Risk-targeted inspections</span>
              Facilities worth visiting next, each with the reason it was suggested.
            </li>
            <li>
              <span className="block font-medium text-ink">Trends</span>
              Findings by section and average rating by month, once inspections are decided.
            </li>
          </ul>
        </Panel>
      ) : (
        <>
          {/* The tiles that carry a problem take the colour of the problem. A row
          where everything is ink means there is nothing to chase today, which
          is itself worth being able to see at a glance. */}
          <div className="grid grid-cols-2 gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-3 xl:grid-cols-5">
            <Stat label="Registered facilities" value={tiles.facilities} href="/facilities" icon={Building2} />
            <Stat
              label="Inspections, last 30 days"
              value={tiles.inspections30d}
              href="/inspections"
              icon={ClipboardCheck}
              trend={inspectionTrend}
            />
            <Stat
              icon={AlertTriangle}
              label="Open findings"
              value={tiles.openFindings}
              hint={
                tiles.overdueFindings > 0 ? `${tiles.overdueFindings} past their due date` : "None past their due date"
              }
              tone={tiles.overdueFindings > 0 ? "destructive" : "neutral"}
              href="/findings"
            />
            <Stat
              icon={FileCheck2}
              label="Valid certificates"
              value={tiles.validCertificates}
              hint={
                tiles.certificatesDueSoon > 0
                  ? `${tiles.certificatesDueSoon} expire within 30 days`
                  : "None expiring within 30 days"
              }
              // Green means "settled", which an empty register is not. Zero valid
              // certificates is not a good state, it is an unstarted one.
              tone={tiles.certificatesDueSoon > 0 ? "warning" : tiles.validCertificates > 0 ? "success" : "neutral"}
            />
            <Stat
              icon={ShieldCheck}
              trend={ratingTrend}
              label="Decisions within 30 days"
              value={clock.percent === null ? "—" : `${clock.percent}%`}
              hint={
                clock.total === 0
                  ? "No inspections submitted in the last 90 days"
                  : `${clock.decided} of ${clock.total} inspections in the last 90 days`
              }
              tone={clock.percent !== null && clock.percent < 80 ? "warning" : "neutral"}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            <Panel
              className="xl:col-span-3"
              title="Risk-targeted inspections"
              subtitle="Suggestions, with the reason that produced each one. Scheduling is yours."
            >
              {suggestions.length === 0 ? (
                <Empty>
                  No facility is currently showing a risk signal. Suggestions appear here as inspections and findings
                  accumulate.
                </Empty>
              ) : (
                <ul className="-my-3 divide-y divide-line">
                  {suggestions.map((s) => (
                    <li key={s.facilityId} className="flex items-start gap-3.5 py-3.5">
                      {/* The score is a ranking device, not a verdict, so it is set
                      quietly beside the reason rather than shouted. */}
                      <span
                        aria-label={`Risk score ${s.score} of 100`}
                        className="mt-0.5 grid h-7 w-8 shrink-0 place-items-center rounded-control bg-primary-50 text-xs font-semibold tabular-nums text-primary-700 ring-1 ring-inset ring-primary-100"
                      >
                        {s.score}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/facilities/${s.facilityId}`}
                          className="block truncate text-sm font-medium text-ink hover:text-primary-700"
                        >
                          {s.facilityName}
                        </Link>
                        {/* The reason is the point; the score is secondary. */}
                        <Reason>{s.leadingReason}</Reason>
                        {s.reasons.length > 1 && (
                          <p className="mt-1 text-xs text-ink-faint">{s.reasons.slice(1).join(" · ")}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              className="xl:col-span-2"
              title="Findings by section"
              subtitle="Where the value chain is actually failing, not where it is assumed to."
            >
              <FindingsBySection rows={summary.findingsBySection} />
            </Panel>
          </div>

          <Panel title="Compliance trend" subtitle="Average rating by month, on a full 0–100 scale.">
            <ComplianceTrend
              points={summary.complianceTrend.map((m) => ({
                month: m.month,
                value: m.avg_rating === null ? null : Number(m.avg_rating),
                inspections: m.inspections,
              }))}
            />
          </Panel>
        </>
      )}
    </>
  );
}
