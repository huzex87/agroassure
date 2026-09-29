"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RegisterOptions, RegistrationStatus } from "../../lib/api";

// Asking to join, from the console's side. Nobody here has an account yet, so
// these calls carry no session: the gateway's registration surface is open,
// rate limited, and after the first step needs the status token it handed
// back — which lives only in an httpOnly cookie on this browser.

const API_BASE = process.env.AGROASSURE_API_URL ?? "http://localhost:3001";
const TICKET = "agroassure_registration";

export type RegisterState =
  | { status: "idle" }
  | { status: "error"; message: string; wrong?: string[] }
  | { status: "sent" };

interface Ticket {
  registrationId: string;
  token: string;
}

async function call<T>(path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string; reason?: string; wrong?: string[] }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "The server could not be reached. Try again in a moment." };
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* an empty or non-JSON body; the status says enough */
  }
  if (response.ok) return { ok: true, data: parsed as T };
  const b = (parsed ?? {}) as { message?: unknown; reason?: unknown; wrong?: unknown };
  return {
    ok: false,
    message: typeof b.message === "string" ? b.message : "That didn't go through. Try again in a moment.",
    reason: typeof b.reason === "string" ? b.reason : undefined,
    wrong: Array.isArray(b.wrong) ? (b.wrong as string[]) : undefined,
  };
}

export async function registerOptions(): Promise<RegisterOptions | null> {
  const r = await call<RegisterOptions>("/v1/register/options");
  return r.ok ? r.data : null;
}

export async function currentTicket(): Promise<Ticket | null> {
  const raw = (await cookies()).get(TICKET)?.value;
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  return { registrationId: raw.slice(0, dot), token: raw.slice(dot + 1) };
}

/** The request this browser started, or null if there is none it can still see. */
export async function currentRegistration(): Promise<RegistrationStatus | null> {
  const ticket = await currentTicket();
  if (!ticket) return null;
  const r = await call<RegistrationStatus>("/v1/register/status", ticket);
  return r.ok ? r.data : null;
}

export async function startRegistration(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const jurisdictionId = String(formData.get("jurisdictionId") ?? "");
  if (!fullName || !email || !phone) return { status: "error", message: "Fill in your name, work email and phone number." };
  if (!jurisdictionId) return { status: "error", message: "Choose the state you work in." };

  const r = await call<Ticket>("/v1/register", { fullName, email, phone, jurisdictionId, source: "console" });
  if (!r.ok) return { status: "error", message: r.message };

  (await cookies()).set(TICKET, `${r.data.registrationId}.${r.data.token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/register",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/register");
}

export async function verifyCodes(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const ticket = await currentTicket();
  if (!ticket) redirect("/register");
  const emailCode = String(formData.get("emailCode") ?? "").replace(/\D/g, "");
  const smsCode = String(formData.get("smsCode") ?? "").replace(/\D/g, "");
  if (!emailCode && !smsCode) return { status: "error", message: "Enter the codes we sent you." };

  const r = await call<RegistrationStatus>("/v1/register/verify", {
    ...ticket,
    emailCode: emailCode || undefined,
    smsCode: smsCode || undefined,
  });
  if (!r.ok) {
    // A right code beside a wrong one still counted: refresh the page so the
    // one that was right shows as confirmed and only the other is asked again.
    revalidatePath("/register");
    return { status: "error", message: r.message, wrong: r.wrong };
  }
  redirect("/register");
}

export async function resendCodes(_prev: RegisterState): Promise<RegisterState> {
  const ticket = await currentTicket();
  if (!ticket) redirect("/register");
  const r = await call<RegistrationStatus>("/v1/register/resend", ticket);
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "sent" };
}

export async function startOver(): Promise<void> {
  (await cookies()).delete({ name: TICKET, path: "/register" });
  redirect("/register");
}
