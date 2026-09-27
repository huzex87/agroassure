"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import type { InspectorOption } from "../../lib/api";
import { assignSuggestion, type PlanState } from "../../app/plan/actions";

// Taking up one of the engine's suggestions: choose who, press Send. The
// suggestion's own reason goes with the visit, so the inspector reads the same
// sentence the supervisor acted on.

export function SuggestionAssign({
  facilityId,
  reason,
  inspectors,
}: {
  facilityId: string;
  reason: string;
  inspectors: InspectorOption[];
}) {
  const [state, action, pending] = useActionState<PlanState, FormData>(
    assignSuggestion.bind(null, facilityId, reason),
    { status: "idle" },
  );

  if (state.status === "planned") {
    return (
      <p className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <Check className="size-3.5" aria-hidden /> Planned{state.inspector ? ` for ${state.inspector}` : ""}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select
        name="inspector"
        aria-label="Inspector to send"
        className="field h-8 min-h-0 py-0 text-xs"
        defaultValue={inspectors[0] ? `${inspectors[0].id}|${inspectors[0].full_name}` : ""}
      >
        {inspectors.map((i) => (
          <option key={i.id} value={`${i.id}|${i.full_name}`}>
            {i.full_name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || inspectors.length === 0}
        className="inline-flex h-8 items-center rounded-control bg-primary px-3 text-xs font-semibold text-white shadow-raised hover:bg-primary-600 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>
      {state.status === "error" ? <span className="w-full text-xs text-destructive">{state.message}</span> : null}
    </form>
  );
}
