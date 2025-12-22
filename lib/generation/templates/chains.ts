/**
 * Chain Templates (C1-C12)
 *
 * Declarative definitions for all chain question templates.
 */

import type { QuestionFormat, TemplateContext } from "@/lib/types/episode"
import type { ChainPoolEntry } from "@/lib/types/pools"
import { isExcludedCategory } from "../constants"
import {
  type TemplateConfig,
  createTemplate,
  isChainContext,
  hasMinChainHistory,
  hasChainFeesData,
  hasChainDexData,
  hasChainPool,
  hasProtocolList,
} from "./config"
import {
  pickChainDistractors,
  formatNumber,
  makeTimingDistractors,
  type ChainEntity,
} from "../distractors"
import {
  getTvlBand,
  getTvlRankBucket,
  getChangeBucket,
  abMargin,
  formatYYYYMM,
  formatMonth,
  percentChangeFromChainHistory,
} from "../metrics"
import { deterministicShuffle, createRng } from "../rng"

// =============================================================================
// C1: Chain Fingerprint Guess
// =============================================================================

interface C1Data {
  tvlRank: number
  rankBucket: string
  tvlBand: string
  tokenSymbol: string | undefined
  change30d: number | null
  trendBucket: string | undefined
  distractors: string[]
  // Track what clues were revealed (for dynamic semantic topics)
  revealedTvlBand: boolean
  revealedTrend: boolean
}

const C1_FINGERPRINT: TemplateConfig<C1Data> = {
  id: "C1_FINGERPRINT",
  name: "Chain Fingerprint Guess",
  description: "Identify a chain from a set of clues",
  type: "chain",
  // Base semantic topic - fingerprint always covers fingerprint identification
  // Dynamic topics are added based on what clues were actually revealed
  semanticTopics: ["fingerprint_base"],
  
  // Dynamic semantic topics based on what was actually revealed in clues
  getDynamicSemanticTopics(data) {
    const topics = ["fingerprint_base"]
    
    // Only block tvl topics if we actually showed the TVL band
    if (data.revealedTvlBand) {
      topics.push("fingerprint_tvl_revealed")
    }
    
    // Only block trend topics if we actually showed the trend
    if (data.revealedTrend) {
      topics.push("fingerprint_trend_revealed")
    }
    
    return topics
  },

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!ctx.data.chainList || ctx.data.chainList.length < 6) {
      return { passed: false, reason: "need_6_chains" }
    }
    const topic = ctx.topic as ChainPoolEntry
    if (!topic.tvl || !topic.tvlRank) return { passed: false, reason: "no_tvl" }
    return { passed: true }
  },

  getFormats(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return topic.tvlRank > 20 ? ["mc4"] : ["mc6", "mc4"]
  },

  extract(ctx, seed) {
    const topic = ctx.topic as ChainPoolEntry
    const chainList = ctx.data.chainList!

    const rankBucket = getTvlRankBucket(topic.tvlRank)
    const tvlBand = getTvlBand(topic.tvl)

    let change30d: number | null = null
    let trendBucket: string | undefined
    if (ctx.data.chainHistory && ctx.data.chainHistory.length > 30) {
      change30d = percentChangeFromChainHistory(ctx.data.chainHistory, 30)
      if (change30d !== null) {
        trendBucket = getChangeBucket(change30d)
      }
    }

    // Build distractor pool
    const pool: ChainEntity[] = chainList.map((c) => ({
      id: c.name,
      slug: c.name,
      name: c.name,
      tvl: c.tvl,
    }))

    const distractorCount = topic.tvlRank > 20 ? 3 : 5
    const distractors = pickChainDistractors(topic.slug, pool, distractorCount, seed)

    if (!distractors) return null

    // Determine which clues to reveal based on topic familiarity
    // For well-known chains (top 25), use simpler clues to preserve TVL/trend for later questions
    // For less familiar chains, include TVL band and trend to help with identification
    const isFamiliar = topic.tvlRank <= 25
    const revealedTvlBand = !isFamiliar
    const revealedTrend = !isFamiliar && trendBucket !== undefined

    return {
      tvlRank: topic.tvlRank,
      rankBucket,
      tvlBand,
      tokenSymbol: topic.tokenSymbol,
      change30d,
      trendBucket,
      distractors,
      revealedTvlBand,
      revealedTrend,
    }
  },

  getPrompt() {
    return "Which chain matches these clues?"
  },

  getClues(data) {
    const clues: string[] = []
    
    // Always include rank bucket
    clues.push(`TVL rank: ${data.rankBucket}`)
    
    // For less familiar chains (rank > 25), include TVL band
    // For familiar chains, omit to allow later questions about it
    if (data.revealedTvlBand) {
      clues.push(`TVL: ${data.tvlBand}`)
    }
    
    // Always include native token if available
    if (data.tokenSymbol) {
      clues.push(`Native token: ${data.tokenSymbol}`)
    }
    
    // For less familiar chains, include trend direction
    if (data.revealedTrend && data.trendBucket) {
      clues.push(`30d trend: ${data.trendBucket}`)
    }
    
    return clues
  },

  getChoices(data, ctx, _format, seed) {
    const topic = ctx.topic as ChainPoolEntry
    const allChoices = [topic.name, ...data.distractors]
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.name)
  },

  getAnswerIndex(_data, ctx, _format, choices) {
    const topic = ctx.topic as ChainPoolEntry
    return choices.indexOf(topic.name)
  },

  getMargin() {
    return null
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      tvlRank: data.tvlRank,
      tvlFormatted: data.tvlBand,
      tokenSymbol: data.tokenSymbol ?? "N/A",
      protocolCount: topic.protocolCount,
    }
  },
}

