/**
 * Distractor Selection
 *
 * Utilities for generating plausible wrong answers for questions
 */

import { deterministicShuffle, createRng } from "./rng"
import { abMargin } from "./metrics"

// =============================================================================
// Types
// =============================================================================

/**
 * Generic entity with identifier
 */
export interface Entity {
  id: string
  [key: string]: unknown
}

/**
 * Protocol entity for distractor selection
 */
export interface ProtocolEntity extends Entity {
  id: string
  slug: string
  name: string
  category: string
  tvl: number
  chains?: string[]
}

/**
 * Chain entity for distractor selection
 */
export interface ChainEntity extends Entity {
  id: string
  slug: string
  name: string
  tvl: number
}

/**
 * Constraints for entity distractor selection
 */
export interface DistractorConstraints {
  /** Number of distractors needed */
  count: number
  /** Distractors should share these characteristics */
  mustMatch?: {
    category?: string
    tvlBand?: string
    chainCountBucket?: string
  }
  /** Distractors must differ in these ways */
  mustDiffer?: {
    /** Min TVL ratio difference (e.g., 0.5 means <50% or >200% of correct) */
    minTvlRatio?: number
  }
  /** IDs to exclude */
  avoid?: Set<string>
}

// =============================================================================
// Entity Distractors
// =============================================================================

/**
 * Check if an entity matches band constraints
 */
function matchesBands(
  item: Entity,
  constraints: NonNullable<DistractorConstraints["mustMatch"]>
): boolean {
  if (constraints.category) {
    const category = (item as ProtocolEntity).category
    if (category && category !== constraints.category) return false
  }
  // Additional band matching can be added here
  return true
}

/**
 * Check if an entity differs enough from the correct answer
 */
function differsEnough(
  item: Entity,
  correctTvl: number,
  constraints: NonNullable<DistractorConstraints["mustDiffer"]>
): boolean {
  if (constraints.minTvlRatio) {
    const itemTvl = (item as ProtocolEntity | ChainEntity).tvl
    if (itemTvl) {
      const margin = abMargin(itemTvl, correctTvl)
      if (margin !== null && margin < constraints.minTvlRatio) {
        return false
      }
    }
  }
  return true
}

/**
 * Check if adding an item would violate diversity constraints
 * (e.g., don't want all distractors from same category)
 */
function violatesDiversity(
  item: Entity,
  picked: Entity[],
  maxSameCategory: number = 2
): boolean {
  const category = (item as ProtocolEntity).category
  if (!category) return false

  const sameCategoryCount = picked.filter(
    (p) => (p as ProtocolEntity).category === category
  ).length

  return sameCategoryCount >= maxSameCategory
}

/**
 * Pick entity distractors from a pool
 *
 * @param correctId - ID of the correct answer to exclude
 * @param pool - Pool of candidate entities
 * @param constraints - Selection constraints
 * @param seed - Seed for deterministic selection
 * @param correctTvl - TVL of correct answer (for mustDiffer constraints)
 * @returns Array of distractor entities, or null if not enough found
 */
export function pickEntityDistractors<T extends Entity>(
  correctId: string,
  pool: T[],
  constraints: DistractorConstraints,
  seed: number,
  correctTvl?: number
): T[] | null {
  // Filter candidates
  const candidates = pool.filter((item) => {
    if (item.id === correctId) return false
    if (constraints.avoid?.has(item.id)) return false
    if (constraints.mustMatch && !matchesBands(item, constraints.mustMatch)) {
      return false
    }
    if (constraints.mustDiffer && correctTvl !== undefined) {
      if (!differsEnough(item, correctTvl, constraints.mustDiffer)) {
        return false
      }
    }
    return true
  })

  // Deterministic shuffle
  const shuffled = deterministicShuffle(candidates, seed.toString())

  // Pick with diversity constraints
  const picked: T[] = []
  for (const item of shuffled) {
    if (!violatesDiversity(item, picked)) {
      picked.push(item)
      if (picked.length === constraints.count) break
    }
  }

  return picked.length === constraints.count ? picked : null
}

