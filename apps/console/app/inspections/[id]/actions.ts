"use server";

import { revalidatePath } from "next/cache";
import { post } from "../../../lib/api";
import { attempt, type ActionResult } from "../../../lib/action-result";

// Commands the console sends. Each one is a request to the API, which checks
// the role, the jurisdiction, and the invariant before anything is recorded.
// Nothing here decides whether an action is allowed; it only asks, and says
// what the API answered.

export async function recordDecision(inspectionId: string, formData: FormData): Promise<ActionResult> {
  const decisionType = String(formData.get("decisionType") ?? "");
  const basis = String(formData.get("basis") ?? "").trim();

  const result = await attempt(() =>
    post(`/v1/inspections/${inspectionId}/decisions`, {
      decisionType,
      basis: basis || undefined,
    }),
  );
  if (result.ok) revalidatePath(`/inspections/${inspectionId}`);
  return result;
}

/**
 * Authorising a certificate is a separate act from recording the decision that
 * permits it. The API refuses unless the caller is the officer who made that
 * decision, every finding is verified closed, and the rating supports issuance.
 */
export async function authoriseCertificate(inspectionId: string): Promise<ActionResult> {
  const result = await attempt(() => post(`/v1/inspections/${inspectionId}/certificate`));
  if (result.ok) revalidatePath(`/inspections/${inspectionId}`);
  return result;
}

export async function verifyFinding(inspectionId: string, findingId: string): Promise<ActionResult> {
  const result = await attempt(() => post(`/v1/findings/${findingId}/verify`));
  if (result.ok) {
    revalidatePath(`/inspections/${inspectionId}`);
    revalidatePath("/findings");
  }
  return result;
}

export async function rejectFindingClosure(
  inspectionId: string,
  findingId: string,
  formData: FormData,
): Promise<ActionResult> {
  const result = await attempt(() =>
    post(`/v1/findings/${findingId}/reject`, {
      reason: String(formData.get("reason") ?? ""),
    }),
  );
  if (result.ok) {
    revalidatePath(`/inspections/${inspectionId}`);
    revalidatePath("/findings");
  }
  return result;
}
