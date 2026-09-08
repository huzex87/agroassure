import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button, Panel } from "../../components/ui";
import { authorizeUrl, challengeFor, newState, newVerifier, oidcSettings } from "../../lib/oidc";
import { isWellFormedToken } from "../../lib/api";

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

/** Two letters for the avatar. A single-word name still gets one. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

interface DevUser {
  id: string;
  full_name: string;
  email: string;
  roles: string[];
}

/**
 * Who this deployment will sign you in as, if it offers that at all.
 *
 * Only present when the gateway was started with development sign-in enabled,
 * which it refuses to do alongside a real identity provider. Anywhere else this
 * comes back empty and the token box stands in.
 */
async function devUsers(): Promise<DevUser[]> {
  const base = process.env.AGROASSURE_API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${base}/v1/auth/dev-users`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as DevUser[]) : [];
  } catch {
    return [];
  }
}

async function signInAs(formData: FormData) {
  "use server";
  const base = process.env.AGROASSURE_API_URL ?? "http://localhost:3001";
  const res = await fetch(`${base}/v1/auth/dev-signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
    cache: "no-store",
  });
  if (!res.ok) {
    redirect("/signin?error=" + encodeURIComponent("That sign-in was refused."));
  }
  const { token } = (await res.json()) as { token: string };

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

async function signInWithToken(formData: FormData) {
  "use server";
  // Copying a token off a screen picks things up: a trailing newline, a
  // zero-width space, a bullet where a wrap used to be. Strip what is safe to
  // strip, then refuse what is left if it is not a token, rather than storing it
  // and failing on the next request with a message about ByteStrings.
  const token = String(formData.get("token") ?? "").replace(/\s+/g, "");
  if (!token) return;
  if (!isWellFormedToken(token)) {
    redirect("/signin?error=" + encodeURIComponent(
      "That does not look like a token. It should be three dot-separated parts and nothing else — check for a stray character picked up while copying.",
    ));
  }

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
  const users = settings ? [] : await devUsers();
  const { error } = await searchParams;
  const notice = error ? (
    <p className="mb-4 rounded-control border border-critical-line bg-critical-bg px-3.5 py-3 text-sm leading-relaxed text-critical">
      {error}
    </p>
  ) : null;

  if (settings) {
    return (
      <div className="w-full">
        <Panel title="Sign in" subtitle="Continue with your institutional account.">
          {notice}
          <form action={startOidc}>
            <Button>Continue</Button>
          </form>
          <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
            You will be sent to your organisation&rsquo;s identity provider. This console never
            sees your password, and your role and jurisdiction come from the provider rather
            than from anything you can set here.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Panel
        title="Sign in"
        subtitle={
          users.length > 0
            ? "Development sign-in. Choose who to continue as."
            : "Development sign-in. Paste an API token to continue."
        }
      >
        {notice}

        {/* Names, not tokens. Copying a 296-character string between a terminal
            and two applications is a step people get wrong, and it taught this
            project nothing. The gateway still verifies every token it is given;
            this only changes how one is obtained. */}
        {users.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {users.map((u) => (
              <form key={u.id} action={signInAs}>
                <input type="hidden" name="email" value={u.email} />
                <button
                  type="submit"
                  className="group flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left ring-1 ring-inset ring-line transition-colors hover:bg-primary-50 hover:ring-primary-200"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunk text-sm font-semibold text-ink-muted ring-1 ring-inset ring-line transition-colors group-hover:bg-primary-100 group-hover:text-primary-700 group-hover:ring-primary-200"
                  >
                    {initials(u.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {u.full_name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {u.roles.map((r) => r.replace(/_/g, " ")).join(", ") || "No role"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-ink-faint transition-colors group-hover:text-primary"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 3.5 4.5 4.5L6 12.5" />
                    </svg>
                  </span>
                </button>
              </form>
            ))}
          </div>
        ) : null}

        <details className={users.length > 0 ? "mt-6" : ""}>
          <summary className="cursor-pointer text-sm text-ink-muted">
            {users.length > 0 ? "Or paste an API token" : "API token"}
          </summary>
          <form action={signInWithToken} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-ink-muted">API token</span>
            <textarea
              name="token"
              required
              rows={4}
              className="field mt-1 w-full font-mono text-xs"
            />
          </label>
            <Button>Continue</Button>
          </form>
        </details>

        <p className="mt-6 border-t border-line pt-4 text-sm text-ink-muted">
          No identity provider is configured, so this page stands in for one. It verifies
          nothing; the API validates the token on every request and derives the role and
          jurisdiction from it. Set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and
          OIDC_REDIRECT_URI to replace this with the OpenID Connect redirect.
        </p>
      </Panel>
    </div>
  );
}
