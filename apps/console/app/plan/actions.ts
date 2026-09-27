"use server";

import { revalidatePath } from "next/cache";
import { ApiError, post } from "../../lib/api";

// Sending inspectors: a planned week, or one suggestion taken up.

export type PlanState =
  | { status: "idle" }
  | { status: "planned"; count: number; inspector: string }
  | { status: "error"; message: string };

function refusal(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  throw err;
}

const DEFAULT_REASON: Record<string, string> = {
  routine: "Routine inspection.",
  follow_up: "Follow-up on open issues from the last visit.",
  risk_targeted: "Prioritised by risk.",
};

export async function planVisits(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const inspector = String(formData.get("inspector") ?? "");
  const [assignedToUserId, inspectorName = ""] = inspector.split("|");
  const facilityIds = formData.getAll("facilityId").map(String);
  const kind = String(formData.get("kind") ?? "routine");
  const reason = String(formData.get("reason") ?? "").trim();
  const dueBy = String(formData.get("dueBy") ?? "").trim();

  if (!assignedToUserId) return { status: "error", message: "Choose who will do the visits." };
  if (facilityIds.length === 0) return { status: "error", message: "Tick at least one facility to visit." };

  try {
    const { ids } = await post<{ ids: string[] }>("/v1/assignments/batch", {
      facilityIds,
      assignedToUserId,
      kind,
      // The inspector sees this on the visit card under "Why this visit", so
      // there is always something there, in words.
      reason: reason || DEFAULT_REASON[kind],
      dueBy: dueBy || undefined,
    });
    revalidatePath("/plan");
    revalidatePath("/");
    return { status: "planned", count: ids.length, inspector: inspectorName };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}

/** Take up one risk suggestion, with the suggestion's own reason carried to the inspector. */
export async function assignSuggestion(
  facilityId: string,
  reason: string,
  _prev: PlanState,
  formData: FormData,
): Promise<PlanState> {
  const [assignedToUserId, inspectorName = ""] = String(formData.get("inspector") ?? "").split("|");
  if (!assignedToUserId) return { status: "error", message: "Choose an inspector." };
  try {
    await post("/v1/assignments/batch", {
      facilityIds: [facilityId],
      assignedToUserId,
      kind: "risk_targeted",
      reason,
    });
    revalidatePath("/plan");
    revalidatePath("/");
    return { status: "planned", count: 1, inspector: inspectorName };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}

export async function cancelVisit(assignmentId: string) {
  await post(`/v1/assignments/${assignmentId}/cancel`, {});
  revalidatePath("/plan");
  revalidatePath("/");
}
