import Link from "next/link";
import { get, type AssignmentRow, type FacilityRow, type InspectorOption, type RiskSuggestion } from "../../lib/api";
import { Badge, Cell, DataTable, Empty, PageHeader, Panel, Reason, Row } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { ActionForm } from "../../components/action-form";
import { PlanForm } from "../../components/plan/plan-form";
import { SuggestionAssign } from "../../components/plan/suggestion-assign";
import { cancelVisit } from "./actions";

// Planning visits. A supervisor chooses who goes where; the risk engine sits
// beside the form proposing the facilities that most need a visit, each with
// its reason in words. It proposes. A person decides.

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  routine: "Routine",
  follow_up: "Follow-up",
  risk_targeted: "Priority",
};

function dueTone(due: string | null): { text: string; tone: "destructive" | "warning" | "secondary" } | null {
  if (!due) return null;
  const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `${-days} ${days === -1 ? "day" : "days"} late`, tone: "destructive" };
  if (days <= 7)
    return { text: days === 0 ? "Due today" : `Due in ${days} ${days === 1 ? "day" : "days"}`, tone: "warning" };
  return { text: `Due ${formatDate(due)}`, tone: "secondary" };
}

export default async function PlanPage() {
  const [inspectors, facilities, planned, suggestions] = await Promise.all([
    get<InspectorOption[]>("/v1/inspectors"),
    get<FacilityRow[]>("/v1/facilities"),
    get<AssignmentRow[]>("/v1/assignments?status=planned"),
    get<RiskSuggestion[]>("/v1/risk-suggestions?limit=12").catch(() => [] as RiskSuggestion[]),
  ]);

  const plannedIds = planned.map((a) => a.facility_id);
  const plannedSet = new Set(plannedIds);
  const openSuggestions = suggestions.filter((s) => !plannedSet.has(s.facilityId)).slice(0, 6);
  const late = planned.filter((a) => a.due_by && new Date(a.due_by) < new Date()).length;

  return (
    <>
      <PageHeader
        title="Visits"
        summary={
          <>
            {planned.length} {planned.length === 1 ? "visit" : "visits"} planned
            {late > 0 ? ` · ${late} past due` : ""} · {inspectors.length}{" "}
            {inspectors.length === 1 ? "inspector" : "inspectors"}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel
          title="Schedule visits"
          subtitle="Choose an inspector and the facilities they should visit. The visits appear on their phone."
          className="xl:col-span-3"
        >
          <PlanForm inspectors={inspectors} facilities={facilities} plannedFacilityIds={plannedIds} />
        </Panel>

        <Panel
          title="Suggested by risk"
          subtitle="Facilities that most need a visit, and why."
          className="xl:col-span-2"
          flush={openSuggestions.length > 0}
        >
          {openSuggestions.length === 0 ? (
            <Empty>
              Nothing stands out right now. Suggestions appear as inspections build a history — overdue issues, lapsing
              certificates, poor recent ratings.
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {openSuggestions.map((s) => (
                <li key={s.facilityId} className="space-y-2 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/facilities/${s.facilityId}`} className="font-medium text-ink hover:underline">
                        {s.facilityName}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {s.licenceNumber}
                        {s.lga ? ` · ${s.lga}` : ""}
                      </p>
                    </div>
                    <Badge variant={s.score >= 60 ? "destructive" : s.score >= 30 ? "warning" : "secondary"}>
                      Risk {Math.round(s.score)}
                    </Badge>
                  </div>
                  <Reason>{s.leadingReason}</Reason>
                  <SuggestionAssign facilityId={s.facilityId} reason={s.leadingReason} inspectors={inspectors} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Upcoming visits" subtitle="Planned and not yet started." flush>
        <DataTable
          head={["Facility", "Inspector", "Kind", "Due", "Why", ""]}
          empty={
            planned.length === 0 ? (
              <Empty>No visits planned yet. Use the form above to send an inspector.</Empty>
            ) : undefined
          }
        >
          {planned.map((a) => {
            const due = dueTone(a.due_by);
            return (
              <Row key={a.id}>
                <Cell>
                  <Link href={`/facilities/${a.facility_id}`} className="font-medium text-ink hover:underline">
                    {a.facility_name}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {a.licence_number}
                    {a.lga ? ` · ${a.lga}` : ""}
                  </p>
                </Cell>
                <Cell className="text-ink-muted">{a.assigned_to}</Cell>
                <Cell>
                  <Badge variant="secondary">{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                </Cell>
                <Cell>
                  {due ? <Badge variant={due.tone}>{due.text}</Badge> : <span className="text-ink-faint">—</span>}
                </Cell>
                <Cell className="max-w-xs text-sm text-ink-muted">{a.reason ?? "—"}</Cell>
                <Cell>
                  <ActionForm
                    action={cancelVisit.bind(null, a.id)}
                    success="Visit cancelled."
                    className="flex justify-end"
                    confirm={{
                      title: `Cancel the visit to ${a.facility_name}?`,
                      body: "It disappears from the inspector's phone. The facility stays on your list to plan again.",
                      confirmLabel: "Cancel visit",
                      destructive: true,
                    }}
                  >
                    <button
                      type="submit"
                      className="h-8 rounded-control px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunk hover:text-destructive"
                    >
                      Cancel
                    </button>
                  </ActionForm>
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
