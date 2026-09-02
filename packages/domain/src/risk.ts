// Explainable facility risk. Every automated suggestion carries a human-readable
// reason so a supervisor can disagree with the machine. The engine proposes;
// a human schedules.

export interface RiskSignal {
  points: number;
  reason: string;
}

export interface RiskResult {
  score: number; // 0..100
  reasons: string[]; // ranked, highest contribution first
}

export function facilityRisk(signals: RiskSignal[]): RiskResult {
  const contributing = signals
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points);
  const score = Math.min(
    100,
    contributing.reduce((sum, s) => sum + s.points, 0),
  );
  return { score, reasons: contributing.map((s) => s.reason) };
}

// Convenience builders for the standard signals (weights are configuration).
export interface RiskWeights {
  perMonthOverdue: number; // per month past the cycle target
  perMonthCap: number;
  twoNeedsImprovement: number;
  criticalIssues: number;
  perOpenFinding: number;
  perOverdueFinding: number;
  certExpiringSoon: number; // within 30 days
  certLapsed: number;
  neverInspected: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  perMonthOverdue: 1,
  perMonthCap: 12,
  twoNeedsImprovement: 25,
  criticalIssues: 40,
  perOpenFinding: 8,
  perOverdueFinding: 12,
  certExpiringSoon: 15,
  certLapsed: 30,
  neverInspected: 60,
};

export interface FacilityRiskInput {
  monthsSinceLastInspection: number | null; // null => never inspected
  cycleTargetMonths: number;
  twoConsecutiveNeedsImprovement: boolean;
  lastRatingCriticalIssues: boolean;
  openFindings: number;
  overdueFindings: number;
  certDaysToExpiry: number | null; // negative => lapsed; null => no cert
}

export function buildRiskSignals(
  input: FacilityRiskInput,
  w: RiskWeights = DEFAULT_RISK_WEIGHTS,
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  if (input.monthsSinceLastInspection === null) {
    signals.push({ points: w.neverInspected, reason: "never inspected" });
  } else {
    const over = Math.max(0, input.monthsSinceLastInspection - input.cycleTargetMonths);
    const pts = Math.min(w.perMonthCap, over * w.perMonthOverdue);
    if (pts > 0) {
      signals.push({
        points: pts,
        reason: `last inspected ${input.monthsSinceLastInspection} months ago`,
      });
    }
  }

  if (input.lastRatingCriticalIssues) {
    signals.push({ points: w.criticalIssues, reason: "last rating was Critical Issues" });
  } else if (input.twoConsecutiveNeedsImprovement) {
    signals.push({
      points: w.twoNeedsImprovement,
      reason: "two consecutive Needs Improvement ratings",
    });
  }

  if (input.openFindings > 0) {
    const overduePart =
      input.overdueFindings > 0
        ? `, ${input.overdueFindings} overdue`
        : "";
    signals.push({
      points:
        input.openFindings * w.perOpenFinding +
        input.overdueFindings * w.perOverdueFinding,
      reason: `${input.openFindings} open finding${input.openFindings === 1 ? "" : "s"}${overduePart}`,
    });
  }

  if (input.certDaysToExpiry !== null) {
    if (input.certDaysToExpiry < 0) {
      signals.push({
        points: w.certLapsed,
        reason: `certificate expired ${Math.abs(input.certDaysToExpiry)} days ago`,
      });
    } else if (input.certDaysToExpiry <= 30) {
      signals.push({
        points: w.certExpiringSoon,
        reason: `certificate expires in ${input.certDaysToExpiry} days`,
      });
    }
  }

  return signals;
}
