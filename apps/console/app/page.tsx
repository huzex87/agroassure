import Link from "next/link";
import { get, type DashboardSummary, type RiskSuggestion } from "../lib/api";
import { Card, Empty, Reason, Stat, Table, Row, Cell, Badge } from "../components/ui";
import { formatPercent } from "../lib/format";

// The regulator dashboard. Every number here reads from a projection, so a
// heavy query on this page can never contend with an inspector's sync.

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [summary, suggestions] = await Promise.all([
    get<DashboardSummary>("/v1/dashboard"),
    get<RiskSuggestion[]>("/v1/risk-suggestions?limit=8"),
  ]);

  const { tiles, decisionsWithin30Days: clock } = summary;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Compliance overview</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Live from the inspection record. Figures update as inspections sync.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Registered facilities" value={tiles.facilities} />
        <Stat label="Inspections, last 30 days" value={tiles.inspections30d} />
        <Stat
          label="Open findings"
          value={tiles.openFindings}
          hint={`${tiles.overdueFindings} past their due date`}
          tone={tiles.overdueFindings > 0 ? "warn" : "default"}
        />
        <Stat
          label="Valid certificates"
          value={tiles.validCertificates}
          hint={`${tiles.certificatesDueSoon} expire within 30 days`}
        />
        <Stat
          label="Decisions within 30 days"
          value={clock.percent === null ? "—" : `${clock.percent}%`}
          hint={
            clock.total === 0
              ? "No inspections submitted in the last 90 days"
              : `${clock.decided} of ${clock.total} inspections in the last 90 days`
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Risk-targeted inspections"
          subtitle="Suggestions, with the reason that produced each one. Scheduling is yours."
        >
          {suggestions.length === 0 ? (
            <Empty>No facility is currently showing a risk signal.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {suggestions.map((s) => (
                <li key={s.facilityId} className="flex items-start gap-4 py-3">
                  <span
                    aria-label={`Risk score ${s.score} of 100`}
                    className="mt-0.5 w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-primary-700"
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
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {s.reasons.slice(1).join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Findings by section"
          subtitle="Where the value chain is actually failing, not where it is assumed to."
        >
          {summary.findingsBySection.length === 0 ? (
            <Empty>No findings recorded yet.</Empty>
          ) : (
            <Table head={["Section", "Findings", "Critical"]}>
              {summary.findingsBySection.map((s) => (
                <Row key={s.section_ordinal}>
                  <Cell>{s.section_title}</Cell>
                  <Cell className="tabular-nums">{s.findings}</Cell>
                  <Cell className="tabular-nums">
                    {s.critical > 0 ? <Badge tone="warn">{s.critical}</Badge> : "—"}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card
        title="Compliance trend"
        subtitle="Average rating and inspection volume by month."
      >
        {summary.complianceTrend.length === 0 ? (
          <Empty>Not enough history yet to show a trend.</Empty>
        ) : (
          <Table head={["Month", "Inspections", "Satisfactory", "Average rating"]}>
            {summary.complianceTrend.map((m) => (
              <Row key={m.month}>
                <Cell>{m.month}</Cell>
                <Cell className="tabular-nums">{m.inspections}</Cell>
                <Cell className="tabular-nums">
                  {m.satisfactory} of {m.inspections}
                </Cell>
                <Cell className="tabular-nums">{formatPercent(m.avg_rating)}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
