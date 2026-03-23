/**
 * Scoring weights and tier thresholds for AIWG eval
 */

export const DIMENSION_WEIGHTS: Record<string, number> = {
  'tool-use': 0.25,
  'instruction-following': 0.25,
  'coding': 0.20,
  'structured-output': 0.15,
  'reasoning': 0.10,
  'context-handling': 0.05,
};

export const TIER_THRESHOLDS = {
  opus: 90,
  sonnet: 70,
  haiku: 50,
} as const;

export function scoreTier(score: number): 'opus' | 'sonnet' | 'haiku' | 'not-recommended' {
  if (score >= TIER_THRESHOLDS.opus) return 'opus';
  if (score >= TIER_THRESHOLDS.sonnet) return 'sonnet';
  if (score >= TIER_THRESHOLDS.haiku) return 'haiku';
  return 'not-recommended';
}

export function calculateOverall(dimensionScores: Record<string, number>): number {
  let total = 0;
  let weightSum = 0;

  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    if (dimensionScores[dim] !== undefined) {
      total += dimensionScores[dim] * weight;
      weightSum += weight;
    }
  }

  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}