// =============================================================================
// C2: Chain TVL Comparison
// =============================================================================

interface C2Data {
  compareChain: { name: string; tvl: number }
  topicTvl: number
  topicHigher: boolean
  margin: number
}

const C2_CHAIN_COMPARISON: TemplateConfig<C2Data> = {
  id: "C2_CHAIN_COMPARISON",
  name: "Chain TVL Comparison",
  description: "Compare TVL between two chains",
  type: "chain",
  // Use tvl_comparison instead of tvl_absolute so fingerprint doesn't block this
  // Comparison questions are complementary to knowing absolute TVL magnitude
  semanticTopics: ["tvl_comparison"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!ctx.derived.nearbyChains?.length) return { passed: false, reason: "no_nearby" }
    return { passed: true }
  },

  getFormats(ctx) {
    const nearby = ctx.derived.nearbyChains?.[0]
    if (!nearby) return []
    const topicTvl = ctx.derived.currentTvl ?? 0
    const margin = abMargin(topicTvl, nearby.tvl)
    return margin !== null && margin < 0.1 ? ["tf"] : ["ab", "tf"]
  },

  extract(ctx, seed) {
    const nearby = ctx.derived.nearbyChains!
    const topicTvl = ctx.derived.currentTvl ?? 0

    const rng = createRng(seed)
    const idx = Math.floor(rng() * nearby.length)
    const compareChain = nearby[idx]

    const topicHigher = topicTvl >= compareChain.tvl
    const margin = abMargin(topicTvl, compareChain.tvl) ?? 0

    return { compareChain, topicTvl, topicHigher, margin }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return `${topic.name} has higher TVL than ${data.compareChain.name}.`
    }
    return `Which chain has higher TVL: ${topic.name} or ${data.compareChain.name}?`
  },

  getChoices(data, ctx, format, seed) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") return ["True", "False"]

    const rng = createRng(seed)
    const swapped = rng() > 0.5
    return swapped
      ? [data.compareChain.name, topic.name]
      : [topic.name, data.compareChain.name]
  },

  getAnswerIndex(data, ctx, format, choices) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return data.topicHigher ? 0 : 1
    }
    const winner = data.topicHigher ? topic.name : data.compareChain.name
    return choices.indexOf(winner)
  },

  getAnswerValue(data) {
    return data.topicHigher
  },

  getMargin(data) {
    return data.margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      winnerChain: data.topicHigher ? topic.name : data.compareChain.name,
      loserChain: data.topicHigher ? data.compareChain.name : topic.name,
      winnerTvl: formatNumber(Math.max(data.topicTvl, data.compareChain.tvl)),
      loserTvl: formatNumber(Math.min(data.topicTvl, data.compareChain.tvl)),
      marginPercent: (data.margin * 100).toFixed(1),
    }
  },
}

// =============================================================================
// C3: Chain ATH Timing
// =============================================================================

interface C3Data {
  athValue: number
  athTs: number
  athMonth: string
  athYYYYMM: string
  newHighIn90d: boolean
}

const C3_ATH_TIMING: TemplateConfig<C3Data> = {
  id: "C3_ATH_TIMING",
  name: "Chain ATH Timing",
  description: "When did a chain reach its ATH TVL",
  type: "chain",
  semanticTopics: ["ath_history"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasMinChainHistory(ctx, 90)) return { passed: false, reason: "need_90d_history" }
    if (!ctx.derived.chainAthValue || !ctx.derived.chainAthDate) {
      return { passed: false, reason: "no_ath_data" }
    }
    return { passed: true }
  },

  getFormats(ctx) {
    const history = ctx.data.chainHistory
    if (!history || history.length < 180) return ["tf"]

    const athTs = ctx.derived.chainAthDate!
    const now = Date.now() / 1000
    if ((now - athTs) / 86400 < 30) return ["tf"]

    // Add mc6 for harder difficulty - 6 months to choose from is challenging
    return ["mc6", "mc4", "tf"]
  },

  extract(ctx) {
    const athValue = ctx.derived.chainAthValue!
    const athTs = ctx.derived.chainAthDate!
    const athMonth = formatMonth(athTs)
    const athYYYYMM = formatYYYYMM(athTs)

    const now = Date.now() / 1000
    const newHighIn90d = (now - athTs) / 86400 < 90

    return { athValue, athTs, athMonth, athYYYYMM, newHighIn90d }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return `${topic.name} set a new 90-day TVL high this month.`
    }
    return `In what month did ${topic.name} hit its all-time high TVL?`
  },

  getChoices(data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]
    // mc6 gets 6 months to choose from (harder), mc4 gets 4
    const distractorCount = format === "mc6" ? 5 : 3
    const timing = makeTimingDistractors(data.athYYYYMM, distractorCount, seed)
    return timing.choices
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") {
      return data.newHighIn90d ? 0 : 1
    }
    return choices.indexOf(data.athMonth)
  },

  getAnswerValue(data) {
    return data.newHighIn90d
  },

  getMargin(data, _ctx, format) {
    if (format === "tf") {
      const now = Date.now() / 1000
      const daysSinceAth = (now - data.athTs) / 86400
      return daysSinceAth < 45 ? 0.3 : 0.6
    }
    return 0.5
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      athValue: formatNumber(data.athValue),
      athMonth: data.athMonth,
    }
  },
}

