import { describe, expect, it } from "vitest";
import { destinationsFor, matchDestinations } from "../lib/quick-find";

describe("destinationsFor", () => {
  it("offers a desk supervisor the pages they may open, and not the Team page", () => {
    const hrefs = destinationsFor(["desk_supervisor"]).map((d) => d.href);
    expect(hrefs).toContain("/plan");
    expect(hrefs).toContain("/instruments");
    expect(hrefs).not.toContain("/team");
  });

  it("offers an administrator the Team page", () => {
    expect(destinationsFor(["state_admin"]).map((d) => d.href)).toContain("/team");
  });

  it("shows everything when the roles could not be read", () => {
    expect(destinationsFor(null).map((d) => d.href)).toContain("/team");
  });
});

describe("matchDestinations", () => {
  const all = destinationsFor(["state_admin"]);

  it("keeps everything for an empty query", () => {
    expect(matchDestinations(all, "  ")).toHaveLength(all.length);
  });

  it("matches a label, whatever the case", () => {
    expect(matchDestinations(all, "CHECKLIST").map((d) => d.href)).toEqual(["/instruments"]);
  });

  it("matches the hint too, and needs every word", () => {
    expect(matchDestinations(all, "sign out phone").map((d) => d.href)).toEqual(["/team"]);
    expect(matchDestinations(all, "team spreadsheet")).toEqual([]);
  });
});

describe("System status", () => {
  it("is offered to administrators only", () => {
    expect(destinationsFor(["state_admin"]).map((d) => d.href)).toContain("/settings/status");
    expect(destinationsFor(["desk_supervisor"]).map((d) => d.href)).not.toContain("/settings/status");
  });
});