/**
 * Pick protocol distractors with name display
 */
export function pickProtocolDistractors(
  correctSlug: string,
  pool: ProtocolEntity[],
  count: number,
  seed: number,
  constraints?: Partial<DistractorConstraints>
): string[] | null {
  const fullConstraints: DistractorConstraints = {
    count,
    ...constraints,
  }

  const correct = pool.find((p) => p.slug === correctSlug)
  const distractors = pickEntityDistractors(
    correctSlug,
    pool,
    fullConstraints,
    seed,
    correct?.tvl
  )

  return distractors?.map((d) => d.name) ?? null
}

/**
 * Pick chain distractors with name display
 */
export function pickChainDistractors(
  correctSlug: string,
  pool: ChainEntity[],
  count: number,
  seed: number
): string[] | null {
  const distractors = pickEntityDistractors(
    correctSlug,
    pool,
    { count },
    seed
  )

  return distractors?.map((d) => d.name) ?? null
}

// =============================================================================
// Numeric Distractors
// =============================================================================

/**
 * Format a large number for display
 */
export function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

/**
 * Make numeric choices for MC questions
 *
 * @param correctValue - The correct numeric value
 * @param nearbyValues - Other values to consider as distractors
 * @param mode - "mc4" for specific values, "buckets" for value ranges
 * @param seed - Seed for deterministic shuffling
 * @returns Array of formatted choice strings with correct answer included
 */
export function makeNumericChoices(
  correctValue: number,
  nearbyValues: number[],
  mode: "mc4" | "buckets",
  seed: number
): { choices: string[]; answerIndex: number } | null {
  if (mode === "buckets") {
    // Fixed ratio buckets around correct value
    const buckets = [
      `< ${formatNumber(correctValue * 0.5)}`,
      `${formatNumber(correctValue * 0.5)} - ${formatNumber(correctValue * 0.8)}`,
      `${formatNumber(correctValue * 0.8)} - ${formatNumber(correctValue * 1.2)}`,
      `> ${formatNumber(correctValue * 1.2)}`,
    ]
    // Correct answer is in the middle bucket (80-120%)
    return { choices: buckets, answerIndex: 2 }
  }

  // MC4: pick 3 distractor values with sufficient separation
  const candidates = nearbyValues.filter((v) => {
    if (v <= 0) return false
    const margin = abMargin(v, correctValue)
    return margin !== null && margin >= 0.12 // At least 12% different
  })

  if (candidates.length < 3) return null

  const rng = createRng(seed)
  const shuffledCandidates = [...candidates].sort(() => rng() - 0.5)
  const picks = shuffledCandidates.slice(0, 3)

  // All choices including correct answer
  const allValues = [correctValue, ...picks]

  // Shuffle final order
  const shuffledFinal = deterministicShuffle(
    allValues.map((v, i) => ({ v, isCorrect: i === 0 })),
    `${seed}:order`
  )

  const choices = shuffledFinal.map((x) => formatNumber(x.v))
  const answerIndex = shuffledFinal.findIndex((x) => x.isCorrect)

  return { choices, answerIndex }
}

// =============================================================================
// Timing Distractors
// =============================================================================

/**
 * Add months to a YYYY-MM string
 */
function addMonths(yyyyMm: string, offset: number): string {
  const [yearStr, monthStr] = yyyyMm.split("-")
  let year = parseInt(yearStr)
  let month = parseInt(monthStr) - 1 + offset // 0-indexed

  while (month < 0) {
    month += 12
    year -= 1
  }
  while (month >= 12) {
    month -= 12
    year += 1
  }

  return `${year}-${String(month + 1).padStart(2, "0")}`
}

/**
 * Format YYYY-MM as display string (e.g., "Mar 2024")
 */
export function formatMonthDisplay(yyyyMm: string): string {
  const [yearStr, monthStr] = yyyyMm.split("-")
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  const monthIdx = parseInt(monthStr) - 1
  return `${months[monthIdx]} ${yearStr}`
}

