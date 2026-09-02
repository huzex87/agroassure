import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button, Card } from "../../components/ui";

// ponytail: a development stand-in for the institution's OpenID Connect
// provider (section 18.2). It accepts a token and stores it in an httpOnly
// cookie; it authenticates nobody. Production replaces this page with the OIDC
// redirect, and nothing else in the console changes, because every other file
// only ever asks lib/api for a token.

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const jar = await cookies();
  jar.set("agroassure_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card title="Sign in" subtitle="Development sign-in. Paste an API token to continue.">
        <form action={signIn} className="space-y-3">
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
          This page stands in for the institution&rsquo;s identity provider while the platform is
          in development. It verifies nothing; the API validates the token on every request and
          derives the role and jurisdiction from it. Replace this with the OpenID Connect
          redirect before a pilot.
        </p>
      </Card>
    </div>
  );
}
