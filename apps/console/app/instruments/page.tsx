import Link from "next/link";
import { get, type InstrumentRow } from "../../lib/api";
import { Badge, Card, Cell, Empty, Row, Table } from "../../components/ui";
import { FACILITY_TYPE_LABEL, formatDate, label } from "../../lib/format";

// The template version manager. A published version is frozen and an inspection
// stays bound to the one it was worked against, so publishing a new version
// changes what happens next and nothing that already happened.

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  in_force: "primary",
  draft: "warn",
  superseded: "quiet",
} as const;

const STATUS_LABEL = {
  in_force: "In force",
  draft: "Draft",
  superseded: "Superseded",
} as const;

export default async function InstrumentsPage() {
  const instruments = await get<InstrumentRow[]>("/v1/instruments");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Instruments</h1>
        <p className="mt-1 text-sm text-ink-muted">
          One instrument per regulated operator class, each versioned. The four classes are the
          Act&rsquo;s own taxonomy, not this platform&rsquo;s.
        </p>
      </header>

      {instruments.length === 0 && (
        <Card>
          <Empty>No instrument has been authored for this jurisdiction yet.</Empty>
        </Card>
      )}

      {instruments.map((instrument) => {
        const versions = (instrument.versions ?? []).filter((v) => v.id);
        return (
          <Card
            key={instrument.id}
            title={instrument.name}
            subtitle={label(FACILITY_TYPE_LABEL, instrument.facility_type)}
          >
            <Table
              head={["Version", "Status", "In force from", "Bands", "Inspections bound", ""]}
              empty={
                versions.length === 0 ? (
                  <Empty>No version has been created for this instrument.</Empty>
                ) : undefined
              }
            >
              {versions.map((v) => (
                <Row key={v.id}>
                  <Cell className="font-medium">{v.version_label}</Cell>
                  <Cell>
                    <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                  </Cell>
                  <Cell className="text-ink-muted">{formatDate(v.effective_from)}</Cell>
                  <Cell className="text-ink-muted tabular-nums">
                    Satisfactory ≥ {Math.round(Number(v.satisfactory_min))}% · Needs Improvement ≥{" "}
                    {Math.round(Number(v.needs_improve_min))}%
                  </Cell>
                  <Cell className="tabular-nums">
                    {v.inspections_bound}
                    {/* Display only. This count is never a reason to alter a
                        version; history is not re-pointed. */}
                  </Cell>
                  <Cell>
                    <Link
                      href={`/instruments/${v.id}`}
                      className="text-sm text-primary-700 hover:underline"
                    >
                      {v.status === "draft" ? "Review changes" : "View structure"}
                    </Link>
                  </Cell>
                </Row>
              ))}
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