// =============================================================================
// C4: Chain Growth Ranking
// =============================================================================

interface C4Data {
  topGrower: { name: string; change30d: number }
  distractors: Array<{ name: string; change30d: number }>
  margin: number
}

const C4_GROWTH_RANKING: TemplateConfig<C4Data> = {
  id: "C4_GROWTH_RANKING",
  name: "Chain Growth Ranking",
  description: "Rank chains by recent TVL growth",
  type: "chain",
  semanticTopics: ["tvl_trend"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasChainPool(ctx, 4)) return { passed: false, reason: "need_4_chains" }

    const pool = ctx.data.chainPool!
    const withGrowth = pool.filter((c) => c.change30d !== undefined && c.change30d !== null)
    if (withGrowth.length < 4) return { passed: false, reason: "need_4_with_growth" }

    return { passed: true }
  },

  getFormats() {
    return ["mc4", "ab"]
  },

  extract(ctx, seed) {
    const pool = ctx.data.chainPool!
    const withGrowth = pool
      .filter((c): c is ChainPoolEntry & { change30d: number } => c.change30d !== undefined && c.change30d !== null)
      .sort((a, b) => b.change30d - a.change30d)

    if (withGrowth.length < 4) return null

    const topGrower = { name: withGrowth[0].name, change30d: withGrowth[0].change30d }

    // Get distractors from top 10
    const candidates = withGrowth.slice(1, 10)
    const shuffled = deterministicShuffle(candidates, `${seed}:distractors`)
    const distractors = shuffled.slice(0, 3).map((c) => ({ name: c.name, change30d: c.change30d }))

    if (distractors.length < 3) return null

    const margin =
      withGrowth.length >= 2
        ? Math.abs(withGrowth[0].change30d - withGrowth[1].change30d)
        : 0.1

    return { topGrower, distractors, margin }
  },

  getPrompt() {
    return "Which of these chains grew the most in TVL over the past 30 days?"
  },

  getChoices(data, _ctx, _format, seed) {
    const allChoices = [data.topGrower, ...data.distractors]
    const shuffled = deterministicShuffle(
      allChoices.map((c, i) => ({ name: c.name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.name)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.topGrower.name)
  },

  getMargin(data) {
    return Math.min(1, data.margin)
  },

  getExplainData(data) {
    return {
      topChain: data.topGrower.name,
      topGrowth: (data.topGrower.change30d * 100).toFixed(1),
      topChange: `${data.topGrower.change30d > 0 ? "+" : ""}${(data.topGrower.change30d * 100).toFixed(1)}%`,
      otherChains: data.distractors.map((d) => ({
        name: d.name,
        change: `${d.change30d > 0 ? "+" : ""}${(d.change30d * 100).toFixed(1)}%`,
      })),
      comparison: data.distractors
        .map((d) => `${d.name} (${d.change30d > 0 ? "+" : ""}${(d.change30d * 100).toFixed(1)}%)`)
        .join(", "),
    }
  },
}

// =============================================================================
// C5: Top Protocol by Fees
// =============================================================================

interface C5Data {
  topProtocol: string
  topFees: number
  leaderboard: Array<{ name: string; fees: number }>
  top2Margin: number
}

const C5_TOP_BY_FEES: TemplateConfig<C5Data> = {
  id: "C5_TOP_BY_FEES",
  name: "Top Protocol by Fees",
  description: "Which protocol generates the most fees on a given chain",
  type: "chain",
  semanticTopics: ["fees_metrics"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasChainFeesData(ctx)) return { passed: false, reason: "no_fees_data" }

    const fees = ctx.data.chainFees!
    if (fees.protocols.length < 4) return { passed: false, reason: "need_4_protocols" }
    
    // Check that top protocol has meaningful fees (>$100)
    // This prevents generating questions where all protocols have $0 fees
    const sorted = [...fees.protocols].sort((a, b) => (b.fees24h ?? 0) - (a.fees24h ?? 0))
    const topFees = sorted[0]?.fees24h ?? 0
    if (topFees < 100) return { passed: false, reason: "top_fees_below_threshold" }
    
    return { passed: true }
  },

  getFormats(ctx) {
    const fees = ctx.data.chainFees!
    const sorted = [...fees.protocols].sort((a, b) => (b.fees24h ?? 0) - (a.fees24h ?? 0))
    if (sorted.length < 2) return ["ab"]

    const margin = abMargin(sorted[0].fees24h ?? 0, sorted[1].fees24h ?? 0)
    if (margin !== null && margin < 0.1) return ["ab"]
    return ["mc4", "ab"]
  },

  extract(ctx) {
    const fees = ctx.data.chainFees!
    const sorted = [...fees.protocols].sort((a, b) => (b.fees24h ?? 0) - (a.fees24h ?? 0))

    if (sorted.length < 2) return null

    const topProtocol = sorted[0].name
    const topFees = sorted[0].fees24h ?? 0
    const top2Margin = abMargin(topFees, sorted[1].fees24h ?? 0) ?? 0

    const leaderboard = sorted.slice(0, 6).map((p) => ({
      name: p.name,
      fees: p.fees24h ?? 0,
    }))

    return { topProtocol, topFees, leaderboard, top2Margin }
  },

  getPrompt(_data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return `Which protocol is #1 by 24h fees on ${topic.name}?`
  },

  getChoices(data, _ctx, _format, seed) {
    const allChoices = data.leaderboard.slice(0, 4).map((p) => p.name)
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.name)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.topProtocol)
  },

  getMargin(data) {
    return data.top2Margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const otherProtocols = data.leaderboard.slice(1, 4).map((p) => ({
      name: p.name,
      fees: formatNumber(p.fees),
    }))
    return {
      chain: topic.name,
      topProtocol: data.topProtocol,
      feesAmount: formatNumber(data.topFees),
      otherProtocols,
      // Formatted comparison string for LLM
      comparison: otherProtocols.map((p) => `${p.name} (${p.fees})`).join(", "),
    }
  },
}

