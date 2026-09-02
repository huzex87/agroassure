"use client";

// An error here is usually the API refusing something on purpose — a role that
// does not permit an action, an invariant that will not bend. Say so plainly
// rather than showing a blank screen.

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="card p-5">
        <h1 className="text-base font-semibold text-ink">That did not go through</h1>
        <p className="mt-2 text-sm text-ink-muted">{error.message || "The request failed."}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-[12px] bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
