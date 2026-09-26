"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Search, Smartphone } from "lucide-react";
import type { FacilityRow, InspectorOption } from "../../lib/api";
import { planVisits, type PlanState } from "../../app/plan/actions";
import { ErrorNote, Field, SubmitButton, SuccessNote } from "../forms";

// Planning a week: who goes, where, and why.
//
// The facility list is the whole registry, searchable, with what a supervisor
// weighs when choosing — when it was last inspected, whether its certificate
// is lapsing — beside each name. Facilities that already have a visit planned
// are shown but cannot be ticked, so nothing is planned twice.

const KINDS: Array<[string, string]> = [
  ["routine", "Routine"],
  ["follow_up", "Follow-up"],
  ["risk_targeted", "Priority"],
];

const CERT: Record<string, { label: string; tone: string }> = {
  valid: { label: "Certificate valid", tone: "text-success" },
  due_soon: { label: "Certificate due soon", tone: "text-warning" },
  overdue: { label: "Overdue", tone: "text-destructive" },
  never_inspected: { label: "Never inspected", tone: "text-ink-muted" },
};

function lastSeen(iso: string | null): string {
  if (!iso) return "never inspected";
  return `last inspected ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function PlanForm({
  inspectors,
  facilities,
  plannedFacilityIds,
}: {
  inspectors: InspectorOption[];
  facilities: FacilityRow[];
  plannedFacilityIds: string[];
}) {
  const [state, action] = useActionState<PlanState, FormData>(planVisits, { status: "idle" });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const form = useRef<HTMLFormElement>(null);
  const planned = useMemo(() => new Set(plannedFacilityIds), [plannedFacilityIds]);

  useEffect(() => {
    if (state.status === "planned") {
      setPicked(new Set());
      setQuery("");
      form.current?.reset();
    }
  }, [state]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? facilities.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.licence_number.toLowerCase().includes(q) ||
            (f.lga ?? "").toLowerCase().includes(q),
        )
      : facilities;
    // What most needs a visit first: never inspected, then overdue, then due soon.
    const rank: Record<string, number> = { never_inspected: 0, overdue: 1, due_soon: 2, valid: 3 };
    return [...list].sort(
      (a, b) =>
        Number(planned.has(a.id)) - Number(planned.has(b.id)) ||
        (rank[a.certificate_status] ?? 9) - (rank[b.certificate_status] ?? 9) ||
        a.name.localeCompare(b.name),
    );
  }, [facilities, query, planned]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (inspectors.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        There are no inspectors yet. <a href="/team" className="font-semibold text-primary-700 underline underline-offset-2">Invite one on the Team page</a>, then come back to plan their visits.
      </p>
    );
  }

  return (
    <form ref={form} action={action} className="space-y-5">
      {state.status === "planned" ? (
        <SuccessNote>
          {state.count} {state.count === 1 ? "visit" : "visits"} planned
          {state.inspector ? ` for ${state.inspector}` : ""}. They&rsquo;ll appear on their phone next time it connects.
        </SuccessNote>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium text-ink">Who will go</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {inspectors.map((i, n) => (
            <label
              key={i.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-line px-3 py-2.5 transition-colors hover:bg-surface-sunk has-[:checked]:border-primary-200 has-[:checked]:bg-primary-50"
            >
              <span className="flex items-center gap-2.5">
                <input type="radio" name="inspector" value={`${i.id}|${i.full_name}`} defaultChecked={n === 0} className="accent-[var(--primary)]" />
                <span>
                  <span className="block text-sm font-medium text-ink">{i.full_name}</span>
                  <span className="block text-xs text-ink-muted">
                    {i.open_visits} {i.open_visits === 1 ? "visit" : "visits"} on their list
                  </span>
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs ${i.has_phone ? "text-success" : "text-warning"}`}
                title={i.has_phone ? "Phone is set up" : "Phone not set up yet — visits will wait until it is"}
              >
                <Smartphone className="size-3.5" aria-hidden />
                {i.has_phone ? "Ready" : "No phone yet"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-sm font-medium text-ink">
            Where
            <span className="ml-1.5 text-xs font-normal text-ink-faint">
              {picked.size > 0 ? `${picked.size} selected` : "tick one or more"}
            </span>
          </p>
          <label className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, licence or LGA"
              aria-label="Search facilities"
              className="field w-full pl-8"
            />
          </label>
        </div>

        <div className="mt-2 max-h-80 overflow-y-auto rounded-control border border-line">
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              {facilities.length === 0 ? (
                <>No facilities in the registry yet. <a href="/facilities/new?tab=import" className="font-semibold text-primary-700 underline underline-offset-2">Add them first</a>.</>
              ) : (
                "No facility matches that search."
              )}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((f) => {
                const busy = planned.has(f.id);
                const cert = CERT[f.certificate_status] ?? CERT.never_inspected!;
                return (
                  <li key={f.id}>
                    <label
                      className={`flex items-start gap-3 px-3 py-2.5 ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface-sunk"} ${picked.has(f.id) ? "bg-primary-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        name="facilityId"
                        value={f.id}
                        checked={picked.has(f.id)}
                        disabled={busy}
                        onChange={() => toggle(f.id)}
                        className="mt-1 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{f.name}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {f.licence_number}
                          {f.lga ? ` · ${f.lga}` : ""} · {lastSeen(f.last_inspected)}
                        </span>
                      </span>
                      <span className={`shrink-0 text-xs font-medium ${busy ? "text-ink-muted" : cert.tone}`}>
                        {busy ? "Already planned" : cert.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <fieldset>
          <legend className="text-sm font-medium text-ink">Kind of visit</legend>
          <div className="mt-1.5 inline-flex gap-1 rounded-control border border-line bg-surface-sunk p-1">
            {KINDS.map(([value, label], i) => (
              <label
                key={value}
                className="cursor-pointer rounded-[8px] px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors has-[:checked]:bg-card has-[:checked]:text-primary-700 has-[:checked]:shadow-raised"
              >
                <input type="radio" name="kind" value={value} defaultChecked={i === 0} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Due by" hint="optional">
          <input type="date" name="dueBy" className="field w-full sm:w-48" />
        </Field>
      </div>

      <Field label="Why" hint="shown to the inspector — optional">
        <input
          name="reason"
          autoComplete="off"
          placeholder="e.g. Licence renewal due next month"
          className="field w-full"
        />
      </Field>

      {state.status === "error" ? <ErrorNote message={state.message} /> : null}

      <SubmitButton pendingText="Planning…" className="sm:w-64" disabled={picked.size === 0}>
        <CalendarPlus className="size-4" aria-hidden />
        {picked.size > 1 ? `Plan ${picked.size} visits` : "Plan visit"}
      </SubmitButton>
    </form>
  );
}