// =============================================================================
// C6: Top DEX by Volume
// =============================================================================

interface C6Data {
  topDex: string
  topVolume: number
  leaderboard: Array<{ name: string; volume: number }>
  top2Margin: number
}

const C6_TOP_DEX: TemplateConfig<C6Data> = {
  id: "C6_TOP_DEX",
  name: "Top DEX by Volume",
  description: "Which DEX has the highest volume on a given chain",
  type: "chain",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasChainDexData(ctx)) return { passed: false, reason: "no_dex_data" }

    const dex = ctx.data.chainDexVolume!
    if (dex.protocols.length < 4) return { passed: false, reason: "need_4_dexes" }
    return { passed: true }
  },

  getFormats(ctx) {
    const dex = ctx.data.chainDexVolume!
    const sorted = [...dex.protocols].sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))
    if (sorted.length < 2) return ["ab"]

    const margin = abMargin(sorted[0].total24h ?? 0, sorted[1].total24h ?? 0)
    if (margin !== null && margin < 0.1) return ["ab"]
    return ["mc4", "ab"]
  },

  extract(ctx) {
    const dex = ctx.data.chainDexVolume!
    const sorted = [...dex.protocols].sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))

    if (sorted.length < 2) return null

    const topDex = sorted[0].name
    const topVolume = sorted[0].total24h ?? 0
    const top2Margin = abMargin(topVolume, sorted[1].total24h ?? 0) ?? 0

    const leaderboard = sorted.slice(0, 6).map((p) => ({
      name: p.name,
      volume: p.total24h ?? 0,
    }))

    return { topDex, topVolume, leaderboard, top2Margin }
  },

  getPrompt(_data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return `Which DEX is #1 by 24h volume on ${topic.name}?`
  },

  getChoices(data, _ctx, _format, seed) {
    const allChoices = data.leaderboard.slice(0, 4).map((p) => p.name)
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.name)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.topDex)
  },

  getMargin(data) {
    return data.top2Margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const otherDexes = data.leaderboard.slice(1, 4).map((p) => ({
      name: p.name,
      volume: formatNumber(p.volume),
    }))
    return {
      chain: topic.name,
      topDex: data.topDex,
      volumeAmount: formatNumber(data.topVolume),
      otherDexes,
      // Formatted comparison string for LLM
      comparison: otherDexes.map((d) => `${d.name} (${d.volume})`).join(", "),
    }
  },
}

// =============================================================================
// C7: Chain TVL Band
// =============================================================================

interface C7Data {
  tvl: number
  tvlBand: string
  bucketIndex: number
}

const C7_CHAIN_TVL_BAND: TemplateConfig<C7Data> = {
  id: "C7_CHAIN_TVL_BAND",
  name: "Chain TVL Band",
  description: "Which TVL range fits a chain",
  type: "chain",
  // Share topic with fingerprint since fingerprint already reveals TVL band as a clue
  semanticTopics: ["tvl_magnitude", "fingerprint_tvl_revealed"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!ctx.derived.currentTvl) return { passed: false, reason: "no_tvl" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx) {
    const tvl = ctx.derived.currentTvl!
    const tvlBand = getTvlBand(tvl)

    let bucketIndex: number
    if (tvl >= 10_000_000_000) bucketIndex = 4
    else if (tvl >= 2_000_000_000) bucketIndex = 3
    else if (tvl >= 500_000_000) bucketIndex = 2
    else if (tvl >= 100_000_000) bucketIndex = 1
    else bucketIndex = 0

    return { tvl, tvlBand, bucketIndex }
  },

  getPrompt(_data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return `Which TVL range fits ${topic.name}?`
  },

  getChoices() {
    return ["<$100M", "$100M-$500M", "$500M-$2B", "$2B-$10B", ">$10B"]
  },

  getAnswerIndex(data) {
    return data.bucketIndex
  },

  getMargin(data) {
    const boundaries = [100_000_000, 500_000_000, 2_000_000_000, 10_000_000_000]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.tvl - b) / Math.max(data.tvl, b)))
    return Math.min(1, minDist * 2)
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      tvl: formatNumber(data.tvl),
      tvlBand: data.tvlBand,
    }
  },
}

// =============================================================================
// C8: 30-Day Direction
// =============================================================================

interface C8Data {
  change30d: number
  direction: "increased" | "decreased"
}

