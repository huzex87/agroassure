import Link from "next/link";
import { get } from "../../../lib/api";
import { Badge, Card, Empty } from "../../../components/ui";
import { SEVERITY_LABEL, label } from "../../../lib/format";

export const dynamic = "force-dynamic";

interface VersionStructure {
  id: string;
  status: "draft" | "in_force" | "superseded";
  versionLabel: string;
  satisfactoryMin: number;
  needsImprovementMin: number;
  sections: Array<{
    ordinal: number;
    titleEn: string;
    titleHa: string;
    checkpoints: Array<{
      ordinal: number;
      promptEn: string;
      promptHa: string;
      weight: number;
      severityOnFail: string;
      allowsNa: boolean;
    }>;
  }>;
}

interface Changes {
  from: string | null;
  changes: Array<{ kind: string; ref: string; detail: string }>;
}

const CHANGE_LABEL: Record<string, string> = {
  added: "Added",
  removed: "Removed",
  reworded: "Reworded",
  reweighted: "Reweighted",
  severity_changed: "Severity changed",
  bands_changed: "Rating bands changed",
};

export default async function InstrumentVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [version, changes] = await Promise.all([
    get<VersionStructure>(`/v1/instrument-versions/${id}`),
    get<Changes>(`/v1/instrument-versions/${id}/changes`),
  ]);

  const checkpointCount = version.sections.reduce((n, s) => n + s.checkpoints.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/instruments" className="text-sm text-ink-muted hover:text-primary-700">
          ← Instruments
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{version.versionLabel}</h1>
          <Badge tone={version.status === "in_force" ? "primary" : "quiet"}>
            {version.status === "in_force"
              ? "In force"
              : version.status === "draft"
                ? "Draft"
                : "Superseded"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {version.sections.length} sections, {checkpointCount} checkpoints · Satisfactory ≥{" "}
          {version.satisfactoryMin}% · Needs Improvement ≥ {version.needsImprovementMin}%
        </p>
      </header>

      {version.status === "draft" && (
        <Card
          title={changes.from ? `Changes from ${changes.from}` : "Changes"}
          subtitle="What moves if this version is published. Nothing already submitted is affected."
        >
          {changes.changes.length === 0 ? (
            <Empty>
              {changes.from
                ? "This draft is structurally identical to the version in force."
                : "There is no version in force to compare against."}
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {changes.changes.map((c, i) => (
                <li key={`${c.ref}-${i}`} className="flex items-start gap-3 py-2.5">
                  <span className="w-12 shrink-0 font-mono text-xs text-ink-muted">{c.ref}</span>
                  <Badge tone={c.kind === "removed" ? "warn" : "quiet"}>
                    {label(CHANGE_LABEL, c.kind)}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm text-ink-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {version.sections.map((section) => (
        <Card
          key={section.ordinal}
          title={`${section.ordinal}. ${section.titleEn}`}
          subtitle={section.titleHa}
        >
          <ul className="divide-y divide-line">
            {section.checkpoints.map((c) => (
              <li key={c.ordinal} className="flex items-start gap-3 py-2.5">
                <span className="w-12 shrink-0 font-mono text-xs text-ink-muted">
                  {section.ordinal}.{c.ordinal}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{c.promptEn}</p>
                  {/* Both languages live in the same row, so they cannot drift
                      apart the way separate string files do. */}
                  <p className="text-sm text-ink-muted">{c.promptHa}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-ink-muted">
                  <span>weight {c.weight}</span>
                  <span>{label(SEVERITY_LABEL, c.severityOnFail)} on fail</span>
                  {c.allowsNa && <span>N/A allowed</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
