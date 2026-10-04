import Link from "next/link";
import { get } from "../../../lib/api";
import { Badge, Empty, PageHeader, Panel } from "../../../components/ui";
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
    <>
      <PageHeader
        breadcrumbs={[{ label: "Checklists", href: "/instruments" }, { label: version.versionLabel }]}
        title={version.versionLabel}
        badges={
          <Badge variant={version.status === "in_force" ? "success" : version.status === "draft" ? "warning" : "secondary"} dot>
            {version.status === "in_force" ? "In force" : version.status === "draft" ? "Draft" : "Superseded"}
          </Badge>
        }
        summary={`${version.sections.length} sections, ${checkpointCount} checkpoints · Satisfactory from ${version.satisfactoryMin}% · Needs Improvement from ${version.needsImprovementMin}%`}
      />

      {version.status === "draft" && (
        <Panel
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
                  <Badge variant={c.kind === "removed" ? "warning" : "secondary"}>
                    {label(CHANGE_LABEL, c.kind)}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm text-ink-muted">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {version.sections.map((section) => (
        <Panel
          key={section.ordinal}
          title={`${section.ordinal}. ${section.titleEn}`}
          subtitle={section.titleHa}
        >
          <ul className="divide-y divide-line">
            {section.checkpoints.map((c) => (
              <li key={c.ordinal} className="flex items-start gap-4 py-3">
                <span className="text-caption text-muted-foreground w-9 shrink-0 pt-0.5 font-mono tabular">
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
        </Panel>
      ))}
    </>
  );
}