const C8_30D_DIRECTION: TemplateConfig<C8Data> = {
  id: "C8_30D_DIRECTION",
  name: "30-Day Direction",
  description: "Did a chain's TVL increase or decrease over the last 30 days",
  type: "chain",
  // Share fingerprint_trend_revealed since fingerprint already shows 30d trend direction
  semanticTopics: ["tvl_trend", "fingerprint_trend_revealed"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (ctx.derived.chainChange30d === undefined) return { passed: false, reason: "no_change30d" }
    if (Math.abs(ctx.derived.chainChange30d) < 0.02) return { passed: false, reason: "too_flat" }
    return { passed: true }
  },

  getFormats() {
    return ["ab", "tf"]
  },

  extract(ctx) {
    const change30d = ctx.derived.chainChange30d!
    const direction = change30d > 0 ? "increased" : "decreased"
    return { change30d, direction }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return `${topic.name}'s TVL increased over the last 30 days.`
    }
    return `Over the last 30 days, did ${topic.name}'s TVL increase or decrease?`
  },

  getChoices(_data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]
    const rng = createRng(seed)
    return rng() > 0.5 ? ["Decrease", "Increase"] : ["Increase", "Decrease"]
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") {
      return data.direction === "increased" ? 0 : 1
    }
    return choices.indexOf(data.direction === "increased" ? "Increase" : "Decrease")
  },

  getAnswerValue(data) {
    return data.direction === "increased"
  },

  getMargin(data) {
    return Math.abs(data.change30d)
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      change: `${data.change30d >= 0 ? "+" : ""}${(data.change30d * 100).toFixed(1)}%`,
      direction: data.direction,
    }
  },
}

// =============================================================================
// C9: Distance from ATH
// =============================================================================

interface C9Data {
  athValue: number
  currentTvl: number
  athDistance: number
  isWithin10Pct: boolean
  bucketIndex: number
}

const C9_DISTANCE_FROM_ATH: TemplateConfig<C9Data> = {
  id: "C9_DISTANCE_FROM_ATH",
  name: "Distance from ATH",
  description: "How close is a chain to its all-time high TVL",
  type: "chain",
  semanticTopics: ["ath_history"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasMinChainHistory(ctx, 90)) return { passed: false, reason: "need_90d_history" }
    if (!ctx.derived.chainAthValue) return { passed: false, reason: "no_ath" }
    return { passed: true }
  },

  getFormats(ctx) {
    const athValue = ctx.derived.chainAthValue!
    const currentTvl = ctx.derived.currentTvl ?? 0
    const athDistance = (athValue - currentTvl) / athValue

    // If at or near ATH, use TF
    if (athDistance < 0.1) return ["tf"]
    return ["tf", "mc4"]
  },

  extract(ctx) {
    const athValue = ctx.derived.chainAthValue!
    const currentTvl = ctx.derived.currentTvl ?? 0
    const athDistance = (athValue - currentTvl) / athValue
    const isWithin10Pct = athDistance <= 0.1

    let bucketIndex: number
    if (athDistance <= 0) bucketIndex = 0
    else if (athDistance <= 0.1) bucketIndex = 1
    else if (athDistance <= 0.3) bucketIndex = 2
    else if (athDistance <= 0.6) bucketIndex = 3
    else bucketIndex = 4

    return { athValue, currentTvl, athDistance, isWithin10Pct, bucketIndex }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return `${topic.name} is within 10% of its all-time high TVL.`
    }
    return `How far is ${topic.name} from its ATH TVL?`
  },

  getChoices(_data, _ctx, format) {
    if (format === "tf") return ["True", "False"]
    return ["At ATH", "Within 10%", "10-30% below", "30-60% below", ">60% below"]
  },

  getAnswerIndex(data, _ctx, format) {
    if (format === "tf") {
      return data.isWithin10Pct ? 0 : 1
    }
    return data.bucketIndex
  },

  getAnswerValue(data) {
    return data.isWithin10Pct
  },

  getMargin(data, _ctx, format) {
    if (format === "tf") {
      return Math.abs(data.athDistance - 0.1)
    }
    const boundaries = [0, 0.1, 0.3, 0.6]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.athDistance - b)))
    return minDist
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      athValue: formatNumber(data.athValue),
      currentTvl: formatNumber(data.currentTvl),
      athDistancePercent: (data.athDistance * 100).toFixed(1),
    }
  },
}

// =============================================================================
// C10: Protocol Count
// =============================================================================

interface C10Data {
  protocolCount: number
  bucketIndex: number
}

const C10_PROTOCOL_COUNT: TemplateConfig<C10Data> = {
  id: "C10_PROTOCOL_COUNT",
  name: "Protocol Count",
  description: "How many protocols are deployed on a given chain",
  type: "chain",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasProtocolList(ctx)) return { passed: false, reason: "no_protocol_list" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const list = ctx.data.protocolList!

    // Count DeFi protocols on this chain (exclude CEXs for accurate DeFi count)
    const protocolCount = list.filter((p) =>
      p.chains?.some((c) => c.toLowerCase() === topic.slug.toLowerCase()) &&
      !isExcludedCategory(p.category)
    ).length

    let bucketIndex: number
    if (protocolCount >= 250) bucketIndex = 3
    else if (protocolCount >= 100) bucketIndex = 2
    else if (protocolCount >= 50) bucketIndex = 1
    else bucketIndex = 0

    return { protocolCount, bucketIndex }
  },

  getPrompt(_data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return `How many DeFi protocols are deployed on ${topic.name}?`
  },

  getChoices() {
    return ["<50", "50-100", "100-250", ">250"]
  },

  getAnswerIndex(data) {
    return data.bucketIndex
  },

  getMargin(data) {
    const boundaries = [50, 100, 250]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.protocolCount - b) / Math.max(data.protocolCount, b)))
    return Math.min(1, minDist * 2)
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      protocolCount: data.protocolCount,
    }
  },
}

