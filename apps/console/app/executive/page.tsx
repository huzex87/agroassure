import { AlertTriangle, CalendarClock, FileWarning } from "lucide-react";
import { get } from "../../lib/api";
import { Cell, DataTable, Empty, PageHeader, Panel, Progress, Row, Stat } from "../../components/ui";
import { ComplianceTrend, CoverageDial, FindingsFlow } from "../../components/charts";
import { formatDate } from "../../lib/format";

// The executive view.
//
// A different question from the operational dashboard, and so a different page.
// That one answers "what do I do today". This one answers "is the programme
// working, and are we keeping the promises we made" — which means the figures
// on it are deliberately the uncomfortable ones. Coverage before volume,
// because a regulator that inspects the same twenty sites all year has a busy
// dashboard and an unregulated market. Closed against raised, because raising
// findings is not enforcement. Repeat failures, because a site failing the same
// checkpoint twice means the last enforcement did not work.

export const dynamic = "force-dynamic";

interface Executive {
  coverage: {
    total: number;
    inspected12m: number;
    neverInspected: number;
    lapsedOverAYear: number;
    percent: number | null;
  };
  ratingTrend: Array<{ month: string; avg_rating: number | null; inspections: number }>;
  findingsFlow: Array<{ month: string; raised: number; closed: number }>;
  closure: { medianDays: number | null; closedCount: number };
  byLga: Array<{
    lga: string;
    facilities: number;
    inspected: number;
    avg_rating: number | null;
    open_findings: number;
  }>;
  repeatFailures: Array<{
    facility: string;
    lga: string | null;
    checkpoint_ref: string;
    times: number;
    last_raised: string;
  }>;
  promises: {
    overdueFindings: number;
    certificatesDueSoon: number;
    devicesAwaitingApproval: number;
    decisionsWithin30Days: { decided: number; total: number; percent: number | null };
  };
}

