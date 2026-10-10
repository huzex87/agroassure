"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Send, UserPlus } from "lucide-react";
import { Button } from "../ui/button";
import { ErrorNote, Field, SubmitButton as Submit } from "../forms";
import type { InviteChannels } from "../../lib/api";
import { ROLE_LABEL } from "../../lib/roles";
import {
  addColleague,
  inviteInspector,
  resendCode,
  type FormState,
  type InviteState,
} from "../../app/team/actions";
import { InviteCard, Modal } from "./invite-card";

// Inviting people, from the Team page.

/** What the form can promise about delivery, in one sentence. */
function deliveryNote(channels: InviteChannels | null): string {
  if (!channels) return "We'll send them a code by SMS and email.";
  const sms = channels.sms !== "none" && channels.sms !== "log";
  const email = channels.email !== "none" && channels.email !== "log";
  if (sms && email) return "We'll send them a code by SMS and email.";
  if (sms) return "We'll send them a code by SMS. Email isn't set up yet.";
  if (email) return "We'll send them a code by email. SMS isn't set up yet.";
  return "Sending isn't set up on this server yet, so you'll see the code here to pass on.";
}

export function InviteInspectorForm({ channels }: { channels: InviteChannels | null }) {
  const [state, action] = useActionState<InviteState, FormData>(inviteInspector, { status: "idle" });
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "issued") {
      setOpen(true);
      form.current?.reset();
    }
  }, [state]);

  return (
    <>
      <form ref={form} action={action} className="space-y-4">
        <Field label="Full name">
          <input name="fullName" required autoComplete="off" placeholder="Aisha Bello" className="field w-full" />
        </Field>
        <Field label="Phone number" hint="for SMS">
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0803 123 4567" className="field w-full" />
        </Field>
        <Field label="Email" hint="optional">
          <input name="email" type="email" autoComplete="off" placeholder="aisha@example.gov.ng" className="field w-full" />
        </Field>

        {state.status === "error" ? <ErrorNote message={state.message} /> : null}

        <Submit pendingText="Sending invite…">
          <Send className="size-4" aria-hidden /> Send invite
        </Submit>
        <p className="text-xs leading-relaxed text-ink-muted">{deliveryNote(channels)}</p>
      </form>

      <Modal open={open && state.status === "issued"} onClose={() => setOpen(false)}>
        {state.status === "issued" ? (
          <InviteCard invitation={state.invitation} onClose={() => setOpen(false)} />
        ) : null}
      </Modal>
    </>
  );
}

/** "Send new code" on a person's row: a new phone, a lost message, an expired code. */
export function ResendCodeButton({ userId, label = "Send new code" }: { userId: string; label?: string }) {
  const [state, action, pending] = useActionState<InviteState>(
    resendCode.bind(null, userId),
    { status: "idle" },
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status !== "idle") setOpen(true);
  }, [state]);

  return (
    <>
      <form action={action}>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {pending ? null : <Send aria-hidden />}
          {pending ? "Sending…" : label}
        </Button>
      </form>
      <Modal open={open} onClose={() => setOpen(false)}>
        {state.status === "issued" ? (
          <InviteCard invitation={state.invitation} onClose={() => setOpen(false)} />
        ) : state.status === "error" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-ink">Couldn&rsquo;t send a new code</h2>
            <ErrorNote message={state.message} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

// Three choices, with the least powerful first and chosen to begin with. Read-only
// access sits beneath them: it is asked for rarely, and a fourth card made every
// administrator read one more thing to find the one they wanted.
const CONSOLE_ROLES: Array<[string, string, string]> = [
  ["desk_supervisor", ROLE_LABEL.desk_supervisor!, "Plans visits and records decisions on inspections"],
  ["authorising_officer", ROLE_LABEL.authorising_officer!, "Records decisions and authorises certificates"],
  ["state_admin", ROLE_LABEL.state_admin!, "Manages the team and settings, and plans visits"],
];

/** Someone who works in the console: a supervisor, an officer, an administrator. */
export function AddColleagueForm({ canGrantNational = false }: { canGrantNational?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(addColleague, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "done") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input name="fullName" required autoComplete="off" className="field w-full" />
        </Field>
        <Field label="Work email">
          <input name="email" type="email" required autoComplete="off" className="field w-full" />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink">Role</legend>
        <div className="mt-2 grid gap-2">
          {(canGrantNational
            ? [...CONSOLE_ROLES, ["national_admin", ROLE_LABEL.national_admin!, "Full access across every state, including adding other administrators"] as [string, string, string]]
            : CONSOLE_ROLES
          ).map(([value, title, description], i) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line px-3 py-2.5 transition-colors hover:bg-surface-sunk has-[:checked]:border-primary-200 has-[:checked]:bg-primary-50"
            >
              <input type="radio" name="role" value={value} defaultChecked={i === 0} className="mt-1 accent-[var(--primary)]" />
              <span>
                <span className="block text-sm font-medium text-ink">{title}</span>
                <span className="block text-xs text-ink-muted">{description}</span>
              </span>
            </label>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-muted">Read-only access instead</summary>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-control border border-line px-3 py-2.5 transition-colors hover:bg-surface-sunk has-[:checked]:border-primary-200 has-[:checked]:bg-primary-50">
            <input type="radio" name="role" value="auditor" className="mt-1 accent-[var(--primary)]" />
            <span>
              <span className="block font-medium text-ink">{ROLE_LABEL.auditor}</span>
              <span className="block text-xs text-ink-muted">Can read everything and change nothing</span>
            </span>
          </label>
        </details>
      </fieldset>

      {state.status === "error" ? <ErrorNote message={state.message} /> : null}
      {state.status === "done" ? (
        <p role="status" className="rounded-control border border-success-border bg-success-muted px-3 py-2 text-sm text-success">
          {state.message ?? "Added. They can sign in to this console with that email address."}
        </p>
      ) : null}

      <div className="sm:w-56">
        <Submit pendingText="Adding…">
          <UserPlus className="size-4" aria-hidden /> Add colleague
        </Submit>
      </div>
    </form>
  );
}
