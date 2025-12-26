/**
 * Distractor Selection
 *
 * Utilities for generating plausible wrong answers for questions
 */

import { deterministicShuffle, createRng } from "./rng"
import { abMargin } from "./metrics"
import { EXCLUDED_PROTOCOL_CATEGORIES } from "./constants"

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
  /** TVL rank (1 = highest TVL). Used to filter out obscure protocols as distractors. */
  tvlRank?: number
}

/**
 * Chain entity for distractor selection
 */
export interface ChainEntity extends Entity {
  id: string
  slug: string
  name: string
  tvl: number
  /** TVL rank (1 = highest TVL). Used to filter out obscure chains as distractors. */
  tvlRank?: number
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
  /** 
   * Maximum TVL rank for distractors (e.g., 100 = only top 100 protocols).
   * This ensures distractors are recognizable protocols, not obscure ones.
   */
  maxTvlRank?: number
  /**
   * Prefer distractors near a specific rank (for more plausible wrong answers).
   * When set, distractors will be sorted by proximity to this rank before selection.
   */
  preferNearRank?: number
  /**
   * Categories to exclude from distractor candidates.
   * Used to filter out non-DeFi protocols (e.g., CEXs) from appearing as wrong answers.
   */
  excludeCategories?: readonly string[]
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
  let candidates = pool.filter((item) => {
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
    // Filter by maximum TVL rank to ensure recognizable distractors
    if (constraints.maxTvlRank !== undefined) {
      const rank = (item as unknown as ProtocolEntity).tvlRank
      if (rank !== undefined && rank > constraints.maxTvlRank) {
        return false
      }
    }
    // Exclude certain categories (e.g., CEXs are not DeFi)
    if (constraints.excludeCategories && constraints.excludeCategories.length > 0) {
      const category = (item as unknown as ProtocolEntity).category
      if (category && constraints.excludeCategories.includes(category)) {
        return false
      }
    }
    return true
  })

  // If preferNearRank is set, sort candidates by proximity to that rank
  // This makes wrong answers more plausible (similar-sized protocols)
  if (constraints.preferNearRank !== undefined) {
    const targetRank = constraints.preferNearRank
    candidates = candidates.sort((a, b) => {
      const rankA = (a as unknown as ProtocolEntity).tvlRank ?? 999
      const rankB = (b as unknown as ProtocolEntity).tvlRank ?? 999
      return Math.abs(rankA - targetRank) - Math.abs(rankB - targetRank)
    })
  }

