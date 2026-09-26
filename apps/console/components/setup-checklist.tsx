import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { SetupProgress } from "../lib/api";

// Getting a state started, as five things to do in order.
//
// A new deployment's dashboard used to be a grid of zeros with nothing saying
// which zero to fix first. Until the state has run its first inspection, this
// sits above everything else. Each step ticks itself from the record — a
// facility registered, a phone set up, a visit planned — so it cannot fall out
// of step with what has actually happened, and it goes away on its own.

interface Step {
  title: string;
  detail: string;
  done: boolean;
  href: string;
  action: string;
}

export function setupSteps(p: SetupProgress): Step[] {
  return [
    {
      title: "Add your facilities",
      detail:
        p.facilities > 0
          ? `${p.facilities} ${p.facilities === 1 ? "facility" : "facilities"} in the registry`
          : "Import the spreadsheet you already keep, or add them one at a time",
      done: p.facilities > 0,
      href: "/facilities/new?tab=import",
      action: "Import facilities",
    },
    {
      title: "Check your checklists",
      detail:
        p.checklistsInForce > 0
          ? `Checklists ready for ${p.checklistsInForce} of 4 facility types`
          : "Publish the questions inspectors will answer on site",
      done: p.checklistsInForce > 0,
      href: "/instruments",
      action: "Review checklists",
    },
    {
      title: "Invite your inspectors",
      detail:
        p.inspectorsWithPhone > 0
          ? `${p.inspectorsWithPhone} of ${p.inspectors} inspectors have a working phone`
          : p.invitesWaiting > 0
            ? `${p.invitesWaiting} ${p.invitesWaiting === 1 ? "invite" : "invites"} sent, waiting to be used`
            : "Send each one a code by SMS and email",
      done: p.inspectorsWithPhone > 0,
      href: "/team",
      action: "Invite inspectors",
    },
    {
      title: "Plan the first visits",
      detail:
        p.plannedVisits > 0
          ? `${p.plannedVisits} ${p.plannedVisits === 1 ? "visit" : "visits"} planned`
          : "Choose who goes where; visits appear on their phone",
      done: p.plannedVisits > 0 || p.submittedInspections > 0,
      href: "/plan",
      action: "Plan visits",
    },
    {
      title: "Review the first inspection",
      detail: "It arrives here once an inspector submits it from the field",
      done: p.submittedInspections > 0,
      href: "/inspections",
      action: "See inspections",
    },
  ];
}

export function SetupChecklist({ progress }: { progress: SetupProgress }) {
  const steps = setupSteps(progress);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section
      aria-labelledby="setup-heading"
      className="overflow-hidden rounded-card border border-primary-100 bg-card shadow-raised"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 bg-gradient-to-r from-primary-50 to-transparent px-5 pb-4 pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-700">Getting started</p>
          <h2 id="setup-heading" className="mt-1 text-lg font-semibold tracking-tight text-ink">
            Set up your state in five steps
          </h2>
        </div>
        <div className="w-full max-w-xs">
          <p className="text-right text-xs font-medium text-ink-muted">
            {done} of {steps.length} done
          </p>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-pill bg-surface-sunk ring-1 ring-inset ring-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-label="Setup progress"
          >
            <div className="h-full rounded-pill bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <ol className="divide-y divide-line">
        {steps.map((step, i) => {
          const current = i === next;
          return (
            <li
              key={step.title}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${current ? "bg-primary-50/40" : ""}`}
            >
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  step.done
                    ? "bg-success text-white"
                    : current
                      ? "bg-primary text-white shadow-raised"
                      : "bg-surface-sunk text-ink-muted ring-1 ring-inset ring-line"
                }`}
              >
                {step.done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.done ? "text-ink-muted line-through decoration-line-firm" : "text-ink"}`}>
                  <span className="sr-only">{step.done ? "Done: " : current ? "Next: " : "To do: "}</span>
                  {step.title}
                </p>
                <p className="text-xs text-ink-muted">{step.detail}</p>
              </div>
              {!step.done ? (
                <Link
                  href={step.href}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-xs font-semibold transition-colors ${
                    current
                      ? "bg-primary text-white shadow-raised hover:bg-primary-600"
                      : "border border-line bg-card text-ink hover:bg-surface-sunk"
                  }`}
                >
                  {step.action} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
