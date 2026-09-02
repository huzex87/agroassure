"use server";

import { revalidatePath } from "next/cache";
import { post } from "../../../lib/api";

// Commands the console sends. Each one is a request to the API, which checks
// the role, the jurisdiction, and the invariant before anything is recorded.
// Nothing here decides whether an action is allowed; it only asks.

export async function recordDecision(inspectionId: string, formData: FormData) {
  const decisionType = String(formData.get("decisionType") ?? "");
  const basis = String(formData.get("basis") ?? "").trim();

  await post(`/v1/inspections/${inspectionId}/decisions`, {
    decisionType,
    basis: basis || undefined,
  });
  revalidatePath(`/inspections/${inspectionId}`);
}

/**
 * Authorising a certificate is a separate act from recording the decision that
 * permits it. The API refuses unless the caller is the officer who made that
 * decision, every finding is verified closed, and the rating supports issuance.
 */
export async function authoriseCertificate(inspectionId: string) {
  await post(`/v1/inspections/${inspectionId}/certificate`);
  revalidatePath(`/inspections/${inspectionId}`);
}

export async function verifyFinding(inspectionId: string, findingId: string) {
  await post(`/v1/findings/${findingId}/verify`);
  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath("/findings");
}

export async function rejectFindingClosure(
  inspectionId: string,
  findingId: string,
  formData: FormData,
) {
  await post(`/v1/findings/${findingId}/reject`, {
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath("/findings");
}