// =============================================================================
// C11: Top Protocol by TVL
// =============================================================================

interface C11Data {
  topProtocol: string
  topTvl: number
  leaderboard: Array<{ name: string; tvl: number }>
  top2Margin: number
}

const C11_TOP_PROTOCOL_TVL: TemplateConfig<C11Data> = {
  id: "C11_TOP_PROTOCOL_TVL",
  name: "Top Protocol by TVL",
  description: "Which protocol has the most TVL on a given chain",
  type: "chain",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasProtocolList(ctx)) return { passed: false, reason: "no_protocol_list" }
    return { passed: true }
  },

  getFormats(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const list = ctx.data.protocolList!

    // Get DeFi protocols on this chain sorted by TVL (exclude CEXs)
    const onChain = list
      .filter((p) => p.chains?.some((c) => c.toLowerCase() === topic.slug.toLowerCase()))
      .filter((p) => !isExcludedCategory(p.category))
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))

    if (onChain.length < 2) return ["ab"]

    const margin = abMargin(onChain[0].tvl ?? 0, onChain[1].tvl ?? 0)
    if (margin !== null && margin < 0.1) return ["ab"]
    // Add mc6 for harder difficulty when there are enough protocols
    if (onChain.length >= 6) return ["mc6", "mc4", "ab"]
    return ["mc4", "ab"]
  },

  extract(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const list = ctx.data.protocolList!

    // Filter to DeFi protocols only (exclude CEXs) - we want actual DeFi protocols on chain
    const onChain = list
      .filter((p) => p.chains?.some((c) => c.toLowerCase() === topic.slug.toLowerCase()))
      .filter((p) => !isExcludedCategory(p.category))
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))

    if (onChain.length < 2) return null

    const topProtocol = onChain[0].name
    const topTvl = onChain[0].tvl ?? 0
    const top2Margin = abMargin(topTvl, onChain[1].tvl ?? 0) ?? 0

    const leaderboard = onChain.slice(0, 6).map((p) => ({
      name: p.name,
      tvl: p.tvl ?? 0,
    }))

    return { topProtocol, topTvl, leaderboard, top2Margin }
  },

  getPrompt(_data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return `Which protocol has the most TVL on ${topic.name}?`
  },

  getChoices(data, _ctx, format, seed) {
    // mc6 gets 6 protocols, mc4/ab gets 4
    const count = format === "mc6" ? 6 : 4
    const allChoices = data.leaderboard.slice(0, count).map((p) => p.name)
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.name)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.topProtocol)
  },

  getMargin(data) {
    return data.top2Margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      chain: topic.name,
      topProtocol: data.topProtocol,
      topTvl: formatNumber(data.topTvl),
      otherProtocols: data.leaderboard.slice(1, 4).map((p) => ({
        name: p.name,
        tvl: formatNumber(p.tvl),
      })),
    }
  },
}

// =============================================================================
// C12: Category Dominance
// =============================================================================

interface C12Data {
  topCategory: string
  topCategoryTvl: number
  categoryTvls: Array<{ category: string; tvl: number }>
  top2Margin: number
}

const C12_CATEGORY_DOMINANCE: TemplateConfig<C12Data> = {
  id: "C12_CATEGORY_DOMINANCE",
  name: "Category Dominance",
  description: "What category has the most TVL on a given chain",
  type: "chain",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasProtocolList(ctx)) return { passed: false, reason: "no_protocol_list" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const list = ctx.data.protocolList!

    // Aggregate TVL by category for protocols on this chain
    const categoryMap = new Map<string, number>()
    for (const p of list) {
      if (!p.chains?.some((c) => c.toLowerCase() === topic.slug.toLowerCase())) continue
      if (!p.category) continue

      const current = categoryMap.get(p.category) ?? 0
      categoryMap.set(p.category, current + (p.tvl ?? 0))
    }

    const sorted = Array.from(categoryMap.entries())
      .map(([category, tvl]) => ({ category, tvl }))
      .sort((a, b) => b.tvl - a.tvl)

    if (sorted.length < 4) return null

    const topCategory = sorted[0].category
    const topCategoryTvl = sorted[0].tvl
    const top2Margin = abMargin(sorted[0].tvl, sorted[1].tvl) ?? 0

    return {
      topCategory,
      topCategoryTvl,
      categoryTvls: sorted.slice(0, 6),
      top2Margin,
    }
  },

  getPrompt(_data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return `What category has the most TVL on ${topic.name}?`
  },

  getChoices(data, _ctx, _format, seed) {
    const allChoices = data.categoryTvls.slice(0, 4).map((c) => c.category)
    const shuffled = deterministicShuffle(
      allChoices.map((cat, i) => ({ cat, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.cat)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.topCategory)
  },

  getMargin(data) {
    return data.top2Margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      chain: topic.name,
      topCategory: data.topCategory,
      topCategoryTvl: formatNumber(data.topCategoryTvl),
      otherCategories: data.categoryTvls.slice(1, 4).map((c) => ({
        category: c.category,
        tvl: formatNumber(c.tvl),
      })),
    }
  },
}

// =============================================================================
// C13: Layer Type Identification
// =============================================================================

