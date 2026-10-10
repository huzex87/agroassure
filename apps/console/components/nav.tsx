"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { OVERSIGHT, PLANNERS } from "../lib/roles";

// Where you are, and what kind of thing you are looking at.
//
// Five things people do every day, and one place for everything else. The menu
// used to list nine destinations; a supervisor read all nine every time to find
// the three they use. Checklists, the team and the programme overview are
// occasional jobs, so they live behind Settings, which still lights up while
// you are on any of them. The icons are here to make a familiar destination
// findable without reading — they carry no meaning the label does not, and
// every one is aria-hidden.

// The icon is the component, not an element. Holding <IconGrid /> here would
// build React elements at module load, which is work done before anyone asks
// for it and makes this module impossible to import without a JSX runtime.
type NavItem = {
  href: string;
  label: string;
  Icon: () => ReactNode;
  roles?: string[];
  /** Pages that belong to this destination without being in the menu. */
  also?: string[];
};

export const NAV: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Your work",
    items: [
      { href: "/", label: "Home", Icon: IconGrid, roles: OVERSIGHT },
      { href: "/plan", label: "Visits", Icon: IconCalendar, roles: PLANNERS },
      { href: "/inspections", label: "Inspections", Icon: IconClipboard },
      { href: "/findings", label: "Findings", Icon: IconFlag },
      { href: "/facilities", label: "Facilities", Icon: IconBuilding },
    ],
  },
  {
    heading: "Manage",
    items: [
      {
        href: "/settings",
        label: "Settings",
        Icon: IconSettings,
        also: ["/team", "/instruments", "/executive"],
      },
    ],
  },
];

/**
 * The menu for someone holding these roles. Unknown roles — the gateway could
 * not be asked — show everything rather than nothing: a full menu with a
 * refusal behind one link beats an empty one.
 */
export function navFor(roles: string[] | null): Array<{ heading: string; items: NavItem[] }> {
  if (!roles) return NAV;
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r))),
  })).filter((group) => group.items.length > 0);
}

/** Every destination, in rail order — for the small-screen row and for tests. */
export const NAV_ITEMS = NAV.flatMap((group) => group.items);

/**
 * The dashboard lives at "/", so a prefix test would mark it active on every
 * page. Every other section owns its subtree: an inspection detail page should
 * still light up "Inspections".
 */
export function isActive(pathname: string, href: string, also: string[] = []): boolean {
  if (href === "/") return pathname === "/";
  return [href, ...also].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

export function SideNav({ roles = null }: { roles?: string[] | null }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      {navFor(roles).map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-white/50">
            {group.heading}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href, item.also);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/10 font-semibold text-white"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active ? (
                      <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-millet" />
                    ) : null}
                    <span className={active ? "text-millet" : "text-white/50"}>
                      <item.Icon />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Below the medium breakpoint the rail is gone, so the same destinations become
 * a scrolling row of pills.
 *
 * ponytail: a row, not a drawer. A drawer needs open state, a focus trap, an
 * escape key and a scroll lock; six links in a row need none of that and cost
 * one tap rather than two. Build the drawer when the nav outgrows a single row.
 */
export function TopNav({ roles = null }: { roles?: string[] | null }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex gap-1.5 overflow-x-auto bg-pine px-4 py-2.5 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] md:hidden"
    >
      {navFor(roles)
        .flatMap((g) => g.items)
        .map((item) => {
          const active = isActive(pathname, item.href, item.also);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                active ? "bg-white/10 font-semibold text-white ring-1 ring-inset ring-white/20" : "text-white/75"
              }`}
            >
              <span className={active ? "text-millet" : "text-white/50"}>
                <item.Icon />
              </span>
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

/* ---------------------------------------------------------------------------
   Icons. Drawn here rather than pulled from a set: a handful of glyphs at one weight
   is less code than a dependency, and they can share the stroke the rest of the
   interface uses. */

function glyph(path: ReactNode) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {path}
    </svg>
  );
}

function IconGrid() {
  return glyph(
    <>
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </>,
  );
}

function IconBuilding() {
  return glyph(
    <>
      <path d="M2.5 14V4.5L8 2l5.5 2.5V14" />
      <path d="M1.5 14h13" />
      <path d="M6.5 14v-3h3v3" />
      <path d="M6 6.5h1M9 6.5h1M6 9h1M9 9h1" />
    </>,
  );
}

function IconClipboard() {
  return glyph(
    <>
      <path d="M6 2.5H4.5A1.5 1.5 0 0 0 3 4v9.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V4a1.5 1.5 0 0 0-1.5-1.5H10" />
      <rect x="6" y="1" width="4" height="3" rx="1" />
      <path d="M5.75 8.5 7 9.75l3-3" />
    </>,
  );
}

function IconFlag() {
  return glyph(
    <>
      <path d="M3.5 14.5V2" />
      <path d="M3.5 2.75h8l-1.5 3 1.5 3h-8" />
    </>,
  );
}

function IconCalendar() {
  return glyph(
    <>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.75v2.5M10.5 1.75v2.5M6 10h4M8 8v4" />
    </>,
  );
}

function IconSettings() {
  return glyph(
    <>
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.4 3.4l1.25 1.25M11.35 11.35l1.25 1.25M12.6 3.4l-1.25 1.25M4.65 11.35 3.4 12.6" />
    </>,
  );
}
