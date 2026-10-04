import Link from "next/link";
import { Check, Clock, PartyPopper, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { Button, Panel } from "../../components/ui";
import { CodesForm, DetailsForm, KeepChecking } from "../../components/register/register-forms";
import { currentRegistration, registerOptions, startOver } from "./actions";

// Asking to join the console.
//
// Three steps, shown as three: your details; a code from your email and one
// from your phone, to prove both are yours; and a wait while an administrator
// in your state approves you and picks your role. Nothing is granted until
// then, so this page can be open to anyone.

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  inspector: "Inspector",
  desk_supervisor: "Desk supervisor",
  authorising_officer: "Authorising officer",
  state_admin: "State administrator",
  national_admin: "National administrator",
  auditor: "Auditor",
};

const STEPS = ["Your details", "Confirm", "Approval"];

function Stepper({ at }: { at: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-primary text-white"
                  : current
                    ? "bg-primary-50 text-primary-700 ring-2 ring-inset ring-primary"
                    : "bg-surface-sunk text-ink-faint ring-1 ring-inset ring-line"
              }`}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={`truncate text-xs font-medium ${current ? "text-ink" : "text-ink-muted"}`}>{label}</span>
            {i < STEPS.length - 1 ? <span className={`h-px flex-1 ${done ? "bg-primary" : "bg-line"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Outcome({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: "primary" | "success" | "destructive";
  title: string;
  children: React.ReactNode;
}) {
  const ring = {
    primary: "bg-primary-50 text-primary ring-primary-100",
    success: "bg-success-muted text-success ring-success-border",
    destructive: "bg-destructive-muted text-destructive ring-destructive-border",
  }[tone];
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <span className={`grid size-12 place-items-center rounded-full ring-1 ring-inset ${ring}`}>{icon}</span>
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <div className="max-w-sm text-sm leading-relaxed text-ink-muted">{children}</div>
    </div>
  );
}

const quietLink = "font-semibold text-primary-700 underline underline-offset-2";

function StartOverButton({ children }: { children: React.ReactNode }) {
  return (
    <form action={startOver} className="inline">
      <button type="submit" className={quietLink}>
        {children}
      </button>
    </form>
  );
}

export default async function RegisterPage() {
  const [options, request] = await Promise.all([registerOptions(), currentRegistration()]);

  if (request?.status === "verifying") {
    return (
      <Panel title="Confirm it's you" subtitle={`We sent a 6-digit code to your email and another to your phone, ${request.fullName.split(" ")[0]}.`}>
        <Stepper at={1} />
        <CodesForm emailVerified={request.emailVerified} phoneVerified={request.phoneVerified} />
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
          Wrong details? <StartOverButton>Start again</StartOverButton>
        </p>
      </Panel>
    );
  }

  if (request?.status === "pending") {
    return (
      <Panel>
        <KeepChecking />
        <Stepper at={2} />
        <Outcome icon={<Clock className="size-6" aria-hidden />} tone="primary" title="Waiting for approval">
          <p>
            Thanks, {request.fullName.split(" ")[0]}. Your email and phone are confirmed and your request is with
            the administrators for your state.
          </p>
          <p className="mt-2">
            We&rsquo;ll email and text you as soon as they decide. You can close this page — or leave it open and it
            will update by itself.
          </p>
        </Outcome>
        <ul className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
          <li className="flex items-center gap-2 text-success">
            <ShieldCheck className="size-4" aria-hidden /> Email confirmed
          </li>
          <li className="flex items-center gap-2 text-success">
            <ShieldCheck className="size-4" aria-hidden /> Phone confirmed
          </li>
        </ul>
      </Panel>
    );
  }

  if (request?.status === "approved") {
    return (
      <Panel>
        <Outcome icon={<PartyPopper className="size-6" aria-hidden />} tone="success" title={`Welcome aboard, ${request.fullName.split(" ")[0]}`}>
          <p>
            You&rsquo;ve been approved as <strong className="text-ink">{ROLE_LABEL[request.role ?? ""] ?? "a team member"}</strong>.
            {request.role === "inspector"
              ? " We've sent you a code by SMS and email. Install the AgroAssure phone app and enter it to set up your phone."
              : " Sign in with your work email — we'll send you a link, no password needed."}
          </p>
        </Outcome>
        {request.role !== "inspector" ? (
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/signin">Sign in</Link>
          </Button>
        ) : null}
      </Panel>
    );
  }

  if (request?.status === "rejected") {
    return (
      <Panel>
        <Outcome icon={<XCircle className="size-6" aria-hidden />} tone="destructive" title="Request not approved">
          <p>Your request to join wasn&rsquo;t approved.</p>
          {request.rejectReason ? (
            <p className="mt-3 rounded-control border border-line bg-surface-sunk px-3 py-2 text-left text-ink">
              <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Reason given</span>
              {request.rejectReason}
            </p>
          ) : null}
          <p className="mt-3">If you think this is a mistake, speak to your administrator.</p>
        </Outcome>
        <p className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">
          <StartOverButton>Make a new request</StartOverButton>
        </p>
      </Panel>
    );
  }

  if (!options) {
    return (
      <Panel title="Request access">
        <p className="text-sm text-ink-muted">The server could not be reached. Try again in a moment.</p>
      </Panel>
    );
  }

  if (!options.available) {
    return (
      <Panel title="Request access">
        <p className="text-sm leading-relaxed text-ink-muted">
          This server doesn&rsquo;t take requests to join. Ask your administrator to add you — they&rsquo;ll send you
          everything you need.
        </p>
        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
          Already have an account?{" "}
          <Link href="/signin" className={quietLink}>
            Sign in
          </Link>
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Request access" subtitle="For office staff: supervisors, officers and administrators.">
      <Stepper at={0} />
      {request?.status === "withdrawn" ? (
        <p className="mb-4 rounded-control border border-line bg-surface-sunk px-3 py-2 text-sm text-ink-muted">
          Your earlier request was replaced by a newer one. Fill in your details to start again.
        </p>
      ) : null}
      <DetailsForm jurisdictions={options.jurisdictions} />
      <div className="mt-5 flex items-start gap-2.5 rounded-control border border-primary-100 bg-primary-50 px-3 py-2.5 text-sm text-primary-700">
        <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <strong>Field inspector?</strong> Register in the AgroAssure phone app instead — your phone is set up at the
          same time.
        </p>
      </div>
      <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/signin" className={quietLink}>
          Sign in
        </Link>
      </p>
    </Panel>
  );
}
