"use client";

import Link from "next/link";

import { DENIED } from "../lib/denied";

// An error here is usually the API refusing something on purpose — a role that
// does not permit a page, an invariant that will not bend. Say so plainly.
//
// The commonest one by far is a role refusal, and that is not a fault: an
// inspector opening the dashboard is the platform working exactly as designed.
// It used to arrive here as a raw JSON envelope under the heading "That did not
// go through", which reads as a broken console rather than as a rule. lib/api
// turns the envelope into a sentence; this decides how much alarm to show.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Not error.message: Next replaces that with "the specific message is
  // omitted in production builds" before it ever reaches the browser, so
  // reading it here worked on a laptop and nowhere else. The digest is the
  // only field that crosses.
  const denied = error.digest?.startsWith(DENIED) ?? false;
  const roles = denied ? error.digest!.slice(`${DENIED}:`.length) : "";
  const explanation = denied
    ? roles && roles !== error.digest
      ? `This page is available to: ${roles}.`
      : "This page is not available to your role."
    : error.message || "The request failed.";

  return (
    <div className="mx-auto w-full max-w-lg py-12">
      <div className="card flex flex-col items-start gap-4 p-6">
        <span
          aria-hidden
          className={`grid h-10 w-10 place-items-center rounded-full ${
            denied
              ? "bg-surface-sunk text-ink-faint ring-1 ring-inset ring-line"
              : "bg-critical-bg text-critical ring-1 ring-inset ring-critical-line"
          }`}
        >
          {denied ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3.5" y="7.75" width="11" height="7" rx="1.75" />
              <path d="M6 7.75V5.5a3 3 0 0 1 6 0v2.25" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M9 5.5V10" />
              <circle cx="9" cy="12.75" r="0.75" fill="currentColor" stroke="none" />
              <circle cx="9" cy="9" r="6.75" />
            </svg>
          )}
        </span>

        <div>
          <h1 className="text-base font-semibold text-ink">
            {denied ? "Not available to your role" : "That did not go through"}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{explanation}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* A refusal will refuse again, so "try again" is the wrong offer:
              what that reader needs is a way out, not a way to repeat it.
              It used to offer Facilities, but an auditor and an inspector are
              both refused there too, so the way out led straight back here. The
              rail is still on screen for anyone with somewhere to go; the one
              offer that is never wrong is to arrive as somebody else. */}
          {denied ? null : (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center rounded-control bg-primary px-3.5 py-2 text-sm font-medium text-white shadow-raised transition-colors hover:bg-primary-600"
            >
              Try again
            </button>
          )}
          <Link
            href="/signin"
            className={
              denied
                ? "inline-flex items-center rounded-control bg-primary px-3.5 py-2 text-sm font-medium text-white shadow-raised transition-colors hover:bg-primary-600"
                : "inline-flex items-center rounded-control bg-surface px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-line-firm transition-colors hover:bg-surface-sunk"
            }
          >
            Sign in as someone else
          </Link>
        </div>
      </div>
    </div>
  );
}