interface C13Data {
  isLayer2: boolean
  layerType: "Layer 1" | "Layer 2"
  parentChain?: string
}

// Known L2 chains - these are unambiguously Layer 2 (rollups that settle on another chain)
const LAYER_2_CHAINS: Set<string> = new Set([
  // Ethereum L2s (rollups)
  "Arbitrum",
  "Arbitrum One",
  "Arbitrum Nova",
  "Optimism",
  "Base",
  "zkSync Era",
  "zkSync",
  "Scroll",
  "Linea",
  "Starknet",
  "Polygon zkEVM",
  "Manta",
  "Mantle",
  "Blast",
  "Mode",
  "Zora",
  "Fraxtal",
  "Metis",
  "Boba",
  "Loopring",
  "Ink",
  "Unichain",
  // BNB Chain L2s
  "Op_Bnb",
  "opBNB",
])

// Chains where L1/L2 classification is ambiguous or debated
// These should be skipped for the layer type question
const AMBIGUOUS_LAYER_CHAINS: Set<string> = new Set([
  // Sidechains - have their own consensus but bridge to another chain
  "Polygon",        // Often called L2 but technically a sidechain with its own PoS
  "Polygon POS",
  "BSC",            // EVM-compatible but independent chain
  "Gnosis",         // xDai sidechain
  "Ronin",          // Axie Infinity sidechain
  // Plasma-based chains
  "Plasma",
  // App-specific chains that don't fit neatly
  "Hyperliquid L1", // Called L1 but purpose-built for one app
  // Cosmos ecosystem chains (IBC-connected, debatable classification)
  "Osmosis",
  "Injective",
  "Kujira",
  "Neutron",
])

// Parent chain mapping for L2s
const L2_PARENT_CHAINS: Record<string, string> = {
  Arbitrum: "Ethereum",
  "Arbitrum One": "Ethereum",
  "Arbitrum Nova": "Ethereum",
  Optimism: "Ethereum",
  Base: "Ethereum",
  "zkSync Era": "Ethereum",
  zkSync: "Ethereum",
  Scroll: "Ethereum",
  Linea: "Ethereum",
  Starknet: "Ethereum",
  "Polygon zkEVM": "Ethereum",
  Manta: "Ethereum",
  Mantle: "Ethereum",
  Blast: "Ethereum",
  Mode: "Ethereum",
  Zora: "Ethereum",
  Fraxtal: "Ethereum",
  Metis: "Ethereum",
  Boba: "Ethereum",
  Loopring: "Ethereum",
  Ink: "Ethereum",
  Unichain: "Ethereum",
  Op_Bnb: "BNB Chain",
  opBNB: "BNB Chain",
}

const C13_LAYER_TYPE: TemplateConfig<C13Data> = {
  id: "C13_LAYER_TYPE",
  name: "Layer Type Identification",
  description: "Identify whether a chain is a Layer 1 or Layer 2 blockchain",
  type: "chain",
  semanticTopics: ["chain_classification"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    const topic = ctx.topic as ChainPoolEntry
    // Only ask this for chains we have data about
    if (!topic.tvl) return { passed: false, reason: "no_tvl" }
    // Skip chains where L1/L2 classification is ambiguous or debated
    if (AMBIGUOUS_LAYER_CHAINS.has(topic.name)) {
      return { passed: false, reason: "ambiguous_layer_classification" }
    }
    return { passed: true }
  },

  getFormats() {
    return ["ab", "tf"]
  },

  extract(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const chainName = topic.name

    // Determine if L2
    const isLayer2 = LAYER_2_CHAINS.has(chainName)
    const layerType = isLayer2 ? "Layer 2" : "Layer 1"
    const parentChain = L2_PARENT_CHAINS[chainName]

    return { isLayer2, layerType, parentChain }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return `${topic.name} is a Layer 2 blockchain.`
    }
    return `Is ${topic.name} a Layer 1 or Layer 2 blockchain?`
  },

  getChoices(_data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]
    const rng = createRng(seed)
    return rng() > 0.5 ? ["Layer 2", "Layer 1"] : ["Layer 1", "Layer 2"]
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") {
      return data.isLayer2 ? 0 : 1
    }
    return choices.indexOf(data.layerType)
  },

  getAnswerValue(data) {
    return data.isLayer2
  },

  getMargin() {
    // This is a factual question, not a numeric comparison
    return 0.5
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      name: topic.name,
      layerType: data.layerType,
      isLayer2: data.isLayer2,
      parentChain: data.parentChain ?? "N/A",
      explanation: data.isLayer2
        ? `${topic.name} is a Layer 2 blockchain that scales ${data.parentChain ?? "its parent chain"}.`
        : `${topic.name} is a Layer 1 blockchain with its own independent consensus mechanism.`,
    }
  },
}

// =============================================================================
// C14: Chain TVL Dominance (Top Protocol Share)
// =============================================================================

interface C14Data {
  topProtocol: string
  topProtocolTvl: number
  chainTvl: number
  dominancePercent: number
  bucketIndex: number
}

const DOMINANCE_BUCKETS = ["<25%", "25-50%", "50-75%", ">75%"]

function getDominanceBucketIndex(dominance: number): number {
  if (dominance < 0.25) return 0
  if (dominance < 0.5) return 1
  if (dominance < 0.75) return 2
  return 3
}

