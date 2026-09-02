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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("This device is not signed in.");

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
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
