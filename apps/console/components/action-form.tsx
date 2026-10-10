"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "../lib/action-result";
import { Button } from "./ui/button";
import { Modal } from "./team/invite-card";
import { useToast } from "./toast";

// A form for a button that does something to a record: cancel, sign out,
// verify, authorise. It runs the server action, says what happened in a toast,
// and, where the act is hard to undo, asks first. The server still checks every
// request; the question is for the person, not for the gateway.

export type Confirm = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Style the confirming button as destructive. */
  destructive?: boolean;
};

export function ActionForm({
  action,
  success,
  confirm,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  success: string;
  confirm?: Confirm;
  className?: string;
  children: ReactNode;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  const run = async (data: FormData) => {
    const result = await action(data);
    if (result.ok) toast.success(success);
    else toast.error(result.message);
    setAsking(false);
  };

  if (!confirm) {
    return (
      <form ref={form} action={run} className={className}>
        {children}
      </form>
    );
  }

  return (
    <>
      <form
        ref={form}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          // The browser's own required-field check has already run by now, so a
          // blank reason is caught before this question is asked.
          setAsking(true);
        }}
      >
        {children}
      </form>
      <Modal open={asking} onClose={() => !pending && setAsking(false)}>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{confirm.title}</h2>
          <div className="text-sm leading-relaxed text-ink-muted">{confirm.body}</div>
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setAsking(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant={confirm.destructive ? "destructive" : "default"}
              loading={pending}
              onClick={() => form.current && start(() => run(new FormData(form.current!)))}
            >
              {confirm.confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
