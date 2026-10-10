import { describe, expect, it } from "vitest";
import { isActive, NAV, NAV_ITEMS, navFor } from "../components/nav";

// The dashboard's href is "/", which is a prefix of every other route. A naive
// startsWith would light up two links on every page in the console.

describe("isActive", () => {
  it("marks the dashboard active only on the dashboard", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/facilities", "/")).toBe(false);
  });

  it("keeps a section active on its detail pages", () => {
    expect(isActive("/inspections/abc-123", "/inspections")).toBe(true);
    expect(isActive("/facilities", "/facilities")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(isActive("/instruments-archive", "/instruments")).toBe(false);
  });

  it("lights exactly one link for every route the nav offers", () => {
    for (const item of NAV_ITEMS) {
      expect(NAV_ITEMS.filter((other) => isActive(item.href, other.href))).toHaveLength(1);
    }
  });

  it("keeps Settings lit on the pages that live behind it", () => {
    const settings = NAV_ITEMS.find((i) => i.href === "/settings")!;
    for (const page of ["/settings", "/team", "/instruments", "/instruments/abc", "/executive"]) {
      expect(isActive(page, settings.href, settings.also)).toBe(true);
    }
    expect(isActive("/facilities", settings.href, settings.also)).toBe(false);
  });

  it("groups every destination exactly once", () => {
    const hrefs = NAV.flatMap((group) => group.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/");
  });
});

describe("the menu for each role", () => {
  const hrefs = (roles: string[] | null) => navFor(roles).flatMap((g) => g.items.map((i) => i.href));

  it("is five everyday links, Settings and Help, however many roles", () => {
    expect(hrefs(["state_admin"])).toEqual([
      "/",
      "/plan",
      "/inspections",
      "/findings",
      "/facilities",
      "/settings",
      "/help",
    ]);
  });

  it("gives a supervisor visits and the record", () => {
    const menu = hrefs(["desk_supervisor"]);
    expect(menu).toEqual(expect.arrayContaining(["/plan", "/inspections", "/facilities", "/settings"]));
  });

  it("does not offer an auditor planning, which it could not do", () => {
    expect(hrefs(["auditor"])).not.toContain("/plan");
  });

  it("no longer lists the occasional pages in the menu itself", () => {
    const menu = hrefs(["state_admin"]);
    for (const href of ["/team", "/instruments", "/executive"]) expect(menu).not.toContain(href);
  });

  it("drops a heading left with nothing under it", () => {
    const headings = navFor(["inspector"]).map((g) => g.heading);
    expect(headings).toEqual(["Your work", "Manage"]);
    expect(hrefs(["inspector"])).not.toContain("/plan");
  });

  it("shows everything when the roles could not be read, rather than nothing", () => {
    expect(hrefs(null)).toEqual(NAV_ITEMS.map((i) => i.href));
  });
});

describe("who sees what on the Settings page", () => {
  it("shows Team to administrators and auditors only, and Checklists to everyone", async () => {
    const { canSee, TEAM_ROLES } = await import("../lib/roles");
    expect(canSee(["state_admin"], TEAM_ROLES)).toBe(true);
    expect(canSee(["desk_supervisor"], TEAM_ROLES)).toBe(false);
    expect(canSee(["desk_supervisor"], undefined)).toBe(true);
    // The roles could not be read: show it all rather than an empty page.
    expect(canSee(null, TEAM_ROLES)).toBe(true);
  });
});
