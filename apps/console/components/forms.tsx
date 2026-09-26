"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, RotateCw } from "lucide-react";

// The pieces every console form is built from, so a label, a hint, a refusal
// and a busy button look and read the same on every page.

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-ink">{label}</span>
      {hint ? <span className="ml-1.5 text-xs text-ink-faint">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control border border-destructive-border bg-destructive-muted px-3 py-2 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-control border border-success-border bg-success-muted px-3 py-2 text-sm text-success"
    >
      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A submit button that says what it is doing while the form is in flight. */
export function SubmitButton({
  children,
  pendingText,
  className = "w-full",
  disabled = false,
}: {
  children: ReactNode;
  pendingText: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white shadow-raised transition-colors hover:bg-primary-600 disabled:opacity-60 ${className}`}
    >
      {pending ? <RotateCw className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingText : children}
    </button>
  );
}
