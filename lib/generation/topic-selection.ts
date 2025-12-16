/**
 * Topic Selection Algorithm
 * 
 * Selects quiz topics using weighted random sampling with cooldown penalties
 * to ensure variety while favoring higher-quality topics.
 */

import { readFile } from "fs/promises"
import { existsSync } from "fs"
import type { ProtocolPoolEntry, ChainPoolEntry } from "@/lib/types/pools"
import { seedFromParts, createRng, weightedRandomPick } from "./rng"

// Pool file paths
const PROTOCOL_POOL_PATH = "./data/pools/protocols.json"
const CHAIN_POOL_PATH = "./data/pools/chains.json"

// Cooldown configuration
const PROTOCOL_COOLDOWN_DAYS = 14
const CHAIN_COOLDOWN_DAYS = 10

// Episode type by day of week (0 = Sunday)
const EPISODE_SCHEDULE: Record<number, "protocol" | "chain"> = {
  0: "protocol", // Sunday
  1: "protocol", // Monday
  2: "chain", // Tuesday
  3: "protocol", // Wednesday
  4: "chain", // Thursday
  5: "protocol", // Friday
  6: "chain", // Saturday
}

export type EpisodeType = "protocol" | "chain"

/**
 * Topic type - either a protocol or chain pool entry
 */
export type Topic = ProtocolPoolEntry | ChainPoolEntry

/**
 * Type guard to check if topic is a protocol
 */
export function isProtocolTopic(topic: Topic): topic is ProtocolPoolEntry {
  return "category" in topic && "chains" in topic
}

/**
 * Type guard to check if topic is a chain
 */
export function isChainTopic(topic: Topic): topic is ChainPoolEntry {
  return "protocolCount" in topic
}

/**
 * Get episode type for a given date
 */
export function getEpisodeType(date: string): EpisodeType {
  const d = new Date(date)
  const dayOfWeek = d.getUTCDay()
  return EPISODE_SCHEDULE[dayOfWeek]
}

/**
 * Load protocol pool from JSON file
 */
export async function loadProtocolPool(): Promise<ProtocolPoolEntry[]> {
  if (!existsSync(PROTOCOL_POOL_PATH)) {
    throw new Error(`Protocol pool not found at ${PROTOCOL_POOL_PATH}`)
  }
  const content = await readFile(PROTOCOL_POOL_PATH, "utf-8")
  const data = JSON.parse(content)
  return data.protocols as ProtocolPoolEntry[]
}

/**
 * Load chain pool from JSON file
 */
export async function loadChainPool(): Promise<ChainPoolEntry[]> {
  if (!existsSync(CHAIN_POOL_PATH)) {
    throw new Error(`Chain pool not found at ${CHAIN_POOL_PATH}`)
  }
  const content = await readFile(CHAIN_POOL_PATH, "utf-8")
  const data = JSON.parse(content)
  return data.chains as ChainPoolEntry[]
}

/**
 * Calculate TVL rank score (higher rank = higher score)
 * Top 10 = 1.0, rank 100 = 0.1
 */
function tvlRankToScore(rank: number): number {
  return Math.max(0.1, 1 - (rank - 1) / 100)
}

/**
 * Calculate data quality score for a protocol
 * 
 * Multi-chain protocols score higher because they enable more diverse questions:
 * - Cross-chain comparison (P2)
 * - Top chain concentration (P3) 
 * - Top chain name (P9)
 * 
 * Single-chain protocols are penalized because they limit question variety.
 */
function protocolDataQualityScore(protocol: ProtocolPoolEntry): number {
  let score = 0

  // Has fees data: +0.20
  if (protocol.hasFeesData) score += 0.20

  // Has 90+ days TVL history: +0.20
  if (protocol.historyDays >= 90) score += 0.20

  // Chain count scoring (scaled to reward multi-chain)
  // Single chain: +0.05 (penalty - limits question variety)
  // 2-3 chains: +0.20 (enables cross-chain questions)
  // 4+ chains: +0.30 (best for question variety)
  if (protocol.chains.length >= 4) {
    score += 0.30
  } else if (protocol.chains.length >= 2) {
    score += 0.20
  } else {
    score += 0.05 // Single-chain penalty
  }

  // Has revenue data: +0.15
  if (protocol.hasRevenueData) score += 0.15

  // Has volume data (for DEXes): +0.15
  if (protocol.hasVolumeData) score += 0.15

  return Math.min(1, score)
}

