import Link from "next/link";
import { Activity, ArrowRight, BarChart3, ClipboardList, Users } from "lucide-react";
import type { ReactNode } from "react";
import { tryGet, type Me } from "../../lib/api";
import { PageHeader } from "../../components/ui";
import { ADMIN_ROLES, canSee, PROGRAMME_ROLES, TEAM_ROLES } from "../../lib/roles";

// The occasional jobs, in one place. The menu carries the five things people do
// every day; everything that is set up once and revisited now and then lives
// here, each as a card that says what it is for in a sentence.

export const dynamic = "force-dynamic";

const ITEMS: Array<{
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  roles?: string[];
}> = [
  {
    href: "/team",
    title: "Team",
    description: "Invite inspectors and colleagues, see who is set up, and sign out a lost phone.",
    icon: <Users className="size-5" aria-hidden />,
    roles: TEAM_ROLES,
  },
  {
    href: "/instruments",
    title: "Checklists",
    description: "The questions inspectors answer on site, and the version in force for each type of facility.",
    icon: <ClipboardList className="size-5" aria-hidden />,
  },
  {
    href: "/executive",
    title: "Programme overview",
    description: "Coverage, trends and enforcement across the whole programme.",
    icon: <BarChart3 className="size-5" aria-hidden />,
    roles: PROGRAMME_ROLES,
  },
  {
    href: "/settings/status",
    title: "System status",
    description: "Whether email, sign-in, text messages and storage are set up, with a test email to prove it.",
    icon: <Activity className="size-5" aria-hidden />,
    roles: ADMIN_ROLES,
  },
];

export default async function SettingsPage() {
  const me = await tryGet<Me>("/v1/me");
  const items = ITEMS.filter((item) => canSee(me?.roles ?? null, item.roles));

  return (
    <>
      <PageHeader title="Settings" summary="Set up once, come back when something changes." />
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex h-full flex-col gap-3 rounded-card border border-line bg-card p-5 shadow-raised transition-colors hover:border-primary-200 hover:bg-primary-50/40"
            >
              <span className="grid size-10 place-items-center rounded-control bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100">
                {item.icon}
              </span>
              <span>
                <span className="block text-base font-semibold text-ink">{item.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-muted">{item.description}</span>
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
                Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
