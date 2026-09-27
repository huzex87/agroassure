"use server";

import { revalidatePath } from "next/cache";
import { ApiError, post, type IssuedInvitation } from "../../lib/api";

/**
 * What an invite form shows after it is submitted. The code is here and
 * nowhere else: the gateway keeps only a keyed hash of it, so this is the one
 * moment an administrator can read it out to someone standing in front of them.
 */
export type InviteState =
  | { status: "idle" }
  | { status: "issued"; invitation: IssuedInvitation }
  | { status: "error"; message: string };

export type FormState = { status: "idle" } | { status: "done" } | { status: "error"; message: string };

/**
 * A refusal the person filling the form can act on, as a message; anything
 * else — a redirect to sign in, an outage — is left to travel as it would.
 */
function refusal(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  throw err;
}

export async function inviteInspector(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!fullName) return { status: "error", message: "Enter the inspector's full name." };
  if (!email && !phone) {
    return { status: "error", message: "Add a phone number or an email address, so the code can reach them." };
  }
  try {
    const invitation = await post<IssuedInvitation>("/v1/invitations", {
      fullName,
      email: email || undefined,
      phone: phone || undefined,
    });
    revalidatePath("/team");
    return { status: "issued", invitation };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}

export async function resendCode(userId: string, _prev: InviteState): Promise<InviteState> {
  try {
    const invitation = await post<IssuedInvitation>(`/v1/invitations/resend/${userId}`, {});
    revalidatePath("/team");
    return { status: "issued", invitation };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}

export async function cancelInvitation(invitationId: string) {
  await post(`/v1/invitations/${invitationId}/cancel`, {});
  revalidatePath("/team");
}

export async function approveDevice(deviceId: string) {
  await post(`/v1/devices/${deviceId}/approve`, {});
  revalidatePath("/team");
}

export async function revokeDevice(deviceId: string, formData: FormData) {
  await post(`/v1/devices/${deviceId}/revoke`, {
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/team");
}

/** Someone who works in the console rather than in the field. */
export async function addColleague(_prev: FormState, formData: FormData): Promise<FormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!fullName || !email) return { status: "error", message: "Enter their full name and work email." };
  try {
    await post("/v1/users", { fullName, email, roles: [role] });
    revalidatePath("/team");
    return { status: "done" };
  } catch (err) {
    return { status: "error", message: refusal(err) };
  }
}
