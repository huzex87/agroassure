import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { get, tryGet, type Me, type SystemCheck, type SystemStatus } from "../../../lib/api";
import { PageHeader, Panel } from "../../../components/ui";
import { TestEmailButton } from "../../../components/test-email-button";
import { redirect } from "next/navigation";
import { ADMIN_ROLES, canSee } from "../../../lib/roles";

// Whether the server is set up properly, in plain words. Each line is a thing
// that has actually gone wrong for someone, with what it means and what to
// change. Setting this platform up used to be a matter of finding out which
// of thirty settings was wrong by watching an email not arrive.

export const dynamic = "force-dynamic";

const ORDER = { fail: 0, warn: 1, ok: 2 } as const;

const STYLE = {
  fail: { Icon: CircleAlert, tone: "text-destructive", label: "Needs fixing" },
  warn: { Icon: TriangleAlert, tone: "text-warning", label: "Worth a look" },
  ok: { Icon: CircleCheck, tone: "text-success", label: "Working" },
} as const;

const HEADLINE = {
  ok: "Everything is set up.",
  attention: "Working, with a few things worth a look.",
  broken: "Something is not working yet.",
} as const;

export default async function SystemStatusPage() {
  const me = await tryGet<Me>("/v1/me");
  if (me && !canSee(me.roles, ADMIN_ROLES)) redirect("/settings");

  const status = await get<SystemStatus>("/v1/system/status");
  const checks = [...status.checks].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const problems = checks.filter((c) => c.state !== "ok").length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "System status" }]}
        title="System status"
        summary={HEADLINE[status.overall]}
      />

      <Panel
        title="Email"
        subtitle="Sign-in links, welcome emails and invites all depend on it. The only sure test is to send one."
      >
        <TestEmailButton />
      </Panel>

      <Panel
        flush
        title={problems === 0 ? "Checks" : `Checks · ${problems} to look at`}
        subtitle="Nothing here shows a password or a key."
      >
        <ul className="divide-y divide-line">
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      </Panel>
    </>
  );
}

function CheckRow({ check }: { check: SystemCheck }) {
  const { Icon, tone, label } = STYLE[check.state];
  return (
    <li className="flex items-start gap-3.5 px-5 py-4">
      <Icon className={`mt-0.5 size-5 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {check.title} <span className="sr-only">: {label}</span>
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{check.detail}</p>
        {check.fix ? (
          <p className="mt-2 rounded-control border border-line bg-surface-sunk px-3 py-2 text-sm leading-relaxed text-ink">
            <span className="font-medium">To fix: </span>
            {check.fix}
          </p>
        ) : null}
      </div>
    </li>
  );
}
