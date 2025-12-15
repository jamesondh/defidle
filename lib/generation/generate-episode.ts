/**
 * Episode Generation Engine
 *
 * Main entry point for generating complete episodes.
 * Handles data fetching, question selection, episode assembly, and LLM text generation.
 */

import type {
  Episode,
  FetchedData,
  DerivedMetrics,
  TemplateContext,
} from "@/lib/types/episode"
import type { ProtocolPoolEntry, ChainPoolEntry, ChainPool } from "@/lib/types/pools"

import {
  getProtocol,
  getProtocols,
  getProtocolFees,
  getChains,
  getChainTVLHistory,
  getChainFees,
  getChainDEXVolume,
} from "@/lib/api/defillama"

import { readFile } from "fs/promises"

import {
  selectTopic,
  getEpisodeType,
  isProtocolTopic,
} from "./topic-selection"

import { getTemplateMatrix } from "./templates"
import { seedFromParts } from "./rng"
import { getSlots } from "./schedule"
import { selectAllQuestions } from "./slot-selection"
import { postBalancePass } from "./post-balance"
import {
  percentChangeFromTvlHistory,
  percentChangeFromChainHistory,
  volatilityFromTvlHistory,
  findAthFromTvlHistory,
  findAthFromChainHistory,
  formatMonth,
} from "./metrics"
import { getRankBucket, computeDifficulty } from "./difficulty"
import {
  generateAllQuestionText,
  checkLLMReady,
  type TextGenerationOptions,
} from "@/lib/llm/text"

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * Fetch all data needed for a protocol episode
 */
async function fetchProtocolData(
  topic: ProtocolPoolEntry
): Promise<FetchedData | null> {
  try {
    // Fetch protocol detail and list in parallel
    const [protocolDetail, protocolList] = await Promise.all([
      getProtocol(topic.slug),
      getProtocols(),
    ])

    if (!protocolDetail) {
      console.error(`Failed to fetch protocol detail for ${topic.slug}`)
      return null
    }

    const data: FetchedData = {
      protocolDetail,
      protocolList,
    }

    // Try to fetch fees data if available
    if (topic.hasFeesData) {
      try {
        const [feesData, revenueData] = await Promise.all([
          getProtocolFees(topic.slug, "dailyFees"),
          getProtocolFees(topic.slug, "dailyRevenue"),
        ])
        data.protocolFees = feesData
        data.protocolRevenue = revenueData
      } catch {
        console.warn(`Could not fetch fees data for ${topic.slug}`)
      }
    }

    return data
  } catch (error) {
    console.error(`Error fetching protocol data:`, error)
    return null
  }
}

/**
 * Load chain pool from static JSON file
 */
async function loadChainPool(): Promise<ChainPoolEntry[]> {
  try {
    const content = await readFile("./data/pools/chains.json", "utf-8")
    const pool = JSON.parse(content) as ChainPool
    return pool.chains
  } catch (error) {
    console.warn("Could not load chain pool:", error)
    return []
  }
}

/**
 * Fetch all data needed for a chain episode
 */
async function fetchChainData(
  topic: ChainPoolEntry
): Promise<FetchedData | null> {
  try {
    // Fetch chain list, history, and pool in parallel
    const [chainList, chainHistory, chainPool] = await Promise.all([
      getChains(),
      getChainTVLHistory(topic.slug),
      loadChainPool(),
    ])

    if (!chainHistory || chainHistory.length === 0) {
      console.error(`Failed to fetch chain history for ${topic.slug}`)
      return null
    }

    const data: FetchedData = {
      chainList,
      chainHistory,
      chainPool,
    }

    // Try to fetch chain fees and DEX volume
    try {
      const [chainFees, chainDexVolume] = await Promise.all([
        getChainFees(topic.slug),
        getChainDEXVolume(topic.slug),
      ])
      data.chainFees = chainFees
      data.chainDexVolume = chainDexVolume
    } catch {
      console.warn(`Could not fetch fees/dex data for chain ${topic.slug}`)
    }

    return data
  } catch (error) {
    console.error(`Error fetching chain data:`, error)
    return null
  }
}

// =============================================================================
// Derived Metrics Computation
// =============================================================================

/**
 * Compute derived metrics for a protocol episode
 */