/**
 * Calculate data quality score for a chain
 */
function chainDataQualityScore(chain: ChainPoolEntry): number {
  let score = 0

  // Has 90+ days history: +0.35
  if (chain.historyDays >= 90) score += 0.35

  // Has 50+ protocols: +0.35
  if (chain.protocolCount >= 50) score += 0.35

  // Has token symbol (identifiable): +0.15
  if (chain.tokenSymbol) score += 0.15

  // High TVL (top 10): +0.15
  if (chain.tvlRank <= 10) score += 0.15

  return Math.min(1, score)
}

/**
 * Calculate diversity bonus based on category representation
 * For simplicity, this returns a small random bonus
 * In a full implementation, this would track recent episode categories
 */
function categoryDiversityBonus(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _topic: Topic,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _recentCategories: string[]
): number {
  // TODO: In full implementation, check if topic's category
  // hasn't appeared in last 5 episodes of that type
  // For now, return a neutral value
  return 0.15
}

/**
 * Compute base weight for a protocol topic
 */
function computeProtocolWeight(
  protocol: ProtocolPoolEntry,
  recentCategories: string[] = []
): number {
  const tvlScore = tvlRankToScore(protocol.tvlRank)
  const qualityScore = protocolDataQualityScore(protocol)
  const diversityBonus = categoryDiversityBonus(protocol, recentCategories)

  // Weighted combination: 40% TVL, 30% quality, 30% diversity
  return 0.4 * tvlScore + 0.3 * qualityScore + 0.3 * (1 + diversityBonus)
}

/**
 * Compute base weight for a chain topic
 */
function computeChainWeight(
  chain: ChainPoolEntry,
  recentCategories: string[] = []
): number {
  const tvlScore = tvlRankToScore(chain.tvlRank)
  const qualityScore = chainDataQualityScore(chain)
  const diversityBonus = categoryDiversityBonus(chain, recentCategories)

  return 0.4 * tvlScore + 0.3 * qualityScore + 0.3 * (1 + diversityBonus)
}

/**
 * Get dates in the same week as the given date
 * Returns array of YYYY-MM-DD strings
 */
function getDatesInSameWeek(date: string): string[] {
  const d = new Date(date)
  const dayOfWeek = d.getUTCDay()
  const dates: string[] = []

  // Get Sunday of this week
  const sunday = new Date(d)
  sunday.setUTCDate(d.getUTCDate() - dayOfWeek)

  // Get all days from Sunday up to (but not including) the current day
  for (let i = 0; i < dayOfWeek; i++) {
    const current = new Date(sunday)
    current.setUTCDate(sunday.getUTCDate() + i)
    dates.push(current.toISOString().split("T")[0])
  }

  return dates
}

/**
 * Get dates in the last N days (not including the current date)
 */
function getDatesInLastNDays(date: string, days: number): string[] {
  const d = new Date(date)
  const dates: string[] = []

  for (let i = 1; i <= days; i++) {
    const past = new Date(d)
    past.setUTCDate(d.getUTCDate() - i)
    dates.push(past.toISOString().split("T")[0])
  }

  return dates
}

/**
 * Get topics that were used in given dates for protocols
 */
function getProtocolTopicsFromDates(
  dates: string[],
  pool: ProtocolPoolEntry[]
): Set<string> {
  const usedSlugs = new Set<string>()

  for (const pastDate of dates) {
    // Only process dates that match protocol episode type
    if (getEpisodeType(pastDate) !== "protocol") {
      continue
    }

    // Deterministically select the topic for that date
    const seed = seedFromParts(pastDate, "protocol")
    const rng = createRng(seed)

    // Simple uniform selection for determining past topics
    const weights = pool.map(() => 1)
    const selected = weightedRandomPick(pool, weights, rng)
    if (selected) {
      usedSlugs.add(selected.slug)
    }
  }

  return usedSlugs
}

/**
 * Get topics that were used in given dates for chains
 */
