import Link from "next/link";
import { tryGet, type Me } from "../../lib/api";
import { ADMIN_ROLES, canSee, ROLE_LABEL } from "../../lib/roles";
import { Button, PageHeader, Panel } from "../../components/ui";

// Help, inside the product. The short version of the handbook: how the work
// flows, what the console can do that is not obvious, and where to look when
// something is wrong. It needs no data, so it opens even when the server is slow.

export const dynamic = "force-dynamic";

const STEPS: Array<[string, string]> = [
  ["Plan a visit", "An administrator or reviewer picks an inspector and the facilities to visit."],
  [
    "Inspect on the phone",
    "The inspector answers the checklist on site, adds notes and photos, and has the facility representative sign. No signal is needed while working.",
  ],
  ["Review the result", "Office staff open the inspection here, check it, and record a decision."],
  [
    "Authorise the certificate",
    "The authorising officer who made the decision authorises it once every finding is verified closed.",
  ],
];

const TIPS: Array<[string, string]> = [
  ["Find anything fast", "Press Ctrl+K (or click Search at the top of the sidebar) and type a facility name, a licence number or a page name."],
  ["Download the registry", "On Facilities, click Export for a spreadsheet of the current search and filter."],
  ["Dark mode", "Click Dark mode at the bottom of the sidebar. The console otherwise follows your device."],
  ["Nothing is overwritten", "A change of mind is recorded as a new decision. The record of what was said stays."],
];

const WRONG: Array<[string, string]> = [
  ["A sign-in link did not work", "Links last 15 minutes and work once. Ask for a new one on the sign-in page."],
  ["The page says Getting things ready", "The service was resting. Wait up to a minute; the page continues by itself."],
  ["Someone cannot sign in", "Only people an administrator added under Settings, then Team, can sign in."],
  ["A phone is lost or borrowed", "Settings, then Team, then Phones, then Sign out this phone. It stops working at once."],
  ["Work has not appeared", "The phone sends when it has a signal. Open the app with the phone online and wait a minute."],
];

export default async function HelpPage() {
  const me = await tryGet<Me>("/v1/me");
  const roles = me?.roles ?? null;
  const roleName = roles?.map((r) => ROLE_LABEL[r]).find(Boolean);

  return (
    <>
      <PageHeader
        title="Help"
        summary={
          roleName
            ? `You are signed in as ${roleName}. Your menu shows what that role can do.`
            : "How the work flows, and what to do when something is wrong."
        }
        actions={
          canSee(roles, ADMIN_ROLES) && roles ? (
            <Button asChild variant="secondary">
              <Link href="/settings/status">Check the system</Link>
            </Button>
          ) : null
        }
      />

      <Panel title="How it works">
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
              >
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Handy things">
          <dl className="space-y-3">
            {TIPS.map(([term, text]) => (
              <div key={term}>
                <dt className="font-semibold text-ink">{term}</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="If something goes wrong">
          <dl className="space-y-3">
            {WRONG.map(([term, text]) => (
              <div key={term}>
                <dt className="font-semibold text-ink">{term}</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <p className="text-sm text-ink-muted">
        The full handbook, with the first-week checklist for administrators, is available from your administrator.
      </p>
    </>
  );
}