const C14_TVL_DOMINANCE: TemplateConfig<C14Data> = {
  id: "C14_TVL_DOMINANCE",
  name: "Chain TVL Dominance",
  description: "What share of a chain's TVL is controlled by its top protocol",
  type: "chain",
  semanticTopics: ["chain_concentration"],

  checkPrereqs(ctx) {
    if (!isChainContext(ctx)) return { passed: false, reason: "not_chain" }
    if (!hasProtocolList(ctx)) return { passed: false, reason: "no_protocol_list" }
    const topic = ctx.topic as ChainPoolEntry
    if (!topic.tvl || topic.tvl <= 0) return { passed: false, reason: "no_tvl" }
    return { passed: true }
  },

  getFormats(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const list = ctx.data.protocolList!

    // Get top DeFi protocol on this chain (exclude CEXs)
    const onChain = list
      .filter((p) => p.chains?.some((c) => c.toLowerCase() === topic.slug.toLowerCase()))
      .filter((p) => !isExcludedCategory(p.category))
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))

    if (onChain.length < 1) return []

    const topTvl = onChain[0].tvl ?? 0
    const chainTvl = topic.tvl
    const dominance = chainTvl > 0 ? topTvl / chainTvl : 0

    // If dominance is near 50%, use TF; otherwise MC4
    if (Math.abs(dominance - 0.5) < 0.1) return ["tf", "mc4"]
    return ["mc4", "tf"]
  },

  extract(ctx) {
    const topic = ctx.topic as ChainPoolEntry
    const list = ctx.data.protocolList!

    // Filter to DeFi protocols only (exclude CEXs)
    const onChain = list
      .filter((p) => p.chains?.some((c) => c.toLowerCase() === topic.slug.toLowerCase()))
      .filter((p) => !isExcludedCategory(p.category))
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))

    if (onChain.length < 1) return null

    const topProtocol = onChain[0].name
    const topProtocolTvl = onChain[0].tvl ?? 0
    const chainTvl = topic.tvl
    const dominancePercent = chainTvl > 0 ? (topProtocolTvl / chainTvl) * 100 : 0
    const bucketIndex = getDominanceBucketIndex(dominancePercent / 100)

    return { topProtocol, topProtocolTvl, chainTvl, dominancePercent, bucketIndex }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ChainPoolEntry
    if (format === "tf") {
      return `The top protocol on ${topic.name} controls more than 50% of the chain's TVL.`
    }
    return `What share of ${topic.name}'s TVL does its top protocol (${data.topProtocol}) control?`
  },

  getChoices(_data, _ctx, format) {
    if (format === "tf") return ["True", "False"]
    return DOMINANCE_BUCKETS
  },

  getAnswerIndex(data, _ctx, format) {
    if (format === "tf") {
      return data.dominancePercent >= 50 ? 0 : 1
    }
    return data.bucketIndex
  },

  getAnswerValue(data) {
    return data.dominancePercent >= 50
  },

  getMargin(data, _ctx, format) {
    if (format === "tf") {
      return Math.abs(data.dominancePercent - 50) / 100
    }
    // Distance to bucket boundaries
    const boundaries = [25, 50, 75]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.dominancePercent - b)))
    return minDist / 25
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ChainPoolEntry
    return {
      chain: topic.name,
      topProtocol: data.topProtocol,
      topProtocolTvl: formatNumber(data.topProtocolTvl),
      chainTvl: formatNumber(data.chainTvl),
      dominancePercent: Math.round(data.dominancePercent),
      bucket: DOMINANCE_BUCKETS[data.bucketIndex],
    }
  },
}

// =============================================================================
// Export all templates
// =============================================================================

export const CHAIN_TEMPLATE_CONFIGS = {
  C1_FINGERPRINT,
  C2_CHAIN_COMPARISON,
  C3_ATH_TIMING,
  C4_GROWTH_RANKING,
  C5_TOP_BY_FEES,
  C6_TOP_DEX,
  C7_CHAIN_TVL_BAND,
  C8_30D_DIRECTION,
  C9_DISTANCE_FROM_ATH,
  C10_PROTOCOL_COUNT,
  C11_TOP_PROTOCOL_TVL,
  C12_CATEGORY_DOMINANCE,
  C13_LAYER_TYPE,
  C14_TVL_DOMINANCE,
}

// Create Template implementations from configs
export const c1ChainFingerprint = createTemplate(C1_FINGERPRINT)
export const c2ChainTVLComparison = createTemplate(C2_CHAIN_COMPARISON)
export const c3ChainATHTiming = createTemplate(C3_ATH_TIMING)
export const c4ChainGrowthRanking = createTemplate(C4_GROWTH_RANKING)
export const c5TopProtocolByFees = createTemplate(C5_TOP_BY_FEES)
export const c6TopDEXByVolume = createTemplate(C6_TOP_DEX)
export const c7ChainTVLBand = createTemplate(C7_CHAIN_TVL_BAND)
export const c8_30DayDirection = createTemplate(C8_30D_DIRECTION)
export const c9DistanceFromATH = createTemplate(C9_DISTANCE_FROM_ATH)
export const c10ProtocolCount = createTemplate(C10_PROTOCOL_COUNT)
export const c11TopProtocolByTVL = createTemplate(C11_TOP_PROTOCOL_TVL)
export const c12CategoryDominance = createTemplate(C12_CATEGORY_DOMINANCE)
export const c13LayerType = createTemplate(C13_LAYER_TYPE)
export const c14TvlDominance = createTemplate(C14_TVL_DOMINANCE)
