import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button, Card } from "../../components/ui";
import { authorizeUrl, challengeFor, newState, newVerifier, oidcSettings } from "../../lib/oidc";

// Sign-in, in whichever of the two modes the deployment is configured for.
//
// With a provider configured this is one button that starts the OpenID Connect
// redirect. Without one it is the development page: it accepts a pasted token
// and authenticates nobody, which is fine precisely because the gateway
// verifies every token independently on every request. Nothing else in the
// console changes between the two, because every other file only ever asks
// lib/api for a token.

export const dynamic = "force-dynamic";

const SESSION = "agroassure_session";
const VERIFIER = "agroassure_pkce_verifier";
const STATE = "agroassure_oidc_state";

async function startOidc() {
  "use server";
  const settings = oidcSettings();
  if (!settings) return;

  const verifier = newVerifier();
  const state = newState();
  const jar = await cookies();

  // Both are read once, in the callback, and deleted there. httpOnly so the
  // page itself cannot read them, and short-lived because a sign-in that takes
  // more than ten minutes should start again.
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  jar.set(VERIFIER, verifier, options);
  jar.set(STATE, state, options);

  redirect(authorizeUrl(settings, state, challengeFor(verifier)));
}

async function signInWithToken(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const jar = await cookies();
  jar.set(SESSION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const settings = oidcSettings();
  const { error } = await searchParams;
  const notice = error ? (
    <p className="mb-4 rounded-[12px] border border-line bg-primary-50 p-3 text-sm text-ink">
      {error}
    </p>
  ) : null;

  if (settings) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card title="Sign in" subtitle="Continue with your institutional account.">
          {notice}
          <form action={startOidc}>
            <Button>Continue</Button>
          </form>
          <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
            You will be sent to your organisation&rsquo;s identity provider. This console never
            sees your password, and your role and jurisdiction come from the provider rather
            than from anything you can set here.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-16">
      <Card title="Sign in" subtitle="Development sign-in. Paste an API token to continue.">
        {notice}
        <form action={signInWithToken} className="space-y-3">
          <label className="block text-sm">
            <span className="text-ink-muted">API token</span>
            <textarea
              name="token"
              required
              rows={4}
              className="mt-1 w-full rounded-[12px] border border-line px-3 py-2 font-mono text-xs"
            />
          </label>
          <Button>Continue</Button>
        </form>

        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
          No identity provider is configured, so this page stands in for one. It verifies
          nothing; the API validates the token on every request and derives the role and
          jurisdiction from it. Set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and
          OIDC_REDIRECT_URI to replace this with the OpenID Connect redirect.
        </p>
      </Card>
    </div>
  );
}
