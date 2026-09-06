"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Where you are, and what kind of thing you are looking at.
//
// The links are grouped because they are not one list: four of them are the
// record, two are how the programme is measured, and one is administration. A
// flat list of seven made a supervisor read all seven every time to find the
// two they use. The icons are here to make a familiar destination findable
// without reading — they carry no meaning the label does not, and every one is
// aria-hidden.

// The icon is the component, not an element. Holding <IconGrid /> here would
// build React elements at module load, which is work done before anyone asks
// for it and makes this module impossible to import without a JSX runtime.
type NavItem = { href: string; label: string; Icon: () => ReactNode };

export const NAV: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Oversight",
    items: [
      { href: "/", label: "Dashboard", Icon: IconGrid },
      { href: "/executive", label: "Programme overview", Icon: IconTrend },
    ],
  },
  {
    heading: "The record",
    items: [
      { href: "/facilities", label: "Facilities", Icon: IconBuilding },
      { href: "/inspections", label: "Inspections", Icon: IconClipboard },
      { href: "/findings", label: "Corrective actions", Icon: IconFlag },
      { href: "/instruments", label: "Instruments", Icon: IconLayers },
    ],
  },
  {
    heading: "Administration",
    items: [{ href: "/admin", label: "Users and devices", Icon: IconUsers }],
  },
];

/** Every destination, in rail order — for the small-screen row and for tests. */
export const NAV_ITEMS = NAV.flatMap((group) => group.items);

/**
 * The dashboard lives at "/", so a prefix test would mark it active on every
 * page. Every other section owns its subtree: an inspection detail page should
 * still light up "Inspections".
 */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {group.heading}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary-50 font-semibold text-primary-700 ring-1 ring-inset ring-primary-100"
                        : "text-ink-muted hover:bg-surface-sunk hover:text-ink"
                    }`}
                  >
                    <span className={active ? "text-primary" : "text-ink-faint"}>
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
 * escape key and a scroll lock; seven links in a row need none of that and cost
 * one tap rather than two. Build the drawer when the nav outgrows a single row.
 */
export function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex gap-1.5 overflow-x-auto border-b border-line bg-surface px-4 py-2.5 md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active
                ? "bg-primary-50 font-semibold text-primary-700 ring-1 ring-inset ring-primary-200"
                : "text-ink-muted"
            }`}
          >
            <span className={active ? "text-primary" : "text-ink-faint"}>
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
   Icons. Drawn here rather than pulled from a set: seven glyphs at one weight
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

function IconTrend() {
  return glyph(
    <>
      <path d="M2 13V3" />
      <path d="M2 13h12" />
      <path d="M4.5 10.5 7 7.5l2.5 2 3-4.5" />
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

function IconLayers() {
  return glyph(
    <>
      <path d="M8 1.75 14 5 8 8.25 2 5l6-3.25Z" />
      <path d="m2 8.5 6 3.25L14 8.5" />
      <path d="m2 11.75 6 3.25 6-3.25" />
    </>,
  );
}

function IconUsers() {
  return glyph(
    <>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.75 14a4.25 4.25 0 0 1 8.5 0" />
      <path d="M11 3.4a2.5 2.5 0 0 1 0 4.2" />
      <path d="M12 10.2a4.25 4.25 0 0 1 2.25 3.8" />
    </>,
  );
}
