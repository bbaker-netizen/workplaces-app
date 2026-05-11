/**
 * Methodology weighting — TTI TriMetrix HD differential weighting.
 *
 * Phase 4. Per CLAUDE.md "Methodology IP Exposure Rules":
 *   - Behaviours      40%
 *   - Driving Forces  35%
 *   - Competencies    25%
 *
 * INTERNAL USE ONLY. The weighted score is never rendered to clients.
 * Coaches see weighted fit scores during candidate review and gap
 * analysis; the client portal only ever shows raw category scores
 * (or no scores at all, depending on the role's audience).
 *
 * Inputs are 0–100 scores per category as TTI exports them. Output is
 * a single 0–100 weighted-fit score.
 */

export const WEIGHTING = {
  behaviours: 0.40,
  drivingForces: 0.35,
  competencies: 0.25,
} as const;

export type CategoryScores = {
  behaviours: number | null;
  drivingForces: number | null;
  competencies: number | null;
};

/**
 * Weighted fit score. Returns null if any required input is missing —
 * a partial score is misleading. Callers can choose to fall back to
 * the available categories rescaled, but the default is "show only
 * complete scores".
 */
export function weightedFitScore(scores: CategoryScores): number | null {
  if (
    scores.behaviours == null ||
    scores.drivingForces == null ||
    scores.competencies == null
  ) {
    return null;
  }
  const raw =
    scores.behaviours * WEIGHTING.behaviours +
    scores.drivingForces * WEIGHTING.drivingForces +
    scores.competencies * WEIGHTING.competencies;
  return Math.round(raw * 10) / 10;
}

/**
 * Rescaled fit when one category is missing. Less common — used when
 * a candidate has only completed two of the three TTI sections and
 * the Business Builder still wants a directional read. Tagged "partial" so the
 * caller can label it appropriately.
 */
export function partialWeightedFitScore(
  scores: CategoryScores,
): { score: number; missing: Array<keyof CategoryScores> } | null {
  const missing: Array<keyof CategoryScores> = [];
  let total = 0;
  let totalWeight = 0;
  if (scores.behaviours != null) {
    total += scores.behaviours * WEIGHTING.behaviours;
    totalWeight += WEIGHTING.behaviours;
  } else {
    missing.push("behaviours");
  }
  if (scores.drivingForces != null) {
    total += scores.drivingForces * WEIGHTING.drivingForces;
    totalWeight += WEIGHTING.drivingForces;
  } else {
    missing.push("drivingForces");
  }
  if (scores.competencies != null) {
    total += scores.competencies * WEIGHTING.competencies;
    totalWeight += WEIGHTING.competencies;
  } else {
    missing.push("competencies");
  }
  if (totalWeight === 0) return null;
  return {
    score: Math.round((total / totalWeight) * 10) / 10,
    missing,
  };
}

/**
 * Category band labels for UI rendering. Internal use only — the
 * thresholds themselves are part of the methodology.
 */
export function fitBand(score: number): "low" | "medium" | "high" | "exceptional" {
  if (score >= 85) return "exceptional";
  if (score >= 70) return "high";
  if (score >= 55) return "medium";
  return "low";
}
