import { describe, it, expect } from "vitest";
import { scoreInspection, DEFAULT_BANDS, type ScoredCheckpoint } from "../src";

function build(yes: number, no: number, na: number, weight = 1): ScoredCheckpoint[] {
  const cps: ScoredCheckpoint[] = [];
  for (let i = 0; i < yes; i++) cps.push({ weight, response: "yes" });
  for (let i = 0; i < no; i++) cps.push({ weight, response: "no" });
  for (let i = 0; i < na; i++) cps.push({ weight, response: "na" });
  return cps;
}

describe("scoring engine", () => {
  it("reproduces the concept note worked example: 32 Yes, 5 No, 4 N/A -> 86% Satisfactory", () => {
    const r = scoreInspection(build(32, 5, 4), [], DEFAULT_BANDS);
    expect(r.weightedAnswered).toBe(37); // 4 N/A excluded
    expect(r.weightedYes).toBe(32);
    expect(r.ratingPercent).toBeCloseTo(86.49, 2);
    expect(r.displayPercent).toBe(86);
    expect(r.band).toBe("satisfactory");
  });

  it("excludes N/A from both numerator and denominator", () => {
    const r = scoreInspection(build(1, 1, 8), []);
    expect(r.weightedAnswered).toBe(2);
    expect(r.ratingPercent).toBe(50);
  });

  it("honours checkpoint weights", () => {
    const cps: ScoredCheckpoint[] = [
      { weight: 3, response: "yes" },
      { weight: 1, response: "no" },
    ];
    const r = scoreInspection(cps, []);
    expect(r.ratingPercent).toBe(75); // 3 / 4
  });

  it("caps the band at Critical Issues when an open Critical finding exists", () => {
    const r = scoreInspection(build(40, 1, 0), [{ severity: "critical", open: true }]);
    expect(r.ratingPercent).toBeGreaterThan(95);
    expect(r.band).toBe("critical_issues");
  });

  it("caps the band at Needs Improvement when an open Major finding exists", () => {
    const r = scoreInspection(build(40, 1, 0), [{ severity: "major", open: true }]);
    expect(r.band).toBe("needs_improvement");
  });

  it("returns 0% and critical_issues when nothing is answerable", () => {
    const r = scoreInspection(build(0, 0, 5), []);
    expect(r.ratingPercent).toBe(0);
    expect(r.band).toBe("critical_issues");
  });
});
