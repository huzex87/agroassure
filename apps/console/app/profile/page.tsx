import { tryGet, type Me } from "../../lib/api";
import { accountLine } from "../../lib/roles";
import { PageHeader, Panel } from "../../components/ui";

// Who you are signed in as. Small on purpose: a person landing here wants to
// confirm which account and role they hold, usually before asking for a change.

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await tryGet<Me>("/v1/me");

  const rows: Array<[string, string]> = me
    ? [
        ["Name", me.fullName || "—"],
        ["Email", me.email ?? "—"],
        ["Role", accountLine(me.roles, me.jurisdictionName)],
        ["Programme", me.authority?.name ?? "—"],
      ]
    : [];

  return (
    <>
      <PageHeader title="Your account" summary="The account you are signed in with." />
      <Panel>
        {me ? (
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {rows.map(([term, value]) => (
              <div key={term}>
                <dt className="text-sm text-ink-muted">{term}</dt>
                <dd className="mt-0.5 font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">Your details could not be loaded. Try again in a moment.</p>
        )}
        <p className="mt-6 border-t border-border pt-4 text-sm leading-relaxed text-ink-muted">
          To change your name, email or role, ask your administrator. They can do it under Settings, then Team.
        </p>
      </Panel>
    </>
  );
}
