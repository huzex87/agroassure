import { describe, expect, it } from "vitest";
import { eventLabel, periodDays, periodRange } from "../lib/activity";
import { EVENT_TYPES } from "@agroassure/domain";

describe("eventLabel", () => {
  it("has a plain name for every event the platform records", () => {
    for (const type of Object.values(EVENT_TYPES)) {
      expect(eventLabel(type)).not.toBe(type.replace(/([a-z])([A-Z])/g, "$1 $2"));
    }
  });

  it("splits an unknown type into words instead of hiding it", () => {
    expect(eventLabel("SomethingNewHappened")).toBe("Something New Happened");
  });
});

describe("periodDays", () => {
  it("offers 7, 30 and 90 days and falls back to 30", () => {
    expect([periodDays("7"), periodDays("90"), periodDays("30")]).toEqual([7, 90, 30]);
    for (const bad of [undefined, "", "14", "-1", "abc"]) expect(periodDays(bad)).toBe(30);
  });
});

describe("periodRange", () => {
  it("ends today and counts today as the last day", () => {
    const r = periodRange(7, new Date("2026-10-10T12:00:00Z"));
    expect(r).toEqual({ from: "2026-10-04", to: "2026-10-10" });
  });
});
