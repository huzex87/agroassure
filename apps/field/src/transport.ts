import * as SecureStore from "expo-secure-store";
import { bytesToBase64, type BootstrapBundle, type DeviceEvent } from "@agroassure/domain";
import type { PushAck, PulledEvent, SyncTransport } from "@agroassure/field-core";

// The wire. Nothing here decides anything: the gateway verifies every signature
// and every chain link, and refuses a batch it cannot verify. A refusal is
// surfaced to the inspector rather than retried into a loop.

const TOKEN = "agroassure.session.token";
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3001";

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN);
}

/**
 * A refusal from the gateway: its sentence, which is written for people, and
 * where it gave one a reason code, which is written for this app to act on.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null,
    /** Which codes were wrong, when the refusal was about codes. */
    readonly wrong: string[] = [],
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  headers: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...headers, ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    // The gateway sends a sentence in `message`; anything else reaching an
    // inspector's error card would be a wall of JSON.
    const detail = await response.text();
    let parsed: { message?: unknown; reason?: unknown; wrong?: unknown } | undefined;
    try {
      parsed = JSON.parse(detail);
    } catch {
      parsed = undefined;
    }
    const message = parsed?.message;
    throw new ApiError(
      typeof message === "string" && message
        ? message
        : `${response.status} ${response.statusText}`.trim(),
      response.status,
      typeof parsed?.reason === "string" ? parsed.reason : null,
      Array.isArray(parsed?.wrong) ? parsed.wrong.filter((w): w is string => typeof w === "string") : [],
    );
  }
  return (await response.json()) as T;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("This device is not signed in.");
  return request<T>(path, { authorization: `Bearer ${token}` }, init);
}

/** A request that carries no session yet, because it is how you get one. */
async function callAnonymous<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, {}, init);
}

export interface Activation {
  token: string;
  userId: string;
  fullName: string;
  deviceId: string;
}

/**
 * Spend an invite code. The phone offers the public half of its key; the
 * gateway registers it as this person's active phone and returns the session
 * the phone uses from then on. Nothing else is needed — no approval step, no
 * second person — because the administrator already decided when they sent
 * the code.
 */
export async function activate(
  code: string,
  publicKeyBase64: string,
  label?: string,
): Promise<Activation> {
  const body = await callAnonymous<Activation>("/v1/auth/activate", {
    method: "POST",
    body: JSON.stringify({ code, publicKeyBase64, label }),
  });
  await setToken(body.token);
  return body;
}

export async function fetchBootstrap(): Promise<BootstrapBundle> {
  return call<BootstrapBundle>("/v1/sync/bootstrap", { method: "POST" });
}

export function httpTransport(): SyncTransport {
  return {
    async pushEvents(deviceId: string, events: DeviceEvent[]): Promise<PushAck> {
      const body = await call<{
        acked: string[];
        rejected: string[];
        server_cursor: string;
      }>("/v1/sync/events", {
        method: "POST",
        body: JSON.stringify({ deviceId, events }),
      });
      return {
        acked: body.acked,
        rejected: body.rejected,
        serverCursor: body.server_cursor,
      };
    },

    async uploadEvidence({ evidenceId, sha256, mime, bytes }) {
      const body = await call<{ locked: boolean }>("/v1/sync/evidence", {
        method: "POST",
        body: JSON.stringify({
          evidenceId,
          sha256,
          mime,
          contentBase64: bytesToBase64(bytes),
        }),
      });
      return { locked: body.locked };
    },

    async pull(since: string) {
      const body = await call<{ events: PulledEvent[]; next_cursor: string }>(
        `/v1/sync/pull?since=${encodeURIComponent(since)}`,
      );
      return { events: body.events, nextCursor: body.next_cursor };
    },
  };
}

/** Signed out: the session token goes with the person it belonged to. */
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN);
}

// -- asking to join --------------------------------------------------------
//
// For someone without an invite code. None of these carry a session: the
// person has no account yet. After the first call they carry the ticket the
// gateway handed back instead — an id and a secret only this phone holds.

export interface RegisterOptions {
  available: boolean;
  jurisdictions: Array<{ id: string; name: string }>;
}

export interface RegistrationTicket {
  registrationId: string;
  token: string;
}

export interface RegistrationStatus {
  status: "verifying" | "pending" | "approved" | "rejected" | "withdrawn";
  fullName: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  rejectReason: string | null;
  role: string | null;
  /** Present once approved as an inspector: the session an invite code would have given. */
  session?: { token: string; userId: string; deviceId: string; fullName: string };
}

export function registerOptions(): Promise<RegisterOptions> {
  return callAnonymous<RegisterOptions>("/v1/register/options");
}

export function startRegistration(input: {
  fullName: string;
  phone: string;
  email: string;
  jurisdictionId: string;
  publicKeyBase64: string;
}): Promise<RegistrationTicket> {
  return callAnonymous<RegistrationTicket>("/v1/register", {
    method: "POST",
    body: JSON.stringify({ ...input, source: "app" }),
  });
}

export function verifyRegistration(
  ticket: RegistrationTicket,
  codes: { smsCode?: string; emailCode?: string },
): Promise<RegistrationStatus> {
  return callAnonymous<RegistrationStatus>("/v1/register/verify", {
    method: "POST",
    body: JSON.stringify({ ...ticket, ...codes }),
  });
}

export function resendRegistrationCodes(ticket: RegistrationTicket): Promise<RegistrationStatus> {
  return callAnonymous<RegistrationStatus>("/v1/register/resend", {
    method: "POST",
    body: JSON.stringify(ticket),
  });
}

export function registrationStatus(ticket: RegistrationTicket): Promise<RegistrationStatus> {
  return callAnonymous<RegistrationStatus>("/v1/register/status", {
    method: "POST",
    body: JSON.stringify(ticket),
  });
}