function computeProtocolMetrics(
  topic: ProtocolPoolEntry,
  data: FetchedData
): DerivedMetrics {
  const metrics: DerivedMetrics = {}
  const detail = data.protocolDetail

  if (!detail) return metrics

  // TVL rank and bucket
  metrics.tvlRank = topic.tvlRank
  metrics.tvlRankBucket = getRankBucket(topic.tvlRank)

  // TVL band
  const currentTvl =
    detail.tvl?.[detail.tvl.length - 1]?.totalLiquidityUSD ?? topic.tvl
  if (currentTvl >= 10_000_000_000) metrics.tvlBand = "$10B+"
  else if (currentTvl >= 1_000_000_000) metrics.tvlBand = "$1B-$10B"
  else if (currentTvl >= 100_000_000) metrics.tvlBand = "$100M-$1B"
  else metrics.tvlBand = "<$100M"

  // Chain metrics
  metrics.chainCount = detail.chains?.length ?? 0
  if (metrics.chainCount === 1) metrics.chainCountBucket = "single-chain"
  else if (metrics.chainCount <= 5) metrics.chainCountBucket = "2-5 chains"
  else if (metrics.chainCount <= 10) metrics.chainCountBucket = "6-10 chains"
  else metrics.chainCountBucket = "10+ chains"

  // TVL changes
  if (detail.tvl && detail.tvl.length > 0) {
    metrics.change7d = percentChangeFromTvlHistory(detail.tvl, 7) ?? undefined
    metrics.change30d = percentChangeFromTvlHistory(detail.tvl, 30) ?? undefined
    metrics.tvlVolatility = volatilityFromTvlHistory(detail.tvl, 30) ?? undefined

    // ATH
    const ath = findAthFromTvlHistory(detail.tvl)
    if (ath) {
      metrics.athValue = ath.value
      metrics.athDate = ath.ts
      metrics.athMonth = formatMonth(ath.ts)
    }
  }

  // Change bucket
  if (metrics.change7d !== undefined && metrics.change7d !== null) {
    if (metrics.change7d > 0.1) metrics.changeBucket = "up >10%"
    else if (metrics.change7d > 0.01) metrics.changeBucket = "up 1-10%"
    else if (metrics.change7d >= -0.01) metrics.changeBucket = "roughly flat"
    else if (metrics.change7d >= -0.1) metrics.changeBucket = "down 1-10%"
    else metrics.changeBucket = "down >10%"
  }

  // Top chain analysis
  if (detail.currentChainTvls) {
    const chainTvls = Object.entries(detail.currentChainTvls)
      .map(([chain, tvl]) => ({ chain, tvl }))
      .sort((a, b) => b.tvl - a.tvl)

    if (chainTvls.length > 0) {
      metrics.topChain = chainTvls[0].chain
      metrics.topChainTvl = chainTvls[0].tvl
      const totalTvl = chainTvls.reduce((sum, c) => sum + c.tvl, 0)
      metrics.topChainShare = totalTvl > 0 ? chainTvls[0].tvl / totalTvl : 0
    }
  }

  // Fees and revenue
  if (data.protocolFees) {
    const feesChart = data.protocolFees.totalDataChart
    if (feesChart && feesChart.length >= 7) {
      // Sum last 7 days
      const last7 = feesChart.slice(-7)
      metrics.fees7d = last7.reduce((sum, [_, val]) => sum + val, 0)
    } else {
      metrics.fees7d = data.protocolFees.total7d ?? 0
    }
  }

  if (data.protocolRevenue) {
    // Revenue might be in the same data
    metrics.revenue7d = data.protocolRevenue.total7d ?? 0
  }

  // Revenue to fees ratio
  if (metrics.fees7d && metrics.fees7d > 0 && metrics.revenue7d !== undefined) {
    metrics.revToFeesRatio = metrics.revenue7d / metrics.fees7d
  }

  return metrics
}

/**
 * Compute derived metrics for a chain episode
 */
function computeChainMetrics(
  topic: ChainPoolEntry,
  data: FetchedData
): DerivedMetrics {
  const metrics: DerivedMetrics = {}
  const history = data.chainHistory

  // Chain TVL rank
  metrics.chainTvlRank = topic.tvlRank

  // TVL band
  if (topic.tvl >= 10_000_000_000) metrics.chainTvlBand = "$10B+"
  else if (topic.tvl >= 1_000_000_000) metrics.chainTvlBand = "$1B-$10B"
  else if (topic.tvl >= 100_000_000) metrics.chainTvlBand = "$100M-$1B"
  else metrics.chainTvlBand = "<$100M"

  // History-based metrics
  if (history && history.length > 0) {
    metrics.chainChange30d = percentChangeFromChainHistory(history, 30) ?? undefined

    // ATH
    const ath = findAthFromChainHistory(history)
    if (ath) {
      metrics.chainAthValue = ath.value
      metrics.chainAthDate = ath.ts
      metrics.chainAthMonth = formatMonth(ath.ts)
    }
  }

  // Also compute protocol metrics for context
  metrics.tvlRank = topic.tvlRank
  metrics.tvlRankBucket = getRankBucket(topic.tvlRank)

  return metrics
}

// =============================================================================
// Episode Generation Options
// =============================================================================

export interface EpisodeGenerationOptions {
  /** Skip LLM calls entirely (for testing) */
  skipLLM?: boolean
  /** Skip LLM cache lookup (force regeneration) */
  skipCache?: boolean
  /** Enable verbose logging */
  verbose?: boolean
}



// =============================================================================
// Main Episode Generator
// =============================================================================