export default async function ExecutivePage() {
  const data = await get<Executive>("/v1/executive");
  const { coverage, promises, closure } = data;

  // Coverage is the figure a director is answerable for, so it gets a tone
  // rather than sitting neutral: below half the register in a year is not a
  // number to read calmly.
  const coverageTone =
    coverage.percent === null
      ? "primary"
      : coverage.percent >= 75
        ? "success"
        : coverage.percent >= 50
          ? "warning"
          : "destructive";

  return (
    <>
      <PageHeader
        title="Programme overview"
        summary="Whether the programme is working, and whether the regulator is keeping its own commitments. Every figure derives from the inspection record."
      />

      {/* Coverage first, deliberately. It is the figure most easily flattered by
          a busy operational dashboard, and the one a director is answerable for. */}
      <Panel
        title="Coverage"
        subtitle="What proportion of the register has actually been visited in the last twelve months"
      >
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <CoverageDial
            percent={coverage.percent}
            inspected={coverage.inspected12m}
            total={coverage.total}
          />

          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-[0.8125rem] font-medium">Never inspected</p>
                <p className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">
                  {coverage.neverInspected}
                </p>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  No submitted inspection on record
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[0.8125rem] font-medium">
                  Not seen in over a year
                </p>
                <p className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">
                  {coverage.lapsedOverAYear}
                </p>
                <p className="text-muted-foreground mt-1.5 text-xs">
                  Inspected once, then not since
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Progress value={coverage.percent} tone={coverageTone} />
              <p className="text-muted-foreground text-xs leading-relaxed">
                A regulator that inspects the same few sites repeatedly has a busy dashboard and an
                unwatched market.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Compliance trend" subtitle="Average rating by month, on a full 0–100 scale">
          <ComplianceTrend
            points={data.ratingTrend.map((r) => ({
              month: r.month,
              value: r.avg_rating,
              inspections: r.inspections,
            }))}
          />
        </Panel>

        <Panel
          title="Findings raised and closed"
          subtitle="Enforcement is the closing, not the raising"
          footer={
            closure.medianDays === null
              ? "No finding has been closed yet, so there is no time-to-close to report."
              : `Median time to close: ${closure.medianDays} days across ${closure.closedCount} closed findings.`
          }
        >
          <FindingsFlow rows={data.findingsFlow} />
        </Panel>
      </div>

      {/* The regulator measured the way it measures everyone else. */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-foreground">What we owe</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The commitments the institution has made, held to the same standard it applies.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Decisions within 30 days"
            value={
              promises.decisionsWithin30Days.percent === null
                ? "—"
                : `${promises.decisionsWithin30Days.percent}%`
            }
            hint={
              promises.decisionsWithin30Days.total === 0
                ? "No inspections submitted in the last 90 days"
                : `${promises.decisionsWithin30Days.decided} of ${promises.decisionsWithin30Days.total}`
            }
            tone={
              promises.decisionsWithin30Days.percent !== null &&
              promises.decisionsWithin30Days.percent < 80
                ? "warning"
                : "neutral"
            }
            icon={CalendarClock}
          />
          <Stat
            label="Findings past their due date"
            value={promises.overdueFindings}
            hint="Owed by the facilities, chased by us"
            tone={promises.overdueFindings > 0 ? "destructive" : "success"}
            href="/findings?overdueOnly=true"
          />
          <Stat
            label="Certificates expiring in 30 days"
            value={promises.certificatesDueSoon}
            hint="Re-inspection needed before they lapse"
            tone={promises.certificatesDueSoon > 0 ? "warning" : "neutral"}
            icon={FileWarning}
          />
          <Stat
            label="Devices awaiting approval"
            value={promises.devicesAwaitingApproval}
            hint="An inspector cannot sync until one is approved"
            tone={promises.devicesAwaitingApproval > 0 ? "warning" : "neutral"}
            href="/admin"
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="By local government area"
          subtitle="Where to post the next inspector"
          flush={data.byLga.length > 0}
        >
          <DataTable
            head={["LGA", "Facilities", "Inspected", "Avg rating", "Open findings"]}
            align={["left", "right", "right", "right", "right"]}
            empty={data.byLga.length === 0 ? <Empty>No facility is registered yet.</Empty> : undefined}
          >
            {data.byLga.map((r) => (
              <Row key={r.lga}>
                <Cell className="font-medium text-foreground">{r.lga}</Cell>
                <Cell align="right" className="tabular-nums text-muted-foreground">
                  {r.facilities}
                </Cell>
                <Cell align="right" className="tabular-nums text-muted-foreground">
                  {r.inspected}
                </Cell>
                <Cell align="right" className="tabular-nums text-muted-foreground">
                  {r.avg_rating === null ? "—" : `${r.avg_rating}%`}
                </Cell>
                <Cell align="right" className="font-medium tabular-nums">
                  {r.open_findings > 0 ? (
                    <span className="text-destructive">{r.open_findings}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </Cell>
              </Row>
            ))}
          </DataTable>
        </Panel>

        <Panel
          title="Repeat failures"
          subtitle="The same site failing the same checkpoint more than once"
          flush={data.repeatFailures.length > 0}
          footer="A repeat means the last enforcement did not work, or the finding was closed without anything changing on site. Both are worth asking about."
        >
          <DataTable
            head={["Facility", "Checkpoint", "Times", "Last raised"]}
            align={["left", "left", "right", "right"]}
            empty={
              data.repeatFailures.length === 0 ? (
                <Empty>No facility has failed the same checkpoint twice.</Empty>
              ) : undefined
            }
          >
            {data.repeatFailures.map((r) => (
              <Row key={`${r.facility}-${r.checkpoint_ref}`}>
                <Cell>
                  <span className="font-medium text-foreground">{r.facility}</span>
                  {r.lga && <p className="text-xs text-muted-foreground">{r.lga}</p>}
                </Cell>
                <Cell className="font-mono text-[0.8125rem] text-muted-foreground">{r.checkpoint_ref}</Cell>
                <Cell align="right" className="font-semibold tabular-nums text-destructive">
                  {r.times}
                </Cell>
                <Cell align="right" className="tabular-nums text-muted-foreground">
                  {formatDate(r.last_raised)}
                </Cell>
              </Row>
            ))}
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