  // Deterministic shuffle (but maintain some rank-proximity ordering if preferNearRank was set)
  // We shuffle within "buckets" of similar rank distance to maintain some determinism
  // while still preferring nearby protocols
  const shuffled = constraints.preferNearRank !== undefined
    ? shuffleWithRankPreference(candidates, constraints.preferNearRank, seed)
    : deterministicShuffle(candidates, seed.toString())

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
 * Shuffle candidates while preferring those near a target rank.
 * Divides candidates into tiers by rank distance and shuffles within each tier,
 * then concatenates tiers in order.
 */
function shuffleWithRankPreference<T extends Entity>(
  candidates: T[],
  targetRank: number,
  seed: number
): T[] {
  // Define tiers: very close (±10), close (±25), medium (±50), far (rest)
  const tiers: T[][] = [[], [], [], []]
  
  for (const item of candidates) {
    const rank = (item as unknown as ProtocolEntity).tvlRank ?? 999
    const distance = Math.abs(rank - targetRank)
    
    if (distance <= 10) tiers[0].push(item)
    else if (distance <= 25) tiers[1].push(item)
    else if (distance <= 50) tiers[2].push(item)
    else tiers[3].push(item)
  }
  
  // Shuffle each tier and concatenate
  const result: T[] = []
  for (let i = 0; i < tiers.length; i++) {
    const shuffledTier = deterministicShuffle(tiers[i], `${seed}:tier${i}`)
    result.push(...shuffledTier)
  }
  
  return result
}

/**
 * Pick protocol distractors with name display.
 *
 * By default, applies a maxTvlRank of 75 to ensure distractors are
 * recognizable protocols. Override with constraints.maxTvlRank if needed.
 *
 * @param correctSlug - Slug of the correct protocol
 * @param pool - Pool of protocol candidates
 * @param count - Number of distractors needed
 * @param seed - Seed for deterministic selection
 * @param constraints - Optional constraints (maxTvlRank defaults to 75)
 */
export function pickProtocolDistractors(
  correctSlug: string,
  pool: ProtocolEntity[],
  count: number,
  seed: number,
  constraints?: Partial<DistractorConstraints>
): string[] | null {
  const correct = pool.find((p) => p.slug === correctSlug)

  // Apply default constraints to ensure recognizable, DeFi-only distractors
  // Can be overridden via constraints
  const fullConstraints: DistractorConstraints = {
    count,
    maxTvlRank: 75, // Default: only top 75 protocols as distractors
    preferNearRank: correct?.tvlRank, // Prefer protocols of similar size
    excludeCategories: EXCLUDED_PROTOCOL_CATEGORIES, // Default: exclude CEXs
    ...constraints,
  }

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
 * Pick chain distractors with name display.
 *
 * By default, applies a maxTvlRank of 30 to ensure distractors are
 * recognizable chains. Override with constraints.maxTvlRank if needed.
 *
 * @param correctSlug - Slug of the correct chain
 * @param pool - Pool of chain candidates
 * @param count - Number of distractors needed
 * @param seed - Seed for deterministic selection
 * @param constraints - Optional constraints (maxTvlRank defaults to 30)
 */
export function pickChainDistractors(
  correctSlug: string,
  pool: ChainEntity[],
  count: number,
  seed: number,
  constraints?: Partial<DistractorConstraints>
): string[] | null {
  const correct = pool.find((c) => c.slug === correctSlug)

  // Apply default constraints to ensure recognizable chains as distractors
  // Can be overridden via constraints
  const fullConstraints: DistractorConstraints = {
    count,
    maxTvlRank: 30, // Default: only top 30 chains as distractors
    preferNearRank: correct?.tvlRank, // Prefer chains of similar size
    ...constraints,
  }

  const distractors = pickEntityDistractors(
    correctSlug,
    pool,
    fullConstraints,
    seed,
    correct?.tvl
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
 * @param historyStartMonth - Optional start of history range (YYYY-MM format). If provided, distractors come from full history.
 * @param historyEndMonth - Optional end of history range (YYYY-MM format). Defaults to current month.
 * @returns Object with choices array, answer index, and distractor months for explanations
 */
export function makeTimingDistractors(
  correctMonth: string,
  count: number,
  seed: number,
  historyStartMonth?: string,
  historyEndMonth?: string
): { choices: string[]; answerIndex: number; distractorMonths: string[] } {
  const candidates: string[] = []

  if (historyStartMonth) {
    // Use full history range for distractors (makes the question harder)
    const endMonth = historyEndMonth ?? getCurrentYYYYMM()
    const allMonths = generateMonthRange(historyStartMonth, endMonth)

    // Filter out the correct month and ensure we have enough candidates
    for (const month of allMonths) {
      if (month !== correctMonth) {
        candidates.push(month)
      }
    }
  } else {
    // Legacy behavior: generate adjacent months (+-1 to +-3 from correct)
    for (let offset = -3; offset <= 3; offset++) {
      if (offset === 0) continue
      candidates.push(addMonths(correctMonth, offset))
    }
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
 * Get current month in YYYY-MM format
 */
function getCurrentYYYYMM(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Generate all months between start and end (inclusive)
 */
function generateMonthRange(startYYYYMM: string, endYYYYMM: string): string[] {
  const months: string[] = []
  let current = startYYYYMM

  // Safety limit to prevent infinite loops
  const maxMonths = 240 // 20 years
  let count = 0

  while (current <= endYYYYMM && count < maxMonths) {
    months.push(current)
    current = addMonths(current, 1)
    count++
  }

  return months
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
