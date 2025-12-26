/**
 * Difficulty Scoring System
 *
 * Computes difficulty scores for questions based on format, familiarity,
 * margin, volatility factors, and template-specific complexity bonuses.
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
 * 
 * Spread increased to ensure mc6/rank4 can reliably hit the hard band.
 * The gap between formats matters more than absolute values.
 */
export const FORMAT_FACTORS: Record<QuestionFormat, number> = {
  tf: 0.15,    // Reduced from 0.20 - true/false is easiest
  ab: 0.35,    // Reduced from 0.40 - binary choice is easy
  mc4: 0.55,   // Same - 4-choice is medium
  mc6: 0.75,   // Increased from 0.70 - 6-choice is harder
  rank4: 0.90, // Increased from 0.85 - ranking is hardest
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
 * Template-specific complexity bonuses
 * 
 * Some question types are inherently harder regardless of numeric margins.
 * ATH timing requires historical knowledge, precise rank requires exact knowledge, etc.
 * These bonuses help these templates hit the hard band more reliably.
 */
export const TEMPLATE_COMPLEXITY_BONUS: Record<string, number> = {
  // ATH timing questions require knowing historical data points
  "P4_ATH_TIMING": 0.10,
  "C3_ATH_TIMING": 0.10,
  // Precise rank requires exact knowledge of protocol rankings
  "P31_PRECISE_RANK": 0.08,
  // Multi-ranking requires comparing and ordering 3 protocols
  "P33_MULTI_RANKING": 0.10,
  // ATH distance requires knowing both current and ATH values
  "P20_ATH_DISTANCE": 0.06,
  "C9_DISTANCE_FROM_ATH": 0.06,
  // Exchange comparison requires knowing CEX/DEX landscape
  "P32_EXCHANGE_COMPARISON": 0.08,
  // Category growth requires knowing sector trends
  "P29_CATEGORY_GROWTH": 0.06,
  // Chain growth ranking requires knowing multiple chains' trends
  "C4_GROWTH_RANKING": 0.06,
}

/**
 * Difficulty target bands (min, max)
 * Bands overlap to allow flexibility in matching
 * 
 * Note: Hard band was relaxed to [0.34, 1.0] because:
 * - mc6 format with top_25 familiarity and high margin (>25%) scores ~0.34
 * - This ensures mc6 questions can hit hard difficulty for familiar topics
 * - The overlap with medium (0.30-0.55) is intentional for flexibility
 */
export const TARGET_BANDS: Record<DifficultyTarget, [number, number]> = {
  easy: [0.0, 0.38],
  medium: [0.30, 0.55],
  hard: [0.34, 1.0],
}

/**
 * Weight factors for difficulty calculation
 * 
 * Format is the primary driver (45%), margin affects comparison questions (30%).
 * Familiarity reduced to 15% since we already have template bonuses.
 */
const WEIGHTS = {
  format: 0.45,     // Increased from 0.40 - format is primary driver
  familiarity: 0.15, // Reduced from 0.20 - less impact
  margin: 0.30,     // Same - margin still matters for comparisons
  volatility: 0.10, // Same - volatility is minor factor
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Compute difficulty score from signals
 *
 * Score is a weighted combination of:
 * - Format factor (45%) - primary difficulty driver
 * - Familiarity factor (15%) - how well-known the topic is
 * - Margin factor (30%) - lower margin = harder
 * - Volatility factor (10%) - higher volatility = harder
 * 
 * Plus optional template complexity bonus for inherently harder question types.
 *
 * @param signals - The difficulty signals (format, familiarity, margin, volatility)
 * @param templateId - Optional template ID to apply complexity bonus
 * @returns Difficulty score in range [0, 1]
 */
export function computeDifficulty(signals: DifficultySignals, templateId?: string): number {
  // Format contribution
  const formatScore = FORMAT_FACTORS[signals.format]

  // Familiarity contribution
  const familiarityScore = FAMILIARITY_FACTORS[signals.familiarityRankBucket]

  // Margin contribution (lower margin = harder)
  // Margin of 0.25 (25%) or higher is considered easy (factor = 0)
  // Margin of 0 is hardest (factor = 1)
  const marginScore =
    signals.margin !== null
      ? Math.max(0, Math.min(1, 1 - signals.margin / 0.25))
      : 0.3 // Default to slightly above middle if no margin available

  // Volatility contribution (higher = harder, more unpredictable)
  const volatilityScore = signals.volatility ?? 0.25

  // Weighted sum
  let score =
    WEIGHTS.format * formatScore +
    WEIGHTS.familiarity * familiarityScore +
    WEIGHTS.margin * marginScore +
    WEIGHTS.volatility * volatilityScore

  // Apply template complexity bonus for inherently harder question types
  if (templateId && TEMPLATE_COMPLEXITY_BONUS[templateId]) {
    score += TEMPLATE_COMPLEXITY_BONUS[templateId]
  }

  // Clamp to [0, 1]
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
 * Estimate the difficulty target a score would fall into.
 * 
 * This uses non-overlapping thresholds for clear labeling:
 * - Easy: score < 0.30
 * - Medium: 0.30 <= score < 0.45
 * - Hard: score >= 0.45
 * 
 * Note: These thresholds differ from TARGET_BANDS which are used for
 * slot matching (where overlap is intentional for flexibility).
 * This function is for user-facing difficulty labels on questions.
 */
export function estimateTarget(score: number): DifficultyTarget {
  if (score < 0.30) return "easy"
  if (score < 0.45) return "medium"
  return "hard"
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
 * 
 * @param availableFormats - List of formats to try
 * @param target - Target difficulty level
 * @param baseSignals - Signals without format
 * @param templateId - Optional template ID for complexity bonus
 */
export function findBestFormat(
  availableFormats: QuestionFormat[],
  target: DifficultyTarget,
  baseSignals: Omit<DifficultySignals, "format">,
  templateId?: string
): QuestionFormat | null {
  let bestFormat: QuestionFormat | null = null
  let bestQuality = Infinity

  for (const format of availableFormats) {
    const signals: DifficultySignals = { ...baseSignals, format }
    const score = computeDifficulty(signals, templateId)
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
