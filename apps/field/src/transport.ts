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
    let message: unknown;
    try {
      message = JSON.parse(detail)?.message;
    } catch {
      message = undefined;
    }
    throw new Error(
      typeof message === "string" && message
        ? message
        : `${response.status} ${response.statusText}`.trim(),
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

export interface SignInUser {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
}

/**
 * Who this deployment will sign you in as.
 *
 * A stand-in for the institution's provider, and only available when the
 * gateway was started with development sign-in enabled. Where it is not, this
 * throws and the screen falls back to asking for a token.
 */
export async function fetchSignInUsers(): Promise<SignInUser[]> {
  return callAnonymous<SignInUser[]>("/v1/auth/dev-users");
}

export async function signInAs(email: string): Promise<{ token: string; userId: string }> {
  const body = await callAnonymous<{ token: string; userId: string }>("/v1/auth/dev-signin", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  await setToken(body.token);
  return body;
}

export interface DeviceState {
  deviceId: string | null;
  status: "none" | "pending" | "active" | "revoked" | string;
}

/**
 * Ask to be enrolled, submitting the public half of the key this device
 * generated. Grants nothing on its own: the gateway refuses events from any
 * device that is not active, so this only puts the handset in front of an
 * administrator.
 */
export async function requestEnrolment(
  publicKeyBase64: string,
  label?: string,
): Promise<DeviceState> {
  return call<DeviceState>("/v1/devices/enrolment-request", {
    method: "POST",
    body: JSON.stringify({ publicKeyBase64, label }),
  });
}

export async function fetchDeviceState(publicKeyBase64: string): Promise<DeviceState> {
  return call<DeviceState>("/v1/devices/status", {
    method: "POST",
    body: JSON.stringify({ publicKeyBase64 }),
  });
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
