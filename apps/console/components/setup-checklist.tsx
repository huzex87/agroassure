import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { SetupProgress } from "../lib/api";
import { setupSteps } from "../lib/setup-steps";
import { Button } from "./ui/button";

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
            Set up in four steps
          </h2>
        </div>
        <div className="flex w-full max-w-[16rem] items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-pill bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-pill bg-primary transition-all"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
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
                <Button asChild size="sm" variant={current ? "default" : "secondary"} className="mt-auto w-fit">
                  <Link href={step.href}>
                    {step.action} <ArrowRight aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
