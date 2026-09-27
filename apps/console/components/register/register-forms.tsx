"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Mail, MessageSquare, RotateCw } from "lucide-react";
import { ErrorNote, Field, SubmitButton, SuccessNote } from "../forms";
import {
  resendCodes,
  startRegistration,
  verifyCodes,
  type RegisterState,
} from "../../app/register/actions";

const IDLE: RegisterState = { status: "idle" };

/** Step one: who you are and where you work. */
export function DetailsForm({ jurisdictions }: { jurisdictions: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(startRegistration, IDLE);
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name">
        <input name="fullName" required autoComplete="name" autoFocus placeholder="e.g. Ngozi Okafor" className="field w-full" />
      </Field>
      <Field label="Work email" hint="we'll send a code here">
        <input name="email" type="email" required autoComplete="email" placeholder="you@agency.gov.ng" className="field w-full" />
      </Field>
      <Field label="Phone number" hint="and one here, by SMS">
        <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="0803 123 4567" className="field w-full" />
      </Field>
      <Field label="State you work in">
        <select name="jurisdictionId" required defaultValue={jurisdictions.length === 1 ? jurisdictions[0]!.id : ""} className="field w-full">
          <option value="" disabled>
            Choose a state
          </option>
          {jurisdictions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </Field>
      {state.status === "error" ? <ErrorNote message={state.message} /> : null}
      <SubmitButton pendingText="Sending codes…">Continue</SubmitButton>
    </form>
  );
}

function CodeInput({ name, label, icon, wrong }: { name: string; label: string; icon: React.ReactNode; wrong: boolean }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
        {icon}
        {label}
      </span>
      <input
        name={name}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        placeholder="••••••"
        aria-invalid={wrong || undefined}
        className={`field mt-1.5 w-full text-center font-mono text-xl tracking-[0.5em] ${
          wrong ? "border-destructive-border ring-2 ring-destructive-muted" : ""
        }`}
      />
    </label>
  );
}

function Verified({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 rounded-control border border-success-border bg-success-muted px-3 py-2.5 text-sm font-medium text-success">
      <CircleCheck className="size-4" aria-hidden />
      {label}
    </p>
  );
}

/** Step two: a code from each contact, typed back. */
export function CodesForm({ emailVerified, phoneVerified }: { emailVerified: boolean; phoneVerified: boolean }) {
  const [state, action] = useActionState(verifyCodes, IDLE);
  const [resent, resend, resending] = useActionState(resendCodes, IDLE);
  const wrong = state.status === "error" ? (state.wrong ?? []) : [];
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {emailVerified ? (
          <Verified label="Email confirmed" />
        ) : (
          <CodeInput name="emailCode" label="Code from your email" icon={<Mail className="size-4 text-ink-faint" aria-hidden />} wrong={wrong.includes("email")} />
        )}
        {phoneVerified ? (
          <Verified label="Phone confirmed" />
        ) : (
          <CodeInput name="smsCode" label="Code from your SMS" icon={<MessageSquare className="size-4 text-ink-faint" aria-hidden />} wrong={wrong.includes("sms")} />
        )}
        {state.status === "error" ? <ErrorNote message={state.message} /> : null}
        <SubmitButton pendingText="Checking…">Confirm</SubmitButton>
      </form>
      <form action={resend} className="flex items-center justify-between gap-3 text-sm text-ink-muted">
        <span>Codes expire after 30 minutes.</span>
        <button
          type="submit"
          disabled={resending}
          className="inline-flex items-center gap-1.5 font-semibold text-primary-700 underline-offset-2 hover:underline disabled:opacity-60"
        >
          {resending ? <RotateCw className="size-3.5 animate-spin" aria-hidden /> : null}
          Send new codes
        </button>
      </form>
      {resent.status === "sent" ? <SuccessNote>New codes are on their way. Use the newest ones.</SuccessNote> : null}
      {resent.status === "error" ? <ErrorNote message={resent.message} /> : null}
    </div>
  );
}

/** While a request waits for a decision, look again every so often. */
export function KeepChecking({ everySeconds = 20 }: { everySeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everySeconds * 1000);
    return () => clearInterval(id);
  }, [router, everySeconds]);
  return null;
}
