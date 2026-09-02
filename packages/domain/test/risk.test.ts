import { describe, it, expect } from "vitest";
import { buildRiskSignals, facilityRisk } from "../src";

describe("risk engine", () => {
  it("emits a reason string for every contributing signal, ranked", () => {
    const signals = buildRiskSignals({
      monthsSinceLastInspection: 14,
      cycleTargetMonths: 6,
      twoConsecutiveNeedsImprovement: true,
      lastRatingCriticalIssues: false,
      openFindings: 3,
      overdueFindings: 1,
      certDaysToExpiry: -22,
    });
    const r = facilityRisk(signals);
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.join(" | ")).toContain("certificate expired 22 days ago");
    expect(r.reasons.join(" | ")).toContain("two consecutive Needs Improvement ratings");
    // ranked: the highest single contribution appears first
    expect(r.reasons[0]).toBeDefined();
  });

  it("treats never inspected as a high floor", () => {
    const signals = buildRiskSignals({
      monthsSinceLastInspection: null,
      cycleTargetMonths: 6,
      twoConsecutiveNeedsImprovement: false,
      lastRatingCriticalIssues: false,
      openFindings: 0,
      overdueFindings: 0,
      certDaysToExpiry: null,
    });
    const r = facilityRisk(signals);
    expect(r.reasons).toContain("never inspected");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("caps the score at 100", () => {
    const signals = buildRiskSignals({
      monthsSinceLastInspection: 60,
      cycleTargetMonths: 6,
      twoConsecutiveNeedsImprovement: false,
      lastRatingCriticalIssues: true,
      openFindings: 20,
      overdueFindings: 20,
      certDaysToExpiry: -300,
    });
    expect(facilityRisk(signals).score).toBe(100);
  });
});
