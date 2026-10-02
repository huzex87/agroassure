import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { SetupProgress } from "../lib/api";

// Getting a state started, as four things to do in order.
//
// A new deployment's dashboard used to be a grid of zeros with nothing saying
// which zero to fix first. Until the state has planned its first visits, this
// sits above everything else. Each step ticks itself from the record — a
// facility registered, a phone set up, a visit planned — so it cannot fall out
// of step with what has actually happened, and it goes away on its own.
//
// Reviewing the first inspection is not here: it is not setup, it is the work,
// and it happens by itself once an inspector submits one.

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
      action: "Open checklists",
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
      className="overflow-hidden rounded-card border border-line bg-card shadow-raised"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
        <div>
          <p className="text-primary-700 text-xs font-semibold tracking-[0.08em] uppercase">Getting started</p>
          <h2 id="setup-heading" className="mt-0.5 text-base font-semibold tracking-tight text-ink">
            Set up your state in four steps
          </h2>
        </div>
        <div className="flex w-full max-w-[16rem] items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunk ring-1 ring-inset ring-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-label="Setup progress"
          >
            <div className="h-full rounded-pill bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <p className="text-xs font-medium whitespace-nowrap text-ink-muted tabular">
            {done} of {steps.length}
          </p>
        </div>
      </div>

      {/* Four steps side by side on a wide screen, stacked on a phone. The step
          to do next is the only one with a filled button, so the eye lands on it. */}
      <ol className="grid border-t border-line md:grid-cols-4">
        {steps.map((step, i) => {
          const current = i === next;
          return (
            <li
              key={step.title}
              className={`flex flex-col gap-3 border-line p-4 not-first:border-t md:not-first:border-t-0 md:not-first:border-l ${
                current ? "bg-primary-50/50" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold ${
                    step.done
                      ? "bg-success text-white"
                      : current
                        ? "bg-primary text-white shadow-raised"
                        : "bg-surface-sunk text-ink-muted ring-1 ring-inset ring-line"
                  }`}
                >
                  {step.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <p className={`text-sm font-semibold ${step.done ? "text-ink-muted" : "text-ink"}`}>
                  <span className="sr-only">{step.done ? "Done: " : current ? "Next: " : "To do: "}</span>
                  {step.title}
                </p>
              </div>
              <p className="min-h-[2.5rem] text-xs leading-relaxed text-ink-muted">{step.detail}</p>
              {!step.done ? (
                <Link
                  href={step.href}
                  className={`mt-auto inline-flex h-8 w-fit items-center gap-1.5 rounded-control px-3 text-xs font-semibold transition-colors ${
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
