"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Button } from "./ui/button";
import { ErrorNote, SuccessNote } from "./forms";
import { sendTestEmail, type TestEmailState } from "../app/settings/status/actions";

// Sends one real email to the person asking, and shows exactly what came back.

export function TestEmailButton() {
  const [state, action, pending] = useActionState<TestEmailState>(() => sendTestEmail(), { status: "idle" });

  return (
    <form action={action} className="space-y-3">
      <Button type="submit" variant="secondary" loading={pending}>
        {pending ? null : <Mail aria-hidden />}
        {pending ? "Sending…" : "Send me a test email"}
      </Button>
      {state.status === "sent" ? <SuccessNote>{state.message}</SuccessNote> : null}
      {state.status === "failed" ? <ErrorNote message={state.message} /> : null}
    </form>
  );
}
