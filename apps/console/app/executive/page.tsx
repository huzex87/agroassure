import { get } from "../../lib/api";
import { Card, Cell, Empty, Row, Table } from "../../components/ui";
import { Meter, PairedBars, Sparkline } from "../../components/charts";
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

function Figure({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export default async function ExecutivePage() {
  const data = await get<Executive>("/v1/executive");
  const { coverage, promises, closure } = data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Programme overview</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Whether the programme is working, and whether the regulator is keeping its own
          commitments. Every figure derives from the inspection record.
        </p>
      </header>

      {/* Coverage first, deliberately. It is the figure most easily flattered by
          a busy operational dashboard, and the one a director is answerable for. */}
      <Card
        title="Coverage"
        subtitle="What proportion of the register has actually been visited in the last twelve months"
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <Figure
            value={coverage.percent === null ? "—" : `${coverage.percent}%`}
            label="Register inspected, 12 months"
            hint={`${coverage.inspected12m} of ${coverage.total} facilities`}
          />
          <Figure
            value={String(coverage.neverInspected)}
            label="Never inspected"
            hint="No submitted inspection on record"
          />
          <Figure
            value={String(coverage.lapsedOverAYear)}
            label="Not seen in over a year"
            hint="Inspected once, then not since"
          />
        </div>
        <div className="mt-5">
          <Meter
            percent={coverage.percent}
            caption="A regulator that inspects the same few sites repeatedly has a busy dashboard and an unwatched market."
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Compliance trend" subtitle="Average rating by month, on a full 0–100 scale">
          <Sparkline
            label="Average compliance rating by month"
            points={data.ratingTrend.map((r) => ({ month: r.month, value: r.avg_rating }))}
          />
        </Card>

        <Card
          title="Findings raised and closed"
          subtitle="Enforcement is the closing, not the raising"
        >
          <PairedBars
            rows={data.findingsFlow.map((f) => ({ month: f.month, a: f.raised, b: f.closed }))}
            aLabel="Raised"
            bLabel="Closed"
          />
          <p className="mt-3 text-sm text-ink-muted">
            {closure.medianDays === null
              ? "No finding has been closed yet, so there is no time-to-close to report."
              : `Median time to close: ${closure.medianDays} days across ${closure.closedCount} closed findings.`}
          </p>
        </Card>
      </div>

      {/* The regulator measured the way it measures everyone else. */}
      <Card
        title="What we owe"
        subtitle="The commitments the institution has made, held to the same standard it applies"
      >
        <div className="grid gap-6 sm:grid-cols-4">
          <Figure
            value={
              promises.decisionsWithin30Days.percent === null
                ? "—"
                : `${promises.decisionsWithin30Days.percent}%`
            }
            label="Decisions within 30 days"
            hint={
              promises.decisionsWithin30Days.total === 0
                ? "No inspections submitted in the last 90 days"
                : `${promises.decisionsWithin30Days.decided} of ${promises.decisionsWithin30Days.total}`
            }
          />
          <Figure
            value={String(promises.overdueFindings)}
            label="Findings past their due date"
            hint="Owed by the facilities, chased by us"
          />
          <Figure
            value={String(promises.certificatesDueSoon)}
            label="Certificates expiring in 30 days"
            hint="Re-inspection needed before they lapse"
          />
          <Figure
            value={String(promises.devicesAwaitingApproval)}
            label="Devices awaiting approval"
            hint="An inspector cannot sync until one is approved"
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By local government area" subtitle="Where to post the next inspector">
          <Table
            head={["LGA", "Facilities", "Inspected", "Avg rating", "Open findings"]}
            empty={data.byLga.length === 0 ? <Empty>No facility is registered yet.</Empty> : undefined}
          >
            {data.byLga.map((r) => (
              <Row key={r.lga}>
                <Cell className="font-medium">{r.lga}</Cell>
                <Cell className="tabular-nums text-ink-muted">{r.facilities}</Cell>
                <Cell className="tabular-nums text-ink-muted">{r.inspected}</Cell>
                <Cell className="tabular-nums text-ink-muted">
                  {r.avg_rating === null ? "—" : `${r.avg_rating}%`}
                </Cell>
                <Cell className="tabular-nums">{r.open_findings}</Cell>
              </Row>
            ))}
          </Table>
        </Card>

        <Card
          title="Repeat failures"
          subtitle="The same site failing the same checkpoint more than once"
        >
          <Table
            head={["Facility", "Checkpoint", "Times", "Last raised"]}
            empty={
              data.repeatFailures.length === 0 ? (
                <Empty>No facility has failed the same checkpoint twice.</Empty>
              ) : undefined
            }
          >
            {data.repeatFailures.map((r) => (
              <Row key={`${r.facility}-${r.checkpoint_ref}`}>
                <Cell>
                  <span className="font-medium">{r.facility}</span>
                  {r.lga && <p className="text-xs text-ink-muted">{r.lga}</p>}
                </Cell>
                <Cell className="text-ink-muted">{r.checkpoint_ref}</Cell>
                <Cell className="tabular-nums">{r.times}</Cell>
                <Cell className="text-ink-muted">{formatDate(r.last_raised)}</Cell>
              </Row>
            ))}
          </Table>
          <p className="mt-4 text-xs text-ink-muted">
            A repeat means the last enforcement did not work, or the finding was closed without
            anything changing on site. Both are worth asking about.
          </p>
        </Card>
      </div>
    </div>
  );
}
