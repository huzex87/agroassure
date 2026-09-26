import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { applyBootstrap, drain } from "@agroassure/field-core";
import { getStore } from "./db";
import { identity } from "./signer";
import { readFileBytes } from "./capture";
import { ApiError, fetchBootstrap, httpTransport } from "./transport";

// Sending work without being asked.
//
// Sync used to be a button, and an inspector who forgot to press it went home
// with the day's inspections still on the handset — while a line on the same
// screen told them it would happen automatically. It now does: when the app
// comes to the foreground, straight after an inspection is submitted, and on a
// short timer while anything is still waiting. The button survives as "Send
// now" for the inspector who wants to watch it happen.
//
// One attempt at a time. Every trigger above can fire together — submitting an
// inspection brings the visits screen back into focus — and two drains racing
// over the same outbox would send the same batch twice. The server would
// deduplicate it, but a second request on a weak signal is time the inspector
// is standing in a car park waiting for.

export type SyncPhase = "idle" | "sending" | "sent" | "offline" | "notReady" | "signedOut";

export interface SyncStatus {
  phase: SyncPhase;
  /** Events written on this phone and not yet acknowledged by the server. */
  queued: number;
  /** When the server last acknowledged everything, if it ever has this session. */
  lastSentAt: Date | null;
  /** The server's own words when it refused, for the one line under the status. */
  detail: string | null;
}

const RETRY_MS = 60_000;

let status: SyncStatus = { phase: "idle", queued: 0, lastSentAt: null, detail: null };
let inFlight: Promise<SyncStatus> | null = null;
const listeners = new Set<(s: SyncStatus) => void>();

function publish(next: Partial<SyncStatus>): SyncStatus {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
  return status;
}

function queuedNow(): number {
  try {
    return getStore().pendingCount();
  } catch {
    return status.queued;
  }
}

/** Re-read the outbox count after local work, without sending anything. */
export function refreshQueued(): void {
  publish({ queued: queuedNow() });
}

/**
 * Send whatever is waiting and collect the day's visits.
 *
 * Never throws. A phone with no signal is the normal case in the field, not an
 * error: the work stays on the handset and the next trigger tries again.
 */
export function syncNow(): Promise<SyncStatus> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const id = await identity();
    if (!id.deviceId) return publish({ phase: "notReady", detail: null });

    publish({ phase: "sending", detail: null, queued: queuedNow() });
    try {
      const store = getStore();
      // Push first. Work already done outranks work not yet collected: if the
      // signal drops halfway, the inspection is safe on the server and the
      // bundle can wait for the next attempt.
      const result = await drain(store, id.deviceId, {
        transport: httpTransport(),
        readFile: readFileBytes,
      });
      if (result.blocked) {
        return publish({ phase: "offline", detail: result.blocked, queued: queuedNow() });
      }
      applyBootstrap(store, await fetchBootstrap());
      return publish({ phase: "sent", lastSentAt: new Date(), detail: null, queued: queuedNow() });
    } catch (err) {
      // Signed out remotely. Not a connection problem, and retrying will not
      // fix it: the phone needs a new invite code, so say that instead.
      if (err instanceof ApiError && err.status === 401) {
        return publish({ phase: "signedOut", detail: err.message, queued: queuedNow() });
      }
      return publish({
        phase: "offline",
        detail: err instanceof Error ? err.message : String(err),
        queued: queuedNow(),
      });
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Fire and forget, for the moments a screen has just written something. */
export function requestSync(): void {
  void syncNow();
}

/**
 * The live status, for the screen that shows it. Mounting this is also what
 * starts the automatic triggers, so there is exactly one place they run from.
 */
export function useAutoSync(): SyncStatus {
  const [current, setCurrent] = useState(status);

  useEffect(() => {
    listeners.add(setCurrent);
    requestSync();

    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") requestSync();
    });
    // Only while something is waiting: an empty outbox has nothing to retry,
    // and a phone polling a server all day for no reason is a flat battery by
    // the afternoon inspection.
    const timer = setInterval(() => {
      if (status.queued > 0 && status.phase !== "notReady" && status.phase !== "signedOut") {
        requestSync();
      }
    }, RETRY_MS);

    return () => {
      listeners.delete(setCurrent);
      foreground.remove();
      clearInterval(timer);
    };
  }, []);

  return current;
}
