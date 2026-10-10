import { NAV_ITEMS } from "../components/nav";
import { canSee, PROGRAMME_ROLES, TEAM_ROLES } from "./roles";

// The places Quick find can take a person, and how a typed word narrows them.
// Kept apart from the dialog so the matching can be tested without a browser.

export type Destination = { href: string; label: string; hint?: string };

// Pages that live behind Settings but are reached often enough to jump to.
const SETTINGS_PAGES: Array<Destination & { roles?: string[] }> = [
  { href: "/team", label: "Team", hint: "Invite people, sign out a phone", roles: TEAM_ROLES },
  { href: "/instruments", label: "Checklists", hint: "The questions inspectors answer" },
  { href: "/executive", label: "Programme overview", hint: "Coverage and trends", roles: PROGRAMME_ROLES },
  { href: "/facilities/new", label: "Add a facility" },
  { href: "/facilities/new?tab=import", label: "Import facilities", hint: "From a spreadsheet" },
];

/** Every page this person may open, menu pages first. */
export function destinationsFor(roles: string[] | null): Destination[] {
  const menu = NAV_ITEMS.filter((item) => canSee(roles, item.roles)).map(({ href, label }) => ({ href, label }));
  const more = SETTINGS_PAGES.filter((p) => canSee(roles, p.roles)).map(({ href, label, hint }) => ({
    href,
    label,
    hint,
  }));
  return [...menu, ...more];
}

/** Destinations whose label or hint contains every typed word. An empty query keeps them all. */
export function matchDestinations(all: Destination[], query: string): Destination[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return all;
  return all.filter((d) => {
    const text = `${d.label} ${d.hint ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
