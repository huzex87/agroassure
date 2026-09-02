import type { CheckpointResponse, FindingSeverity, RatingBand } from "./types";

// Deterministic weighted scoring. N/A responses are excluded from both the
// numerator and the denominator, because an N/A means the checked thing does
// not exist at the site. A worked example (32 Yes, 5 No, 4 N/A) yields
// 32 / 37 = 86.49% -> displayed 86%, Satisfactory, matching the concept note.

export interface ScoredCheckpoint {
  weight: number;
  response: CheckpointResponse;
}

export interface RatingBands {
  satisfactoryMin: number; // e.g. 80
  needsImprovementMin: number; // e.g. 60
}

export interface FindingLike {
  severity: FindingSeverity;
  open: boolean;
}

export interface RatingResult {
  ratingPercent: number; // rounded to 2 dp
  displayPercent: number; // whole percent for UI
  band: RatingBand;
  weightedYes: number;
  weightedAnswered: number;
}

export const DEFAULT_BANDS: RatingBands = {
  satisfactoryMin: 80,
  needsImprovementMin: 60,
};

export function scoreInspection(
  checkpoints: ScoredCheckpoint[],
  findings: FindingLike[],
  bands: RatingBands = DEFAULT_BANDS,
): RatingResult {
  let weightedYes = 0;
  let weightedAnswered = 0;

  for (const c of checkpoints) {
    if (c.response === "na") continue; // N/A excluded from both sides
    weightedAnswered += c.weight;
    if (c.response === "yes") weightedYes += c.weight;
  }

  const ratingPercent =
    weightedAnswered === 0
      ? 0
      : Math.round((10000 * weightedYes) / weightedAnswered) / 100;
  const displayPercent = Math.round(ratingPercent);

  const hasOpenCritical = findings.some((f) => f.open && f.severity === "critical");
  const hasOpenMajor = findings.some((f) => f.open && f.severity === "major");

  let band: RatingBand;
  if (hasOpenCritical || ratingPercent < bands.needsImprovementMin) {
    band = "critical_issues";
  } else if (hasOpenMajor || ratingPercent < bands.satisfactoryMin) {
    band = "needs_improvement";
  } else {
    band = "satisfactory";
  }

  return { ratingPercent, displayPercent, band, weightedYes, weightedAnswered };
}