function getChainTopicsFromDates(
  dates: string[],
  pool: ChainPoolEntry[]
): Set<string> {
  const usedSlugs = new Set<string>()

  for (const pastDate of dates) {
    // Only process dates that match chain episode type
    if (getEpisodeType(pastDate) !== "chain") {
      continue
    }

    // Deterministically select the topic for that date
    const seed = seedFromParts(pastDate, "chain")
    const rng = createRng(seed)

    // Simple uniform selection for determining past topics
    const weights = pool.map(() => 1)
    const selected = weightedRandomPick(pool, weights, rng)
    if (selected) {
      usedSlugs.add(selected.slug)
    }
  }

  return usedSlugs
}

/**
 * Select a protocol topic for a given date
 */
export async function selectProtocolTopic(
  date: string
): Promise<ProtocolPoolEntry> {
  const pool = await loadProtocolPool()

  if (pool.length === 0) {
    throw new Error("No topics available in protocol pool")
  }

  // Create deterministic RNG from date
  const seed = seedFromParts(date, "protocol")
  const rng = createRng(seed)

  // Compute base weights
  const baseWeights = pool.map((protocol) => computeProtocolWeight(protocol))

  // Get recently used topics for cooldown
  const recentDates = getDatesInLastNDays(date, PROTOCOL_COOLDOWN_DAYS)
  const recentTopics = getProtocolTopicsFromDates(recentDates, pool)

  // Apply cooldown penalty (90% reduction)
  const cooldownWeights = baseWeights.map((w, i) =>
    recentTopics.has(pool[i].slug) ? w * 0.1 : w
  )

  // Get topics used this week for hard constraint
  const weekDates = getDatesInSameWeek(date)
  const thisWeekTopics = getProtocolTopicsFromDates(weekDates, pool)

  // Hard constraint: zero weight for topics used this week
  const finalWeights = cooldownWeights.map((w, i) =>
    thisWeekTopics.has(pool[i].slug) ? 0 : w
  )

  // Check if any topics are available
  const totalWeight = finalWeights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) {
    console.warn("All protocol topics exhausted for week, using fallback")
    return pool[0]
  }

  // Weighted random selection
  const selected = weightedRandomPick(pool, finalWeights, rng)
  if (!selected) {
    throw new Error("Failed to select protocol topic from pool")
  }

  return selected
}

/**
 * Select a chain topic for a given date
 */
export async function selectChainTopic(date: string): Promise<ChainPoolEntry> {
  const pool = await loadChainPool()

  if (pool.length === 0) {
    throw new Error("No topics available in chain pool")
  }

  // Create deterministic RNG from date
  const seed = seedFromParts(date, "chain")
  const rng = createRng(seed)

  // Compute base weights
  const baseWeights = pool.map((chain) => computeChainWeight(chain))

  // Get recently used topics for cooldown
  const recentDates = getDatesInLastNDays(date, CHAIN_COOLDOWN_DAYS)
  const recentTopics = getChainTopicsFromDates(recentDates, pool)

  // Apply cooldown penalty (90% reduction)
  const cooldownWeights = baseWeights.map((w, i) =>
    recentTopics.has(pool[i].slug) ? w * 0.1 : w
  )

  // Get topics used this week for hard constraint
  const weekDates = getDatesInSameWeek(date)
  const thisWeekTopics = getChainTopicsFromDates(weekDates, pool)

  // Hard constraint: zero weight for topics used this week
  const finalWeights = cooldownWeights.map((w, i) =>
    thisWeekTopics.has(pool[i].slug) ? 0 : w
  )

  // Check if any topics are available
  const totalWeight = finalWeights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) {
    console.warn("All chain topics exhausted for week, using fallback")
    return pool[0]
  }

  // Weighted random selection
  const selected = weightedRandomPick(pool, finalWeights, rng)
  if (!selected) {
    throw new Error("Failed to select chain topic from pool")
  }

  return selected
}

/**
 * Select a topic for a given date and episode type
 * This is the main entry point for topic selection
 */
export async function selectTopic(
  date: string,
  type: EpisodeType
): Promise<Topic> {
  if (type === "protocol") {
    return selectProtocolTopic(date)
  } else {
    return selectChainTopic(date)
  }
}

/**
 * Get the topic that would be selected for a given date
 * Convenience function that determines episode type automatically
 */
export async function getTopicForDate(date: string): Promise<Topic> {
  const type = getEpisodeType(date)
  return selectTopic(date, type)
}
