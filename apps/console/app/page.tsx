import Link from "next/link";
import { get, type DashboardSummary, type RiskSuggestion } from "../lib/api";
import { Badge, Card, Cell, Empty, PageHeader, Reason, Row, Stat, Table } from "../components/ui";
import { formatPercent } from "../lib/format";

// The regulator dashboard: what to do today. Every number here reads from a
// projection, so a heavy query on this page can never contend with an
// inspector's sync.

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [summary, suggestions] = await Promise.all([
    get<DashboardSummary>("/v1/dashboard"),
    get<RiskSuggestion[]>("/v1/risk-suggestions?limit=8"),
  ]);

  const { tiles, decisionsWithin30Days: clock } = summary;

  return (
    <>
      <PageHeader
        title="Compliance overview"
        summary="Live from the inspection record. Figures update as inspections sync."
      />

      {/* The tiles that carry a problem take the colour of the problem. A row
          where everything is ink means there is nothing to chase today, which
          is itself worth being able to see at a glance. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Registered facilities" value={tiles.facilities} href="/facilities" />
        <Stat label="Inspections, last 30 days" value={tiles.inspections30d} href="/inspections" />
        <Stat
          label="Open findings"
          value={tiles.openFindings}
          hint={
            tiles.overdueFindings > 0
              ? `${tiles.overdueFindings} past their due date`
              : "None past their due date"
          }
          tone={tiles.overdueFindings > 0 ? "critical" : "neutral"}
          href="/findings"
        />
        <Stat
          label="Valid certificates"
          value={tiles.validCertificates}
          hint={
            tiles.certificatesDueSoon > 0
              ? `${tiles.certificatesDueSoon} expire within 30 days`
              : "None expiring within 30 days"
          }
          // Green means "settled", which an empty register is not. Zero valid
          // certificates is not a good state, it is an unstarted one.
          tone={
            tiles.certificatesDueSoon > 0
              ? "caution"
              : tiles.validCertificates > 0
                ? "good"
                : "neutral"
          }
        />
        <Stat
          label="Decisions within 30 days"
          value={clock.percent === null ? "—" : `${clock.percent}%`}
          hint={
            clock.total === 0
              ? "No inspections submitted in the last 90 days"
              : `${clock.decided} of ${clock.total} inspections in the last 90 days`
          }
          tone={clock.percent !== null && clock.percent < 80 ? "caution" : "neutral"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card
          title="Risk-targeted inspections"
          subtitle="Suggestions, with the reason that produced each one. Scheduling is yours."
        >
          {suggestions.length === 0 ? (
            <Empty>
              No facility is currently showing a risk signal. Suggestions appear here as
              inspections and findings accumulate.
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
        </Card>

        <Card
          title="Findings by section"
          subtitle="Where the value chain is actually failing, not where it is assumed to."
          flush={summary.findingsBySection.length > 0}
        >
          {summary.findingsBySection.length === 0 ? (
            <Empty>No findings recorded yet.</Empty>
          ) : (
            <Table head={["Section", "Findings", "Critical"]} align={["left", "right", "right"]}>
              {summary.findingsBySection.map((s) => (
                <Row key={s.section_ordinal}>
                  <Cell className="font-medium text-ink">{s.section_title}</Cell>
                  <Cell align="right" className="tabular-nums text-ink-muted">
                    {s.findings}
                  </Cell>
                  <Cell align="right">
                    {s.critical > 0 ? (
                      <Badge tone="critical">{s.critical}</Badge>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
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
        flush={summary.complianceTrend.length > 0}
      >
        {summary.complianceTrend.length === 0 ? (
          <Empty>
            Not enough history yet to show a trend. A month appears here once it has a
            submitted inspection.
          </Empty>
        ) : (
          <Table
            head={["Month", "Inspections", "Satisfactory", "Average rating"]}
            align={["left", "right", "right", "right"]}
          >
            {summary.complianceTrend.map((m) => (
              <Row key={m.month}>
                <Cell className="font-medium text-ink">{m.month}</Cell>
                <Cell align="right" className="tabular-nums text-ink-muted">
                  {m.inspections}
                </Cell>
                <Cell align="right" className="tabular-nums text-ink-muted">
                  {m.satisfactory} of {m.inspections}
                </Cell>
                <Cell align="right" className="font-medium tabular-nums">
                  {formatPercent(m.avg_rating)}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
