/**
 * Difficulty Scoring System
 *
 * Computes difficulty scores for questions based on format, familiarity,
 * margin, and volatility factors.
 */

import type {
  DifficultySignals,
  DifficultyTarget,
  QuestionFormat,
  FamiliarityRankBucket,
} from "@/lib/types/episode"

// =============================================================================
// Constants
// =============================================================================

/**
 * Format difficulty factors
 * Higher values = harder questions
 */
export const FORMAT_FACTORS: Record<QuestionFormat, number> = {
  tf: 0.15,
  ab: 0.3,
  mc4: 0.45,
  mc6: 0.55,
  rank4: 0.7,
}

/**
 * Familiarity factors based on TVL rank
 * Lower rank = more familiar = easier
 */
export const FAMILIARITY_FACTORS: Record<FamiliarityRankBucket, number> = {
  top_10: 0.1,
  top_25: 0.18,
  top_100: 0.3,
  long_tail: 0.45,
}

/**
 * Difficulty target bands (min, max)
 * Bands overlap to allow flexibility in matching
 */
export const TARGET_BANDS: Record<DifficultyTarget, [number, number]> = {
  easy: [0.0, 0.38],
  medium: [0.3, 0.68],
  hard: [0.6, 1.0],
}

/**
 * Weight factors for difficulty calculation
 */
const WEIGHTS = {
  format: 0.35,
  familiarity: 0.25,
  margin: 0.25,
  volatility: 0.15,
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Compute difficulty score from signals
 *
 * Score is a weighted combination of:
 * - Format factor (35%)
 * - Familiarity factor (25%)
 * - Margin factor (25%) - lower margin = harder
 * - Volatility factor (15%) - higher volatility = harder
 *
 * @returns Difficulty score in range [0, 1]
 */
export function computeDifficulty(signals: DifficultySignals): number {
  // Format contribution
  const formatScore = FORMAT_FACTORS[signals.format]

  // Familiarity contribution
  const familiarityScore = FAMILIARITY_FACTORS[signals.familiarityRankBucket]

  // Margin contribution (lower margin = harder)
  // Margin of 0.30 (30%) or higher is considered easy (factor = 0)
  // Margin of 0 is hardest (factor = 1)
  const marginScore =
    signals.margin !== null
      ? Math.max(0, Math.min(1, 1 - signals.margin / 0.3))
      : 0.25 // Default to middle if no margin available

  // Volatility contribution (higher = harder, more unpredictable)
  const volatilityScore = signals.volatility ?? 0.25

  // Weighted sum, clamped to [0, 1]
  const score =
    WEIGHTS.format * formatScore +
    WEIGHTS.familiarity * familiarityScore +
    WEIGHTS.margin * marginScore +
    WEIGHTS.volatility * volatilityScore

  return Math.max(0, Math.min(1, score))
}

/**
 * Check if a difficulty score matches a target band
 */
export function matchesTarget(
  score: number,
  target: DifficultyTarget
): boolean {
  const [lo, hi] = TARGET_BANDS[target]
  return score >= lo && score <= hi
}

/**
 * Get the target band for a given target
 */
export function getTargetBand(
  target: DifficultyTarget
): [number, number] {
  return TARGET_BANDS[target]
}

/**
 * Determine familiarity bucket from TVL rank
 */
export function getRankBucket(rank: number): FamiliarityRankBucket {
  if (rank <= 10) return "top_10"
  if (rank <= 25) return "top_25"
  if (rank <= 100) return "top_100"
  return "long_tail"
}

/**
 * Estimate the difficulty target a score would fall into
 * Returns the best matching target, preferring more restrictive matches
 */
export function estimateTarget(score: number): DifficultyTarget {
  // Check in order of specificity
  if (score <= 0.35) return "easy"
  if (score >= 0.65) return "hard"
  return "medium"
}

/**
 * Calculate how well a score matches a target
 * Returns a value from 0 (perfect match) to 1 (far from target)
 */
export function targetMatchQuality(
  score: number,
  target: DifficultyTarget
): number {
  const [lo, hi] = TARGET_BANDS[target]
  const mid = (lo + hi) / 2

  if (score >= lo && score <= hi) {
    // Inside the band - measure distance from center
    return Math.abs(score - mid) / ((hi - lo) / 2) * 0.5
  } else {
    // Outside the band - measure distance from nearest edge
    const distFromBand = score < lo ? lo - score : score - hi
    return 0.5 + distFromBand
  }
}

/**
 * Find the format that would best match a target difficulty
 * given other signals
 */
export function findBestFormat(
  availableFormats: QuestionFormat[],
  target: DifficultyTarget,
  baseSignals: Omit<DifficultySignals, "format">
): QuestionFormat | null {
  let bestFormat: QuestionFormat | null = null
  let bestQuality = Infinity

  for (const format of availableFormats) {
    const signals: DifficultySignals = { ...baseSignals, format }
    const score = computeDifficulty(signals)
    const quality = targetMatchQuality(score, target)

    if (quality < bestQuality) {
      bestQuality = quality
      bestFormat = format
    }
  }

  return bestFormat
}

/**
 * Slot difficulty targets for episode structure
 * A: medium (hook)
 * B: easy (confidence builder)
 * C: medium (context)
 * D: hard (skill test)
 * E: easy (wrap-up)
 */
export const SLOT_TARGETS: Record<string, DifficultyTarget> = {
  A: "medium",
  B: "easy",
  C: "medium",
  D: "hard",
  E: "easy",
}

/**
 * Get the difficulty target for a slot
 */
export function getSlotTarget(slot: string): DifficultyTarget {
  return SLOT_TARGETS[slot] ?? "medium"
}
