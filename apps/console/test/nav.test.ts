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

  it("groups every destination exactly once", () => {
    const hrefs = NAV.flatMap((group) => group.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/");
  });
});

describe("the menu for each role", () => {
  const hrefs = (roles: string[] | null) => navFor(roles).flatMap((g) => g.items.map((i) => i.href));

  it("gives a supervisor planning and the record, not administration", () => {
    const menu = hrefs(["desk_supervisor"]);
    expect(menu).toContain("/plan");
    expect(menu).toContain("/facilities");
    expect(menu).not.toContain("/team");
    expect(menu).not.toContain("/executive");
  });

  it("gives an administrator the team page", () => {
    expect(hrefs(["state_admin"])).toEqual(expect.arrayContaining(["/", "/plan", "/executive", "/team"]));
  });

  it("does not offer an auditor planning, which it could not do", () => {
    const menu = hrefs(["auditor"]);
    expect(menu).not.toContain("/plan");
    expect(menu).toContain("/team");
  });

  it("drops a heading left with nothing under it", () => {
    const headings = navFor(["inspector"]).map((g) => g.heading);
    expect(headings).toEqual(["The record"]);
  });

  it("shows everything when the roles could not be read, rather than nothing", () => {
    expect(hrefs(null)).toEqual(NAV_ITEMS.map((i) => i.href));
  });
});
