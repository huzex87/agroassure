import { get } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { eventLabel, periodDays, periodRange, PERIODS, type ProcessingLog } from "../../lib/activity";
import { Cell, ChipNav, DataTable, Empty, PageHeader, Panel, Row, Stat } from "../../components/ui";

// What has been done on the platform, and by whom. It is counted straight from
// the event store, the same record the inspections are built from, so it cannot
// be tidied before an audit: there is no separate log to edit.

export const dynamic = "force-dynamic";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = periodDays((await searchParams).days);
  const { from, to } = periodRange(days);
  const log = await get<ProcessingLog>(`/v1/audit/processing-log?from=${from}&to=${to}`);

  const total = log.byActivity.reduce((sum, a) => sum + a.events, 0);

  return (
    <>
      <PageHeader
        title="Activity"
        summary={`What was recorded between ${from} and ${to}, counted from the event record itself.`}
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Activity" }]}
      />

      <ChipNav
        label="Period"
        items={PERIODS.map((d) => ({
          label: `Last ${d} days`,
          href: d === 30 ? "/activity" : `/activity?days=${d}`,
          active: d === days,
        }))}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Things recorded" value={total.toLocaleString("en-GB")} />
        <Stat label="People active" value={log.byActor.length} />
        <Stat label="Kinds of activity" value={log.byActivity.length} />
      </div>

      <Panel flush title="By activity">
        <DataTable
          head={["Activity", "Times", "People", "Phones", "Last"]}
          align={["left", "right", "right", "right", "left"]}
          empty={log.byActivity.length === 0 ? <Empty>Nothing was recorded in this period.</Empty> : undefined}
        >
          {log.byActivity.map((a) => (
            <Row key={a.event_type}>
              <Cell className="font-medium text-ink">{eventLabel(a.event_type)}</Cell>
              <Cell align="right">{a.events.toLocaleString("en-GB")}</Cell>
              <Cell align="right">{a.actors}</Cell>
              <Cell align="right">{a.devices}</Cell>
              <Cell className="text-ink-muted">{formatDateTime(a.last_at)}</Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>

      <Panel flush title="By person">
        <DataTable
          head={["Person", "Things recorded", "First", "Last"]}
          align={["left", "right", "left", "left"]}
          empty={log.byActor.length === 0 ? <Empty>No one was active in this period.</Empty> : undefined}
        >
          {log.byActor.map((a) => (
            <Row key={a.full_name}>
              <Cell className="font-medium text-ink">{a.full_name}</Cell>
              <Cell align="right">{a.events.toLocaleString("en-GB")}</Cell>
              <Cell className="text-ink-muted">{formatDateTime(a.first_at)}</Cell>
              <Cell className="text-ink-muted">{formatDateTime(a.last_at)}</Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>

      <p className="text-sm text-ink-muted">{log.residency}</p>
    </>
  );
}
