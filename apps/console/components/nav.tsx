"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Where you are.
//
// The sidebar had no active state, which is the single thing that makes a
// console read as unfinished: seven links, all identical, and no answer to
// "which page am I on". And below the medium breakpoint it had no navigation
// at all — the whole nav was `hidden md:block`, so a supervisor opening this on
// a tablet in a car could reach exactly the page they landed on.
//
// ponytail: the small-screen version is the same list scrolled horizontally,
// not a drawer. A drawer needs open state, a focus trap, an escape key and a
// scroll lock; a scrolling row of seven links needs none of that and is one tap
// rather than two. Build the drawer when the nav outgrows a single row.

export const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/executive", label: "Programme overview" },
  { href: "/facilities", label: "Facilities" },
  { href: "/inspections", label: "Inspections" },
  { href: "/findings", label: "Corrective actions" },
  { href: "/instruments", label: "Instruments" },
  { href: "/admin", label: "Users and devices" },
];

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
    <ul className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "block rounded-[12px] bg-primary-100 px-3 py-2 text-sm font-semibold text-primary-700"
                  : "block rounded-[12px] px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-primary-50 hover:text-ink"
              }
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="-mx-5 flex gap-1 overflow-x-auto border-b border-line bg-white px-5 py-2 md:hidden"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "whitespace-nowrap rounded-full bg-primary-100 px-3 py-1.5 text-sm font-semibold text-primary-700"
                : "whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink-muted"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