/**
 * Make timing distractors for ATH questions
 *
 * @param correctMonth - Correct month in YYYY-MM format
 * @param count - Number of distractors needed
 * @param seed - Seed for deterministic selection
 * @returns Object with choices array, answer index, and distractor months for explanations
 */
export function makeTimingDistractors(
  correctMonth: string,
  count: number,
  seed: number
): { choices: string[]; answerIndex: number; distractorMonths: string[] } {
  // Generate adjacent months (+-1 to +-3 from correct)
  const candidates: string[] = []
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue
    candidates.push(addMonths(correctMonth, offset))
  }

  // Deterministically select distractors
  const shuffled = deterministicShuffle(candidates, seed.toString())
  const distractors = shuffled.slice(0, count)
  
  // Store formatted distractor months for explanations
  const distractorMonths = distractors.map((m) => formatMonthDisplay(m))

  // Combine with correct answer
  const allMonths = [correctMonth, ...distractors]

  // Shuffle for final order
  const shuffledFinal = deterministicShuffle(
    allMonths.map((m, i) => ({ m, isCorrect: i === 0 })),
    `${seed}:order`
  )

  const choices = shuffledFinal.map((x) => formatMonthDisplay(x.m))
  const answerIndex = shuffledFinal.findIndex((x) => x.isCorrect)

  return { choices, answerIndex, distractorMonths }
}

/**
 * Make quarter distractors for ATH questions
 */
export function makeQuarterDistractors(
  correctQuarter: string, // e.g., "Q1 2024"
  count: number,
  seed: number
): { choices: string[]; answerIndex: number } {
  // Parse quarter
  const match = correctQuarter.match(/Q(\d) (\d{4})/)
  if (!match) {
    return { choices: [correctQuarter], answerIndex: 0 }
  }

  let q = parseInt(match[1])
  let year = parseInt(match[2])

  // Generate adjacent quarters
  const candidates: string[] = []
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue

    let newQ = q + offset
    let newYear = year

    while (newQ < 1) {
      newQ += 4
      newYear -= 1
    }
    while (newQ > 4) {
      newQ -= 4
      newYear += 1
    }

    candidates.push(`Q${newQ} ${newYear}`)
  }

  const shuffled = deterministicShuffle(candidates, seed.toString())
  const distractors = shuffled.slice(0, count)

  const allQuarters = [correctQuarter, ...distractors]
  const shuffledFinal = deterministicShuffle(
    allQuarters.map((q, i) => ({ q, isCorrect: i === 0 })),
    `${seed}:order`
  )

  const choices = shuffledFinal.map((x) => x.q)
  const answerIndex = shuffledFinal.findIndex((x) => x.isCorrect)

  return { choices, answerIndex }
}

// =============================================================================
// Bucket Distractors
// =============================================================================

/**
 * Get bucket choices for concentration questions
 */
export function getConcentrationBucketChoices(): string[] {
  return ["<25%", "25-50%", "50-75%", ">75%"]
}

/**
 * Get the answer index for a concentration value
 */
export function getConcentrationBucketIndex(share: number): number {
  if (share >= 0.75) return 3
  if (share >= 0.5) return 2
  if (share >= 0.25) return 1
  return 0
}

/**
 * Get bucket choices for revenue ratio questions
 */
export function getRevenueBucketChoices(): string[] {
  return ["<10%", "10-30%", "30-60%", ">60%"]
}

/**
 * Get the answer index for a revenue ratio value
 */
export function getRevenueBucketIndex(ratio: number): number {
  if (ratio >= 0.6) return 3
  if (ratio >= 0.3) return 2
  if (ratio >= 0.1) return 1
  return 0
}

/**
 * Get bucket choices for change percentage questions
 */
export function getChangeBucketChoices(): string[] {
  return ["Down >10%", "Down 1-10%", "Roughly flat", "Up 1-10%", "Up >10%"]
}

/**
 * Get the answer index for a change percentage
 */
export function getChangeBucketIndex(change: number): number {
  if (change > 0.1) return 4
  if (change > 0.01) return 3
  if (change >= -0.01) return 2
  if (change >= -0.1) return 1
  return 0
}
