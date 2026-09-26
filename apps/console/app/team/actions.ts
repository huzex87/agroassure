"use server";

import { revalidatePath } from "next/cache";
import { post } from "../../lib/api";

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

export async function createUser(formData: FormData) {
  await post("/v1/users", {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? "").trim() || undefined,
    roles: formData.getAll("roles").map(String),
  });
  revalidatePath("/team");
}