/**
 * Generate an episode for a given date
 *
 * This function:
 * 1. Determines episode type from day of week
 * 2. Selects a topic
 * 3. Fetches all required data
 * 4. Computes derived metrics
 * 5. Selects questions for each slot
 * 6. Runs post-balance pass
 * 7. Generates LLM explanations (or uses fallbacks)
 * 8. Returns assembled episode
 *
 * @param date - Date in YYYY-MM-DD format
 * @param options - Generation options (skipLLM, skipCache, verbose)
 * @returns Generated episode or null if generation failed
 */
export async function generateEpisode(
  date: string,
  options: EpisodeGenerationOptions = {}
): Promise<Episode | null> {
  const { verbose = false } = options

  console.log(`\n=== Generating episode for ${date} ===\n`)

  // Check LLM readiness
  const llmStatus = checkLLMReady()
  if (verbose) {
    console.log(`LLM Status: ${llmStatus.ready ? "Ready" : `Not ready (${llmStatus.reason})`}`)
  }

  // 1. Determine episode type
  const episodeType = getEpisodeType(date)
  console.log(`Episode type: ${episodeType}`)

  // 2. Select topic
  let topic: ProtocolPoolEntry | ChainPoolEntry
  try {
    topic = await selectTopic(date, episodeType)
    console.log(`Selected topic: ${topic.name} (${topic.slug})`)
  } catch (error) {
    console.error("Failed to select topic:", error)
    return null
  }

  // 3. Fetch data
  console.log("Fetching data...")
  let data: FetchedData | null
  if (isProtocolTopic(topic)) {
    data = await fetchProtocolData(topic)
  } else {
    data = await fetchChainData(topic)
  }

  if (!data) {
    console.error("Failed to fetch data for topic")
    return null
  }
  console.log("Data fetched successfully")

  // 4. Compute derived metrics
  console.log("Computing derived metrics...")
  let derived: DerivedMetrics
  if (isProtocolTopic(topic)) {
    derived = computeProtocolMetrics(topic, data)
  } else {
    derived = computeChainMetrics(topic, data)
  }
  if (verbose) {
    console.log("Metrics computed:", Object.keys(derived).length, "values")
  }

  // 5. Build template context
  const ctx: TemplateContext = {
    date,
    episodeType,
    topic,
    data,
    derived,
  }

  // 6. Get template matrix and slots
  const matrix = getTemplateMatrix(episodeType)
  const slots = getSlots()
  const baseSeed = seedFromParts(date, episodeType, topic.slug)

  // 7. Select questions for each slot
  console.log("Selecting questions...")
  const { drafts, buildLog } = selectAllQuestions(slots, matrix, ctx, baseSeed)
  console.log(`Selected ${drafts.length} questions`)

  // 8. Run post-balance pass
  if (verbose) {
    console.log("Running post-balance pass...")
  }
  const balancedDrafts = postBalancePass(drafts, ctx, buildLog)

  // 9. Generate LLM text for questions
  console.log("Generating explanations...")
  const textOptions: TextGenerationOptions = {
    skipLLM: options.skipLLM,
    skipCache: options.skipCache,
    verbose: options.verbose,
  }
  const questions = await generateAllQuestionText(
    balancedDrafts,
    slots,
    ctx,
    textOptions
  )

  // Add difficulty scores to questions
  for (let i = 0; i < questions.length; i++) {
    questions[i].difficultyScore = computeDifficulty(balancedDrafts[i].signals)
  }

  // 10. Assemble episode
  const episode: Episode = {
    episodeId: `${date}:${episodeType}:${topic.slug}`,
    dateUtc: date,
    episodeType,
    topic: {
      slug: topic.slug,
      name: topic.name,
      ...(isProtocolTopic(topic) ? { category: topic.category } : {}),
    },
    questions,
    generatedAt: new Date().toISOString(),
    buildLog,
  }

  // Log summary
  console.log("\n=== Episode Summary ===")
  console.log(`Episode ID: ${episode.episodeId}`)
  console.log(`Questions: ${questions.length}`)
  for (const q of questions) {
    const llmIndicator = q.llmFallback ? " [fallback]" : " [LLM]"
    console.log(
      `  ${q.slot}: ${q.templateId} (${q.format}) - ${q.difficulty} (score: ${q.difficultyScore?.toFixed(2)})${llmIndicator}`
    )
  }
  if (verbose) {
    console.log(`Build log entries: ${buildLog.length}`)
    const llmCount = questions.filter((q) => !q.llmFallback).length
    console.log(`LLM generated: ${llmCount}/${questions.length}`)
  }

  return episode
}

/**
 * Generate an episode for today's date
 */
export async function generateTodayEpisode(
  options: EpisodeGenerationOptions = {}
): Promise<Episode | null> {
  const today = new Date()
  const year = today.getUTCFullYear()
  const month = String(today.getUTCMonth() + 1).padStart(2, "0")
  const day = String(today.getUTCDate()).padStart(2, "0")
  const dateStr = `${year}-${month}-${day}`

  return generateEpisode(dateStr, options)
}
