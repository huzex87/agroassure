import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Panel } from "../../../components/ui";
import { SubmitButton } from "../../../components/forms";
import { continueWithLink } from "../email-actions";

// Where an emailed sign-in link lands.
//
// The link is not spent on arrival. Email security scanners open every link in
// a message the moment it is delivered; a link that signed in on first open
// would be spent by the scanner, and the person would be told it had already
// been used. So arriving here does nothing, and the one tap on Continue is the
// sign-in — something a scanner does not do.

export const dynamic = "force-dynamic";

export default async function VerifySignIn({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Panel title="That link is incomplete">
        <p className="text-sm text-ink-muted">
          Open the link from the email again, or ask for a new one.
        </p>
        <Link href="/signin" className="mt-4 inline-block text-sm font-semibold text-primary-700 underline underline-offset-2">
          Back to sign in
        </Link>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-primary-50 text-primary ring-1 ring-inset ring-primary-100">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold text-ink">One more tap</h1>
        <p className="max-w-xs text-sm text-ink-muted">Continue to sign in to the AgroAssure console.</p>
      </div>
      <form action={continueWithLink} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingText="Signing you in…">
          Continue <ArrowRight className="size-4" aria-hidden />
        </SubmitButton>
      </form>
    </Panel>
  );
}
