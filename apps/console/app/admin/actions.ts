"use server";

import { revalidatePath } from "next/cache";
import { post } from "../../lib/api";

export async function enrollDevice(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  await post("/v1/devices", {
    assignedUserId: String(formData.get("assignedUserId") ?? ""),
    label: label || undefined,
    publicKeyBase64: String(formData.get("publicKeyBase64") ?? "").trim(),
  });
  revalidatePath("/admin");
}

export async function revokeDevice(deviceId: string, formData: FormData) {
  await post(`/v1/devices/${deviceId}/revoke`, {
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/admin");
}

export async function createUser(formData: FormData) {
  await post("/v1/users", {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? "").trim() || undefined,
    roles: formData.getAll("roles").map(String),
  });
  revalidatePath("/admin");
}
