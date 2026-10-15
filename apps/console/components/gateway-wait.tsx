"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Panel } from "./ui";

// Two phases for an unreachable gateway.
//
// For the first ~75 seconds we assume a cold start (free-tier hosts can take
// most of a minute). After that we stop claiming it is "starting up" and say
// the service is unavailable — still refreshing, so recovery is automatic
// once the host comes back, but the person is not left thinking a minute more
// will fix a suspended or misconfigured deployment.

const COLD_START_MS = 75_000;
const REFRESH_MS = 5_000;

export function GatewayWait() {
  const router = useRouter();
  const [phase, setPhase] = useState<"starting" | "unavailable">("starting");

  useEffect(() => {
    const escalate = setTimeout(() => setPhase("unavailable"), COLD_START_MS);
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      clearTimeout(escalate);
      clearInterval(refresh);
    };
  }, [router]);

  if (phase === "starting") {
    return (
      <div className="w-full">
        <Panel className="shadow-lifted">
          <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
            <span className="grid size-12 place-items-center rounded-full bg-primary-50 text-primary ring-1 ring-inset ring-primary-100">
              <Loader2 className="size-6 animate-spin" aria-hidden />
            </span>
            <h1 className="text-lg font-semibold text-ink">Getting things ready</h1>
            <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
              The service was resting and is starting up. This can take up to a minute. This page will continue by
              itself.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Panel className="shadow-lifted">
        <div className="flex flex-col items-center gap-3 py-2 text-center" role="alert">
          <span className="grid size-12 place-items-center rounded-full bg-critical-bg text-critical ring-1 ring-inset ring-critical-line">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </span>
          <h1 className="text-lg font-semibold text-ink">Service unavailable</h1>
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
            The compliance service is not responding. It may be offline or still starting. This page will keep trying
            and will continue automatically when it returns.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-1 text-sm font-semibold text-primary-700 underline underline-offset-2"
          >
            Try again now
          </button>
        </div>
      </Panel>
    </div>
  );
}
