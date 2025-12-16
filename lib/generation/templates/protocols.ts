/**
 * Protocol Templates (P1-P15)
 *
 * Declarative definitions for all protocol question templates.
 * Each template is ~30-60 lines instead of ~150-200 lines.
 */

import type { TemplateContext } from "@/lib/types/episode"
import type { ProtocolPoolEntry } from "@/lib/types/pools"
import {
  type TemplateConfig,
  createTemplate,
  isProtocolContext,
  hasMinChains,
  hasFeesData,
  hasMinProtocolHistory,
  hasProtocolList,
  standardFormats,
} from "./config"
import {
  pickProtocolDistractors,
  formatNumber,
  makeTimingDistractors,
  getConcentrationBucketChoices,
  getConcentrationBucketIndex,
  getRevenueBucketChoices,
  getRevenueBucketIndex,
  getChangeBucketChoices,
  getChangeBucketIndex,
  type ProtocolEntity,
} from "../distractors"
import {
  getTvlBand,
  getChainCountBucket,
  getChangeBucket,
  abMargin,
  formatYYYYMM,
  formatMonth,
} from "../metrics"
import { deterministicShuffle, createRng } from "../rng"
import { filterToActualChains, sumActualChainTvl } from "../chain-filter"

// =============================================================================
// P1: Protocol Fingerprint Guess
// =============================================================================

interface P1Data {
  category: string
  chainCount: number
  chainBucket: string
  currentTvl: number
  tvlBand: string
  change7d: number | undefined
  changeBucket: string | undefined
  chains: string[]
  distractors: string[]
}

const P1_FINGERPRINT: TemplateConfig<P1Data> = {
  id: "P1_FINGERPRINT",
  name: "Protocol Fingerprint Guess",
  description: "Identify a protocol from a set of clues about its characteristics",
  type: "protocol",
  semanticTopics: ["tvl_absolute"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const detail = ctx.data.protocolDetail
    if (!detail) return { passed: false, reason: "no_detail" }
    if (!detail.category) return { passed: false, reason: "no_category" }
    if (!detail.chains?.length) return { passed: false, reason: "no_chains" }
    if (!detail.tvl?.length) return { passed: false, reason: "no_tvl" }
    if (!hasProtocolList(ctx)) return { passed: false, reason: "no_list" }
    return { passed: true }
  },

  getFormats(ctx) {
    return ctx.topic.tvlRank > 50 ? ["mc4"] : ["mc6", "mc4"]
  },

  extract(ctx, seed) {
    const detail = ctx.data.protocolDetail!
    const list = ctx.data.protocolList!
    const topic = ctx.topic as ProtocolPoolEntry

    const chainCount = detail.chains.length
    const chainBucket = getChainCountBucket(chainCount)
    const currentTvl =
      detail.tvl[detail.tvl.length - 1]?.totalLiquidityUSD ??
      (detail.currentChainTvls ? sumActualChainTvl(detail.currentChainTvls) : 0)
    const tvlBand = getTvlBand(currentTvl)
    const change7d = ctx.derived.change7d
    const changeBucket = change7d !== undefined ? getChangeBucket(change7d) : undefined

    // Build distractor pool
    const sortedProtocols = [...list].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    const rankMap = new Map<string, number>()
    sortedProtocols.forEach((p, idx) => rankMap.set(p.slug, idx + 1))

    const pool: ProtocolEntity[] = list.map((p) => ({
      id: p.slug,
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl: p.tvl,
      chains: p.chains,
      tvlRank: rankMap.get(p.slug),
    }))

    // Try to get distractors - multiple fallback strategies
    const distractorCount = ctx.topic.tvlRank > 50 ? 3 : 5
    let distractors = pickProtocolDistractors(detail.slug, pool, distractorCount, seed, {
      mustMatch: { category: detail.category },
      maxTvlRank: 150,
      preferNearRank: topic.tvlRank,
    })

    if (!distractors) {
      distractors = pickProtocolDistractors(detail.slug, pool, distractorCount, seed, {
        mustMatch: { category: detail.category },
        maxTvlRank: 200,
      })
    }

    if (!distractors) {
      distractors = pickProtocolDistractors(detail.slug, pool, distractorCount, seed, {
        maxTvlRank: 150,
      })
    }

    if (!distractors) {
      distractors = pickProtocolDistractors(detail.slug, pool, distractorCount, seed)
    }

    if (!distractors) return null

    return {
      category: detail.category,
      chainCount,
      chainBucket,
      currentTvl,
      tvlBand,
      change7d,
      changeBucket,
      chains: detail.chains.slice(0, 5),
      distractors,
    }
  },

  getPrompt() {
    return "Which protocol matches these clues?"
  },

  getClues(data) {
    const clues = [
      `Category: ${data.category}`,
      `Chains: ${data.chainBucket}`,
      `TVL: ${data.tvlBand}`,
    ]
    if (data.changeBucket) {
      clues.push(`7d change: ${data.changeBucket}`)
    }
    return clues
  },

  getChoices(data, ctx, _format, seed) {
    const detail = ctx.data.protocolDetail!
    const allChoices = [detail.name, ...data.distractors]
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.name)
  },

  getAnswerIndex(data, ctx, _format, choices) {
    const detail = ctx.data.protocolDetail!
    return choices.indexOf(detail.name)
  },

  getMargin() {
    return null // No numeric margin for fingerprint
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      category: data.category,
      chainCount: data.chainCount,
      tvl: formatNumber(data.currentTvl),
      tvlBand: data.tvlBand,
      chains: data.chains.join(", "),
    }
  },

  getBuildNotes(data) {
    return [`Generated ${data.changeBucket ? 4 : 3} clues for fingerprint`]
  },
}

// =============================================================================
// P2: Cross-Chain Dominance
// =============================================================================

interface P2Data {
  chainA: { name: string; tvl: number }
  chainB: { name: string; tvl: number }
  margin: number
}

const P2_CROSSCHAIN: TemplateConfig<P2Data> = {
  id: "P2_CROSSCHAIN",
  name: "Cross-Chain Dominance",
  description: "Compare a protocol's TVL across two chains",
  type: "protocol",
  semanticTopics: ["tvl_absolute"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!hasMinChains(ctx, 2)) return { passed: false, reason: "need_2_chains" }
    return { passed: true }
  },

  getFormats(ctx) {
    const detail = ctx.data.protocolDetail
    if (!detail?.currentChainTvls) return []

    const sorted = filterToActualChains(detail.currentChainTvls).sort((a, b) => b[1] - a[1])
    if (sorted.length < 2) return []

    const margin = abMargin(sorted[0][1], sorted[1][1])
    return margin !== null && margin < 0.15 ? ["tf"] : ["ab", "tf"]
  },

  extract(ctx, seed) {
    const detail = ctx.data.protocolDetail!
    const sorted = filterToActualChains(detail.currentChainTvls).sort((a, b) => b[1] - a[1])

    if (sorted.length < 2) return null

    const rng = createRng(seed)

    let chainA: [string, number]
    let chainB: [string, number]

    // For variety, sometimes compare non-adjacent chains
    if (sorted.length >= 3 && rng() > 0.5) {
      chainA = sorted[0]
      chainB = sorted[2]
    } else {
      chainA = sorted[0]
      chainB = sorted[1]
    }

    const margin = abMargin(chainA[1], chainB[1])!

    const formatChainName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

    return {
      chainA: { name: formatChainName(chainA[0]), tvl: chainA[1] },
      chainB: { name: formatChainName(chainB[0]), tvl: chainB[1] },
      margin,
    }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "ab") {
      return `Where does ${detail.name} have higher TVL?`
    }
    return `${detail.name} has higher TVL on ${data.chainA.name} than on ${data.chainB.name}.`
  },

  getChoices(data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]

    const rng = createRng(seed)
    const swapped = rng() > 0.5
    return swapped ? [data.chainB.name, data.chainA.name] : [data.chainA.name, data.chainB.name]
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") {
      return data.chainA.tvl > data.chainB.tvl ? 0 : 1
    }
    return choices.indexOf(data.chainA.name)
  },

  getAnswerValue(data) {
    return data.chainA.tvl > data.chainB.tvl
  },

  getMargin(data) {
    return data.margin
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      winnerChain: data.chainA.name,
      loserChain: data.chainB.name,
      winnerTvl: formatNumber(data.chainA.tvl),
      loserTvl: formatNumber(data.chainB.tvl),
      marginPercent: Math.round(data.margin * 100),
    }
  },

  getBuildNotes(data) {
    return [
      `Comparing ${data.chainA.name} (${formatNumber(data.chainA.tvl)}) vs ${data.chainB.name} (${formatNumber(data.chainB.tvl)})`,
      `Margin: ${(data.margin * 100).toFixed(1)}%`,
    ]
  },
}

// =============================================================================
// P3: Top Chain Concentration
// =============================================================================

interface P3Data {
  topChain: string
  topChainTvl: number
  totalTvl: number
  topShare: number
  bucketIndex: number
}

const P3_CONCENTRATION: TemplateConfig<P3Data> = {
  id: "P3_CONCENTRATION",
  name: "Top Chain Concentration",
  description: "What share of a protocol's TVL is on its dominant chain",
  type: "protocol",
  semanticTopics: ["tvl_absolute"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const detail = ctx.data.protocolDetail
    if (!detail?.currentChainTvls) return { passed: false, reason: "no_chain_tvls" }
    const chains = filterToActualChains(detail.currentChainTvls)
    if (chains.length < 1) return { passed: false, reason: "no_chains" }
    return { passed: true }
  },

  getFormats(ctx) {
    const detail = ctx.data.protocolDetail!
    const chains = filterToActualChains(detail.currentChainTvls)
    // Single chain = TF format ("Is >90% on {chain}?")
    if (chains.length === 1) return ["tf"]
    return ["mc4"]
  },

  extract(ctx) {
    const detail = ctx.data.protocolDetail!
    const chains = filterToActualChains(detail.currentChainTvls).sort((a, b) => b[1] - a[1])

    if (chains.length === 0) return null

    const topChain = chains[0][0].charAt(0).toUpperCase() + chains[0][0].slice(1)
    const topChainTvl = chains[0][1]
    const totalTvl = chains.reduce((sum, [, tvl]) => sum + tvl, 0)
    const topShare = totalTvl > 0 ? topChainTvl / totalTvl : 0
    const bucketIndex = getConcentrationBucketIndex(topShare)

    return { topChain, topChainTvl, totalTvl, topShare, bucketIndex }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      return `More than 90% of ${detail.name}'s TVL is on ${data.topChain}.`
    }
    return `What share of ${detail.name}'s TVL is on its top chain (${data.topChain})?`
  },

  getChoices(_data, _ctx, format) {
    if (format === "tf") return ["True", "False"]
    return getConcentrationBucketChoices()
  },

  getAnswerIndex(data, _ctx, format) {
    if (format === "tf") {
      return data.topShare >= 0.9 ? 0 : 1
    }
    return data.bucketIndex
  },

  getAnswerValue(data) {
    return data.topShare >= 0.9
  },

  getMargin(data, _ctx, format) {
    if (format === "tf") {
      return Math.abs(data.topShare - 0.9)
    }
    // For bucket format, margin is distance to bucket boundaries
    const boundaries = [0.25, 0.5, 0.75]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.topShare - b)))
    return Math.min(1, minDist * 4)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      topChain: data.topChain,
      sharePercent: Math.round(data.topShare * 100),
      topChainTvl: formatNumber(data.topChainTvl),
      totalTvl: formatNumber(data.totalTvl),
    }
  },
}

// =============================================================================
// P4: ATH Timing
// =============================================================================

interface P4Data {
  athValue: number
  athTs: number
  athMonth: string
  athYYYYMM: string
  newHighIn90d: boolean
  distractorMonths: string[]
}

const P4_ATH_TIMING: TemplateConfig<P4Data> = {
  id: "P4_ATH_TIMING",
  name: "ATH Timing",
  description: "When did a protocol reach its all-time high TVL",
  type: "protocol",
  semanticTopics: ["ath_history"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!hasMinProtocolHistory(ctx, 90)) return { passed: false, reason: "need_90d_history" }
    if (!ctx.derived.athValue || !ctx.derived.athDate) {
      return { passed: false, reason: "no_ath_data" }
    }
    return { passed: true }
  },

  getFormats(ctx) {
    // If history < 6 months or ATH very recent, use TF
    const historyDays = ctx.data.protocolDetail?.tvl?.length ?? 0
    if (historyDays < 180) return ["tf"]

    const athTs = ctx.derived.athDate!
    const now = Date.now() / 1000
    const daysSinceAth = (now - athTs) / 86400
    if (daysSinceAth < 30) return ["tf"]

    return ["mc4", "tf"]
  },

  extract(ctx, seed) {
    const athValue = ctx.derived.athValue!
    const athTs = ctx.derived.athDate!
    const athMonth = formatMonth(athTs)
    const athYYYYMM = formatYYYYMM(athTs)

    // Check if new high in last 90 days
    const now = Date.now() / 1000
    const newHighIn90d = (now - athTs) / 86400 < 90

    // Generate distractor months
    const timing = makeTimingDistractors(athYYYYMM, 3, seed)

    return {
      athValue,
      athTs,
      athMonth,
      athYYYYMM,
      newHighIn90d,
      distractorMonths: timing.distractorMonths,
    }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      return `${detail.name} set a new 90-day TVL high this month.`
    }
    return `In what month did ${detail.name} hit its all-time high TVL?`
  },

  getChoices(data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]
    const timing = makeTimingDistractors(data.athYYYYMM, 3, seed)
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
    return 0.5 // MC timing questions have medium difficulty
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      athValue: formatNumber(data.athValue),
      athMonth: data.athMonth,
      distractorMonths: data.distractorMonths,
      // Formatted comparison for LLM to reference wrong choices
      comparison: `The correct answer is ${data.athMonth}. The other choices (${data.distractorMonths.join(", ")}) were not when ${detail.name} reached its ATH.`,
    }
  },
}

// =============================================================================
// P5: Fees vs Revenue
// =============================================================================

interface P5Data {
  fees7d: number
  rev7d: number
  hasRevenue: boolean
  revToFeesRatio: number
  bucketIndex: number
}

const P5_FEES_REVENUE: TemplateConfig<P5Data> = {
  id: "P5_FEES_REVENUE",
  name: "Fees vs Revenue",
  description: "Compare a protocol's fees and revenue metrics",
  type: "protocol",
  semanticTopics: ["fees_metrics"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!hasFeesData(ctx)) return { passed: false, reason: "no_fees" }
    return { passed: true }
  },

  getFormats(ctx) {
    const revenue = ctx.data.protocolRevenue
    if (!revenue?.total7d) return ["tf"]
    return ["mc4", "ab", "tf"]
  },

  extract(ctx) {
    const fees = ctx.data.protocolFees!
    const revenue = ctx.data.protocolRevenue

    const fees7d = fees.total7d ?? 0
    const rev7d = revenue?.total7d ?? 0
    const hasRevenue = rev7d > 0
    const revToFeesRatio = fees7d > 0 ? rev7d / fees7d : 0
    const bucketIndex = getRevenueBucketIndex(revToFeesRatio)

    return { fees7d, rev7d, hasRevenue, revToFeesRatio, bucketIndex }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      return `${detail.name} has generated non-zero protocol revenue over the past week.`
    }
    if (format === "ab") {
      return `Over the last 7 days, did ${detail.name} generate more in fees or revenue?`
    }
    return `What percentage of ${detail.name}'s fees became protocol revenue over the past 7 days?`
  },

  getChoices(data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]
    if (format === "ab") {
      const rng = createRng(seed)
      return rng() > 0.5 ? ["Revenue", "Fees"] : ["Fees", "Revenue"]
    }
    return getRevenueBucketChoices()
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") {
      return data.hasRevenue ? 0 : 1
    }
    if (format === "ab") {
      const feesHigher = data.fees7d > data.rev7d
      return choices.indexOf(feesHigher ? "Fees" : "Revenue")
    }
    return data.bucketIndex
  },

  getAnswerValue(data) {
    return data.hasRevenue
  },

  getMargin(data, _ctx, format) {
    if (format === "tf") return 0.3
    if (format === "ab") {
      return Math.abs(data.fees7d - data.rev7d) / Math.max(data.fees7d, data.rev7d)
    }
    // Bucket margin
    const boundaries = [0.1, 0.3, 0.6]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.revToFeesRatio - b)))
    return Math.min(1, minDist * 4)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    const revPercent =
      data.revToFeesRatio < 0.01
        ? "less than 1%"
        : data.revToFeesRatio < 0.1
          ? `${(data.revToFeesRatio * 100).toFixed(1)}%`
          : `${Math.round(data.revToFeesRatio * 100)}%`

    return {
      name: detail.name,
      fees7d: formatNumber(data.fees7d),
      rev7d: formatNumber(data.rev7d),
      hasRevenue: data.hasRevenue,
      revPercent,
    }
  },
}

// =============================================================================
// P6: TVL Trend
// =============================================================================

interface P6Data {
  change7d: number
  change30d: number | undefined
  trendDirection: "increased" | "decreased" | "flat"
  changeBucket: string
  bucketIndex: number
}

const P6_TVL_TREND: TemplateConfig<P6Data> = {
  id: "P6_TVL_TREND",
  name: "TVL Trend",
  description: "Did a protocol's TVL increase or decrease over a given period",
  type: "protocol",
  semanticTopics: ["tvl_trend_7d", "tvl_direction"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (ctx.derived.change7d === undefined) return { passed: false, reason: "no_change7d" }
    return { passed: true }
  },

  getFormats(ctx) {
    const change = ctx.derived.change7d ?? 0
    // If near bucket boundary, prefer TF
    if (Math.abs(change) < 0.02) return ["tf"]
    return ["tf", "mc4", "ab"]
  },

  extract(ctx) {
    const change7d = ctx.derived.change7d!
    const change30d = ctx.derived.change30d

    let trendDirection: "increased" | "decreased" | "flat"
    if (change7d > 0.01) trendDirection = "increased"
    else if (change7d < -0.01) trendDirection = "decreased"
    else trendDirection = "flat"

    const changeBucket = getChangeBucket(change7d)
    const bucketIndex = getChangeBucketIndex(change7d)

    return { change7d, change30d, trendDirection, changeBucket, bucketIndex }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      return `${detail.name}'s TVL increased over the past 7 days.`
    }
    if (format === "ab") {
      return `Over the past 7 days, did ${detail.name}'s TVL increase or decrease?`
    }
    return `What was ${detail.name}'s approximate TVL change over the past 7 days?`
  },

  getChoices(_data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]
    if (format === "ab") {
      const rng = createRng(seed)
      return rng() > 0.5 ? ["Decrease", "Increase"] : ["Increase", "Decrease"]
    }
    return getChangeBucketChoices()
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") {
      return data.trendDirection === "increased" ? 0 : 1
    }
    if (format === "ab") {
      return choices.indexOf(data.trendDirection === "increased" ? "Increase" : "Decrease")
    }
    return data.bucketIndex
  },

  getAnswerValue(data) {
    return data.trendDirection === "increased"
  },

  getMargin(data) {
    return Math.abs(data.change7d)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    const changeStr =
      data.change7d >= 0
        ? `+${(data.change7d * 100).toFixed(1)}%`
        : `${(data.change7d * 100).toFixed(1)}%`

    return {
      name: detail.name,
      change: changeStr,
      trendDirection: data.trendDirection,
      tvl: formatNumber(ctx.derived.currentTvl ?? 0),
    }
  },
}

// =============================================================================
// P7: Category Identification
// =============================================================================

interface P7Data {
  category: string
  distractorCategories: string[]
}

const P7_CATEGORY: TemplateConfig<P7Data> = {
  id: "P7_CATEGORY",
  name: "Category Identification",
  description: "Identify a protocol's category",
  type: "protocol",
  semanticTopics: ["category_identification"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const detail = ctx.data.protocolDetail
    if (!detail?.category) return { passed: false, reason: "no_category" }

    // Check for name-answer leakage
    const name = detail.name.toLowerCase()
    const category = detail.category.toLowerCase()
    const leakageKeywords: Record<string, string[]> = {
      lending: ["lend", "loan", "borrow"],
      dexes: ["swap", "dex", "exchange"],
      bridge: ["bridge"],
      derivatives: ["perp", "futures", "options"],
      yield: ["yield", "farm"],
      staking: ["stake", "staking"],
    }

    const keywords = leakageKeywords[category] ?? []
    for (const kw of keywords) {
      if (name.includes(kw)) {
        return { passed: false, reason: `name_leaks_category:${kw}` }
      }
    }

    if (!hasProtocolList(ctx)) return { passed: false, reason: "no_list" }
    return { passed: true }
  },

  getFormats(ctx) {
    return standardFormats(ctx, { hard: ["mc4", "mc6"], medium: ["mc4"], easy: ["mc4"] })
  },

  extract(ctx, seed) {
    const detail = ctx.data.protocolDetail!
    const list = ctx.data.protocolList!
    const category = detail.category

    // Get unique categories from nearby protocols
    const allCategories = list.map((p) => p.category).filter((c): c is string => c !== undefined && c !== category)
    const otherCategories = Array.from(new Set(allCategories))

    // Pick 3 distractor categories
    const shuffled = deterministicShuffle(otherCategories, `${seed}:categories`)
    const distractorCategories = shuffled.slice(0, 3)

    if (distractorCategories.length < 3) return null

    return { category, distractorCategories }
  },

  getPrompt(_data, ctx) {
    const detail = ctx.data.protocolDetail!
    return `What category is ${detail.name}?`
  },

  getChoices(data, _ctx, _format, seed) {
    const allChoices = [data.category, ...data.distractorCategories]
    const shuffled = deterministicShuffle(
      allChoices.map((c, i) => ({ c, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.c)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.category)
  },

  getMargin() {
    return 0.5 // Category questions have medium difficulty
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      category: data.category,
    }
  },
}

// =============================================================================
// P8: Chain Membership
// =============================================================================

interface P8Data {
  chains: string[]
  presentChain: string
  absentChain: string | null
  distractorChains: string[]
}

const P8_CHAIN_MEMBERSHIP: TemplateConfig<P8Data> = {
  id: "P8_CHAIN_MEMBERSHIP",
  name: "Chain Membership",
  description: "Check if a protocol is deployed on a specific chain",
  type: "protocol",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const detail = ctx.data.protocolDetail
    if (!detail?.chains?.length) return { passed: false, reason: "no_chains" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4", "tf"]
  },

  extract(ctx, seed) {
    const detail = ctx.data.protocolDetail!
    const chains = detail.chains

    // Common chains for distractors
    const commonChains = [
      "Ethereum",
      "Arbitrum",
      "Polygon",
      "Optimism",
      "BSC",
      "Avalanche",
      "Solana",
      "Base",
      "Fantom",
      "zkSync Era",
    ]

    const presentChain = chains[Math.floor(createRng(seed)() * chains.length)]
    const absentChains = commonChains.filter(
      (c) => !chains.map((ch) => ch.toLowerCase()).includes(c.toLowerCase())
    )
    const absentChain = absentChains.length > 0 ? absentChains[0] : null

    // Distractors: mix of present and absent chains
    const distractorPool = [...chains.slice(0, 3), ...absentChains.slice(0, 3)]
    const shuffled = deterministicShuffle(
      distractorPool.filter((c) => c !== presentChain),
      `${seed}:distractors`
    )
    const distractorChains = shuffled.slice(0, 3)

    return { chains, presentChain, absentChain, distractorChains }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      const chain = createRng(Date.now())() > 0.5 ? data.presentChain : data.absentChain
      return `${detail.name} is deployed on ${chain ?? data.presentChain}.`
    }
    return `Which chain is ${detail.name} deployed on?`
  },

  getChoices(data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]

    const allChoices = [data.presentChain, ...data.distractorChains]
    const shuffled = deterministicShuffle(
      allChoices.map((c, i) => ({ c, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.c)
  },

  getAnswerIndex(data, ctx, format, choices) {
    if (format === "tf") {
      const prompt = this.getPrompt(data, ctx, format)
      const isAboutPresent = prompt.includes(data.presentChain)
      return isAboutPresent ? 0 : 1
    }
    return choices.indexOf(data.presentChain)
  },

  getMargin() {
    return 0.4
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      chains: data.chains.slice(0, 5).join(", "),
      chainCount: data.chains.length,
    }
  },
}

// =============================================================================
// P9: Top Chain Name
// =============================================================================

interface P9Data {
  topChain: string
  topTvl: number
  chainTvls: Array<{ chain: string; tvl: number }>
  top2Margin: number
  distractors: string[]
}

const P9_TOP_CHAIN: TemplateConfig<P9Data> = {
  id: "P9_TOP_CHAIN",
  name: "Top Chain Name",
  description: "Which chain has the most TVL for a multi-chain protocol",
  type: "protocol",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!hasMinChains(ctx, 2)) return { passed: false, reason: "need_2_chains" }
    return { passed: true }
  },

  getFormats(ctx) {
    const detail = ctx.data.protocolDetail
    if (!detail?.currentChainTvls) return []

    const sorted = filterToActualChains(detail.currentChainTvls).sort((a, b) => b[1] - a[1])
    if (sorted.length < 2) return ["tf"]

    const margin = abMargin(sorted[0][1], sorted[1][1])
    if (margin !== null && margin < 0.15) return ["tf"]
    return ["mc4", "tf"]
  },

  extract(ctx, seed) {
    const detail = ctx.data.protocolDetail!
    const sorted = filterToActualChains(detail.currentChainTvls).sort((a, b) => b[1] - a[1])

    if (sorted.length < 2) return null

    const formatName = (n: string) => n.charAt(0).toUpperCase() + n.slice(1)
    const topChain = formatName(sorted[0][0])
    const topTvl = sorted[0][1]
    const chainTvls = sorted.map(([chain, tvl]) => ({ chain: formatName(chain), tvl }))
    const top2Margin = abMargin(sorted[0][1], sorted[1][1]) ?? 0

    // Distractors from other chains the protocol is on
    const otherChains = chainTvls.slice(1, 5).map((c) => c.chain)
    const shuffled = deterministicShuffle(otherChains, `${seed}:distractors`)
    const distractors = shuffled.slice(0, 3)

    if (distractors.length < 3) {
      // Add common chains as fallback
      const common = ["Ethereum", "Arbitrum", "Polygon", "BSC", "Solana"]
        .filter((c) => !chainTvls.some((ct) => ct.chain.toLowerCase() === c.toLowerCase()))
      distractors.push(...common.slice(0, 3 - distractors.length))
    }

    return { topChain, topTvl, chainTvls, top2Margin, distractors }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      const second = data.chainTvls[1]?.chain ?? "other chains"
      return `${detail.name} has more TVL on ${data.topChain} than on ${second}.`
    }
    return `On which chain does ${detail.name} have the most TVL?`
  },

  getChoices(data, _ctx, format, seed) {
    if (format === "tf") return ["True", "False"]

    const allChoices = [data.topChain, ...data.distractors.slice(0, 3)]
    const shuffled = deterministicShuffle(
      allChoices.map((c, i) => ({ c, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )
    return shuffled.map((x) => x.c)
  },

  getAnswerIndex(data, _ctx, format, choices) {
    if (format === "tf") return 0 // Statement is always true
    return choices.indexOf(data.topChain)
  },

  getAnswerValue() {
    return true
  },

  getMargin(data) {
    return data.top2Margin
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      topChain: data.topChain,
      topTvl: formatNumber(data.topTvl),
      comparison: data.chainTvls
        .slice(0, 3)
        .map((c) => `${c.chain}: ${formatNumber(c.tvl)}`)
        .join(", "),
    }
  },
}

// =============================================================================
// P10: TVL Band
// =============================================================================

interface P10Data {
  tvl: number
  tvlBand: string
  bucketIndex: number
}

const P10_TVL_BAND: TemplateConfig<P10Data> = {
  id: "P10_TVL_BAND",
  name: "TVL Band",
  description: "Which TVL range fits a protocol",
  type: "protocol",
  semanticTopics: ["tvl_magnitude"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!ctx.derived.currentTvl) return { passed: false, reason: "no_tvl" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx) {
    const tvl = ctx.derived.currentTvl!
    const tvlBand = getTvlBand(tvl)

    // Determine bucket index
    let bucketIndex: number
    if (tvl >= 5_000_000_000) bucketIndex = 4
    else if (tvl >= 1_000_000_000) bucketIndex = 3
    else if (tvl >= 250_000_000) bucketIndex = 2
    else if (tvl >= 50_000_000) bucketIndex = 1
    else bucketIndex = 0

    return { tvl, tvlBand, bucketIndex }
  },

  getPrompt(_data, ctx) {
    const detail = ctx.data.protocolDetail!
    return `Which TVL range fits ${detail.name}?`
  },

  getChoices() {
    return ["<$50M", "$50M-$250M", "$250M-$1B", "$1B-$5B", ">$5B"]
  },

  getAnswerIndex(data) {
    return data.bucketIndex
  },

  getMargin(data) {
    // Distance to bucket boundaries
    const boundaries = [50_000_000, 250_000_000, 1_000_000_000, 5_000_000_000]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.tvl - b) / Math.max(data.tvl, b)))
    return Math.min(1, minDist * 2)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      tvl: formatNumber(data.tvl),
      tvlBand: data.tvlBand,
    }
  },
}

// =============================================================================
// P11: Fees Trend
// =============================================================================

interface P11Data {
  feesTrend: number
  trendDirection: "increased" | "decreased" | "flat"
  fees7dNow: number
  fees7dAgo: number
}

const P11_FEES_TREND: TemplateConfig<P11Data> = {
  id: "P11_FEES_TREND",
  name: "Fees Trend",
  description: "Did a protocol's fees increase or decrease over a period",
  type: "protocol",
  semanticTopics: ["fees_metrics"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const fees = ctx.data.protocolFees
    if (!fees?.totalDataChart || fees.totalDataChart.length < 14) {
      return { passed: false, reason: "need_14d_fees" }
    }
    return { passed: true }
  },

  getFormats() {
    return ["tf", "mc4"]
  },

  extract(ctx) {
    const chart = ctx.data.protocolFees!.totalDataChart!
    if (chart.length < 14) return null

    // Compare last 7 days to previous 7 days
    const last7 = chart.slice(-7)
    const prev7 = chart.slice(-14, -7)

    const fees7dNow = last7.reduce((sum, [, v]) => sum + v, 0)
    const fees7dAgo = prev7.reduce((sum, [, v]) => sum + v, 0)

    if (fees7dAgo === 0) return null

    const feesTrend = (fees7dNow - fees7dAgo) / fees7dAgo

    let trendDirection: "increased" | "decreased" | "flat"
    if (feesTrend > 0.05) trendDirection = "increased"
    else if (feesTrend < -0.05) trendDirection = "decreased"
    else trendDirection = "flat"

    return { feesTrend, trendDirection, fees7dNow, fees7dAgo }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      return `${detail.name}'s fees increased over the past week compared to the week before.`
    }
    return `How did ${detail.name}'s weekly fees change compared to the previous week?`
  },

  getChoices(_data, _ctx, format) {
    if (format === "tf") return ["True", "False"]
    return ["Down >20%", "Down 5-20%", "Roughly flat", "Up 5-20%", "Up >20%"]
  },

  getAnswerIndex(data, _ctx, format) {
    if (format === "tf") {
      return data.trendDirection === "increased" ? 0 : 1
    }
    // Bucket index
    if (data.feesTrend > 0.2) return 4
    if (data.feesTrend > 0.05) return 3
    if (data.feesTrend >= -0.05) return 2
    if (data.feesTrend >= -0.2) return 1
    return 0
  },

  getAnswerValue(data) {
    return data.trendDirection === "increased"
  },

  getMargin(data) {
    return Math.abs(data.feesTrend)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      feesTrend: `${data.feesTrend >= 0 ? "+" : ""}${(data.feesTrend * 100).toFixed(1)}%`,
      fees7dNow: formatNumber(data.fees7dNow),
      fees7dAgo: formatNumber(data.fees7dAgo),
    }
  },
}

// =============================================================================
// P12: DEX Volume Trend
// =============================================================================

interface P12Data {
  volumeTrend: number
  trendDirection: "increased" | "decreased" | "flat"
}

const P12_DEX_VOLUME_TREND: TemplateConfig<P12Data> = {
  id: "P12_DEX_VOLUME_TREND",
  name: "DEX Volume Trend",
  description: "Did a DEX's volume increase or decrease",
  type: "protocol",
  semanticTopics: [],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const detail = ctx.data.protocolDetail
    if (detail?.category !== "Dexes") return { passed: false, reason: "not_dex" }
    // Would need volume data - simplified for now
    if (ctx.derived.change7d === undefined) return { passed: false, reason: "no_change" }
    return { passed: true }
  },

  getFormats() {
    return ["tf"]
  },

  extract(ctx) {
    // Use TVL change as proxy for volume (simplified)
    const change = ctx.derived.change7d ?? 0

    let trendDirection: "increased" | "decreased" | "flat"
    if (change > 0.02) trendDirection = "increased"
    else if (change < -0.02) trendDirection = "decreased"
    else trendDirection = "flat"

    return { volumeTrend: change, trendDirection }
  },

  getPrompt(_data, ctx) {
    const detail = ctx.data.protocolDetail!
    return `${detail.name}'s trading activity increased over the past 7 days.`
  },

  getChoices() {
    return ["True", "False"]
  },

  getAnswerIndex(data) {
    return data.trendDirection === "increased" ? 0 : 1
  },

  getAnswerValue(data) {
    return data.trendDirection === "increased"
  },

  getMargin(data) {
    return Math.abs(data.volumeTrend)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      trend: `${data.volumeTrend >= 0 ? "+" : ""}${(data.volumeTrend * 100).toFixed(1)}%`,
    }
  },
}

// =============================================================================
// P13: TVL Rank Comparison
// =============================================================================

interface P13Data {
  compareProtocol: { name: string; tvl: number; rank: number }
  topicTvl: number
  topicHigher: boolean
  margin: number
}

const P13_TVL_RANK_COMPARISON: TemplateConfig<P13Data> = {
  id: "P13_TVL_RANK_COMPARISON",
  name: "TVL Rank Comparison",
  description: "Compare a protocol's TVL to another similar protocol",
  type: "protocol",
  semanticTopics: ["tvl_absolute"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!ctx.derived.nearbyProtocols?.length) return { passed: false, reason: "no_nearby" }
    return { passed: true }
  },

  getFormats() {
    return ["ab", "tf"]
  },

  extract(ctx, seed) {
    const nearby = ctx.derived.nearbyProtocols!
    const topicTvl = ctx.derived.currentTvl ?? 0

    // Pick a comparison protocol deterministically
    const rng = createRng(seed)
    const idx = Math.floor(rng() * nearby.length)
    const compareProtocol = nearby[idx]

    const topicHigher = topicTvl >= compareProtocol.tvl
    const margin = abMargin(topicTvl, compareProtocol.tvl) ?? 0

    return { compareProtocol, topicTvl, topicHigher, margin }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ProtocolPoolEntry
    if (format === "tf") {
      return `${topic.name} has higher TVL than ${data.compareProtocol.name}.`
    }
    return "Which protocol has higher TVL?"
  },

  getChoices(data, ctx, format, seed) {
    const topic = ctx.topic as ProtocolPoolEntry
    if (format === "tf") return ["True", "False"]

    const rng = createRng(seed)
    const swapped = rng() > 0.5
    return swapped
      ? [data.compareProtocol.name, topic.name]
      : [topic.name, data.compareProtocol.name]
  },

  getAnswerIndex(data, ctx, format, choices) {
    const topic = ctx.topic as ProtocolPoolEntry
    if (format === "tf") {
      return data.topicHigher ? 0 : 1
    }
    const winner = data.topicHigher ? topic.name : data.compareProtocol.name
    return choices.indexOf(winner)
  },

  getAnswerValue(data) {
    return data.topicHigher
  },

  getMargin(data) {
    return data.margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ProtocolPoolEntry
    return {
      winner: data.topicHigher ? topic.name : data.compareProtocol.name,
      loser: data.topicHigher ? data.compareProtocol.name : topic.name,
      winnerTvl: formatNumber(Math.max(data.topicTvl, data.compareProtocol.tvl)),
      loserTvl: formatNumber(Math.min(data.topicTvl, data.compareProtocol.tvl)),
      marginPercent: (data.margin * 100).toFixed(1),
    }
  },
}

// =============================================================================
// P14: Category Leader Comparison
// =============================================================================

interface P14Data {
  categoryProtocol: { name: string; tvl: number }
  category: string
  topicTvl: number
  topicHigher: boolean
  margin: number
}

const P14_CATEGORY_LEADER: TemplateConfig<P14Data> = {
  id: "P14_CATEGORY_LEADER",
  name: "Category Leader Comparison",
  description: "Compare protocol to others in the same category",
  type: "protocol",
  semanticTopics: ["tvl_absolute"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!ctx.derived.categoryProtocols?.length) return { passed: false, reason: "no_category" }
    const topic = ctx.topic as ProtocolPoolEntry
    if (!topic.category) return { passed: false, reason: "no_topic_category" }
    return { passed: true }
  },

  getFormats() {
    return ["ab", "tf"]
  },

  extract(ctx, seed) {
    const catProtocols = ctx.derived.categoryProtocols!
    const topic = ctx.topic as ProtocolPoolEntry
    const topicTvl = ctx.derived.currentTvl ?? 0

    const rng = createRng(seed)
    const idx = Math.floor(rng() * catProtocols.length)
    const categoryProtocol = catProtocols[idx]

    const topicHigher = topicTvl >= categoryProtocol.tvl
    const margin = abMargin(topicTvl, categoryProtocol.tvl) ?? 0

    return {
      categoryProtocol,
      category: topic.category,
      topicTvl,
      topicHigher,
      margin,
    }
  },

  getPrompt(data, ctx, format) {
    const topic = ctx.topic as ProtocolPoolEntry
    if (format === "tf") {
      return `${topic.name} has higher TVL than ${data.categoryProtocol.name}.`
    }
    return `Which ${data.category} protocol has higher TVL?`
  },

  getChoices(data, ctx, format, seed) {
    const topic = ctx.topic as ProtocolPoolEntry
    if (format === "tf") return ["True", "False"]

    const rng = createRng(seed)
    const swapped = rng() > 0.5
    return swapped
      ? [data.categoryProtocol.name, topic.name]
      : [topic.name, data.categoryProtocol.name]
  },

  getAnswerIndex(data, ctx, format, choices) {
    const topic = ctx.topic as ProtocolPoolEntry
    if (format === "tf") {
      return data.topicHigher ? 0 : 1
    }
    const winner = data.topicHigher ? topic.name : data.categoryProtocol.name
    return choices.indexOf(winner)
  },

  getAnswerValue(data) {
    return data.topicHigher
  },

  getMargin(data) {
    return data.margin
  },

  getExplainData(data, ctx) {
    const topic = ctx.topic as ProtocolPoolEntry
    return {
      category: data.category,
      winner: data.topicHigher ? topic.name : data.categoryProtocol.name,
      loser: data.topicHigher ? data.categoryProtocol.name : topic.name,
      winnerTvl: formatNumber(Math.max(data.topicTvl, data.categoryProtocol.tvl)),
      loserTvl: formatNumber(Math.min(data.topicTvl, data.categoryProtocol.tvl)),
    }
  },
}

// =============================================================================
// P15: Recent TVL Direction
// =============================================================================

interface P15Data {
  change: number
  direction: "increased" | "decreased"
  period: "7 days" | "30 days"
}

const P15_RECENT_TVL_DIRECTION: TemplateConfig<P15Data> = {
  id: "P15_RECENT_TVL_DIRECTION",
  name: "Recent TVL Direction",
  description: "Simple question about protocol's recent TVL trend",
  type: "protocol",
  semanticTopics: ["tvl_trend_7d", "tvl_direction"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const has7d = ctx.derived.change7d !== undefined && Math.abs(ctx.derived.change7d) > 0.02
    const has30d = ctx.derived.change30d !== undefined && Math.abs(ctx.derived.change30d) > 0.02
    if (!has7d && !has30d) return { passed: false, reason: "no_clear_trend" }
    return { passed: true }
  },

  getFormats() {
    return ["ab", "tf"]
  },

  extract(ctx) {
    // Prefer 7d data, fall back to 30d
    let change: number
    let period: "7 days" | "30 days"

    if (ctx.derived.change7d !== undefined && Math.abs(ctx.derived.change7d) > 0.02) {
      change = ctx.derived.change7d
      period = "7 days"
    } else {
      change = ctx.derived.change30d!
      period = "30 days"
    }

    const direction = change > 0 ? "increased" : "decreased"

    return { change, direction, period }
  },

  getPrompt(data, ctx, format) {
    const detail = ctx.data.protocolDetail!
    if (format === "tf") {
      return `${detail.name}'s TVL has increased over the past ${data.period}.`
    }
    return `Over the past ${data.period}, did ${detail.name}'s TVL increase or decrease?`
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
    return Math.abs(data.change)
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      change: `${data.change >= 0 ? "+" : ""}${(data.change * 100).toFixed(1)}%`,
      direction: data.direction,
      period: data.period,
      tvl: formatNumber(ctx.derived.currentTvl ?? 0),
    }
  },
}

// =============================================================================
// P16: Category Peer Comparison (MC4 version - good for single-chain protocols)
// =============================================================================

interface P16Data {
  categoryPeers: Array<{ name: string; tvl: number }>
  correctPeer: { name: string; tvl: number }
  category: string
  questionType: "highest" | "lowest"
}

const P16_CATEGORY_PEER: TemplateConfig<P16Data> = {
  id: "P16_CATEGORY_PEER",
  name: "Category Peer Comparison",
  description: "Which protocol has highest/lowest TVL in category",
  type: "protocol",
  semanticTopics: ["tvl_absolute", "category_ranking"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const catProtocols = ctx.derived.categoryProtocols
    if (!catProtocols || catProtocols.length < 3) return { passed: false, reason: "need_3_category_peers" }
    const topic = ctx.topic as ProtocolPoolEntry
    if (!topic.category) return { passed: false, reason: "no_category" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx, seed) {
    const catProtocols = ctx.derived.categoryProtocols!
    const topic = ctx.topic as ProtocolPoolEntry
    const topicTvl = ctx.derived.currentTvl ?? 0

    // Include topic in the pool
    const allInCategory = [
      { name: topic.name, tvl: topicTvl, slug: topic.slug, rank: topic.tvlRank },
      ...catProtocols,
    ].sort((a, b) => b.tvl - a.tvl)

    // Deterministically choose highest or lowest question
    const rng = createRng(seed)
    const questionType = rng() > 0.5 ? "highest" : "lowest"

    // Pick 4 choices including the correct answer
    const correctPeer = questionType === "highest" ? allInCategory[0] : allInCategory[allInCategory.length - 1]
    
    // Get 3 distractors from remaining protocols
    const distractors = allInCategory
      .filter((p) => p.name !== correctPeer.name)
      .slice(0, 5) // Take from top 5 (for highest) or around
    
    const shuffledDistractors = deterministicShuffle(distractors, `${seed}:dist`).slice(0, 3)
    const categoryPeers = [correctPeer, ...shuffledDistractors]

    return { categoryPeers, correctPeer, category: topic.category, questionType }
  },

  getPrompt(data) {
    return `Which ${data.category} protocol has the ${data.questionType} TVL?`
  },

  getChoices(data, _ctx, _format, seed) {
    return deterministicShuffle(data.categoryPeers, `${seed}:shuffle`).map((p) => p.name)
  },

  getAnswerIndex(data, _ctx, _format, choices) {
    return choices.indexOf(data.correctPeer.name)
  },

  getMargin(data) {
    // Margin is difference between correct and closest competitor
    const sorted = [...data.categoryPeers].sort((a, b) => b.tvl - a.tvl)
    if (data.questionType === "highest") {
      return abMargin(sorted[0].tvl, sorted[1].tvl) ?? 0
    } else {
      return abMargin(sorted[sorted.length - 2].tvl, sorted[sorted.length - 1].tvl) ?? 0
    }
  },

  getExplainData(data) {
    const otherPeers = data.categoryPeers
      .filter((p) => p.name !== data.correctPeer.name)
      .map((p) => ({ name: p.name, tvl: formatNumber(p.tvl) }))

    return {
      category: data.category,
      questionType: data.questionType,
      winner: data.correctPeer.name,
      winnerTvl: formatNumber(data.correctPeer.tvl),
      otherPeers,
      comparison: otherPeers.map((p) => `${p.name} (${p.tvl})`).join(", "),
    }
  },
}

// =============================================================================
// P20: ATH Distance (bucket format)
// =============================================================================

interface P20Data {
  athValue: number
  currentTvl: number
  distancePercent: number
  bucketIndex: number
}

const ATH_DISTANCE_BUCKETS = ["<25% below ATH", "25-50% below ATH", "50-75% below ATH", ">75% below ATH"]

function getAthDistanceBucketIndex(distancePercent: number): number {
  if (distancePercent < 25) return 0
  if (distancePercent < 50) return 1
  if (distancePercent < 75) return 2
  return 3
}

const P20_ATH_DISTANCE: TemplateConfig<P20Data> = {
  id: "P20_ATH_DISTANCE",
  name: "ATH Distance",
  description: "How far is the protocol from its all-time high TVL",
  type: "protocol",
  semanticTopics: ["ath_history", "tvl_magnitude"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    if (!ctx.derived.athValue) return { passed: false, reason: "no_ath" }
    if (!ctx.derived.currentTvl) return { passed: false, reason: "no_current_tvl" }
    // Only ask if protocol is below ATH
    const distance = (ctx.derived.athValue - ctx.derived.currentTvl) / ctx.derived.athValue
    if (distance < 0.1) return { passed: false, reason: "too_close_to_ath" } // Within 10% of ATH
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx) {
    const athValue = ctx.derived.athValue!
    const currentTvl = ctx.derived.currentTvl!
    const distancePercent = ((athValue - currentTvl) / athValue) * 100
    const bucketIndex = getAthDistanceBucketIndex(distancePercent)

    return { athValue, currentTvl, distancePercent, bucketIndex }
  },

  getPrompt(_data, ctx) {
    const detail = ctx.data.protocolDetail!
    return `How far is ${detail.name}'s current TVL from its all-time high?`
  },

  getChoices() {
    return ATH_DISTANCE_BUCKETS
  },

  getAnswerIndex(data) {
    return data.bucketIndex
  },

  getMargin(data) {
    // Distance to bucket boundaries
    const boundaries = [25, 50, 75]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.distancePercent - b)))
    return Math.min(1, minDist / 25) // Normalize to 0-1
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      athValue: formatNumber(data.athValue),
      currentTvl: formatNumber(data.currentTvl),
      distancePercent: Math.round(data.distancePercent),
      bucket: ATH_DISTANCE_BUCKETS[data.bucketIndex],
    }
  },
}

// =============================================================================
// P22: Category Market Share
// =============================================================================

interface P22Data {
  categoryTotal: number
  protocolTvl: number
  sharePercent: number
  bucketIndex: number
  category: string
}

const MARKET_SHARE_BUCKETS = ["<10%", "10-25%", "25-50%", ">50%"]

function getMarketShareBucketIndex(sharePercent: number): number {
  if (sharePercent < 10) return 0
  if (sharePercent < 25) return 1
  if (sharePercent < 50) return 2
  return 3
}

const P22_CATEGORY_MARKET_SHARE: TemplateConfig<P22Data> = {
  id: "P22_CATEGORY_MARKET_SHARE",
  name: "Category Market Share",
  description: "What percentage of category TVL does this protocol hold",
  type: "protocol",
  semanticTopics: ["tvl_absolute", "category_ranking"],

  checkPrereqs(ctx) {
    if (!isProtocolContext(ctx)) return { passed: false, reason: "not_protocol" }
    const catProtocols = ctx.derived.categoryProtocols
    if (!catProtocols || catProtocols.length < 2) return { passed: false, reason: "need_category_data" }
    const topic = ctx.topic as ProtocolPoolEntry
    if (!topic.category) return { passed: false, reason: "no_category" }
    if (!ctx.derived.currentTvl) return { passed: false, reason: "no_tvl" }
    return { passed: true }
  },

  getFormats() {
    return ["mc4"]
  },

  extract(ctx) {
    const catProtocols = ctx.derived.categoryProtocols!
    const topic = ctx.topic as ProtocolPoolEntry
    const protocolTvl = ctx.derived.currentTvl!

    // Calculate total category TVL (including topic protocol)
    const categoryTotal = protocolTvl + catProtocols.reduce((sum, p) => sum + p.tvl, 0)
    const sharePercent = (protocolTvl / categoryTotal) * 100
    const bucketIndex = getMarketShareBucketIndex(sharePercent)

    return { categoryTotal, protocolTvl, sharePercent, bucketIndex, category: topic.category }
  },

  getPrompt(_data, ctx) {
    const detail = ctx.data.protocolDetail!
    const topic = ctx.topic as ProtocolPoolEntry
    return `What share of ${topic.category} TVL does ${detail.name} hold?`
  },

  getChoices() {
    return MARKET_SHARE_BUCKETS
  },

  getAnswerIndex(data) {
    return data.bucketIndex
  },

  getMargin(data) {
    // Distance to bucket boundaries
    const boundaries = [10, 25, 50]
    const minDist = Math.min(...boundaries.map((b) => Math.abs(data.sharePercent - b)))
    return Math.min(1, minDist / 10) // Normalize to 0-1
  },

  getExplainData(data, ctx) {
    const detail = ctx.data.protocolDetail!
    return {
      name: detail.name,
      category: data.category,
      protocolTvl: formatNumber(data.protocolTvl),
      categoryTotal: formatNumber(data.categoryTotal),
      sharePercent: Math.round(data.sharePercent),
      bucket: MARKET_SHARE_BUCKETS[data.bucketIndex],
    }
  },
}

// =============================================================================
// Export all templates
// =============================================================================

export const PROTOCOL_TEMPLATE_CONFIGS = {
  P1_FINGERPRINT,
  P2_CROSSCHAIN,
  P3_CONCENTRATION,
  P4_ATH_TIMING,
  P5_FEES_REVENUE,
  P6_TVL_TREND,
  P7_CATEGORY,
  P8_CHAIN_MEMBERSHIP,
  P9_TOP_CHAIN,
  P10_TVL_BAND,
  P11_FEES_TREND,
  P12_DEX_VOLUME_TREND,
  P13_TVL_RANK_COMPARISON,
  P14_CATEGORY_LEADER,
  P15_RECENT_TVL_DIRECTION,
  P16_CATEGORY_PEER,
  P20_ATH_DISTANCE,
  P22_CATEGORY_MARKET_SHARE,
}

// Create Template implementations from configs
export const p1ProtocolFingerprint = createTemplate(P1_FINGERPRINT)
export const p2CrossChainDominance = createTemplate(P2_CROSSCHAIN)
export const p3TopChainConcentration = createTemplate(P3_CONCENTRATION)
export const p4ATHTiming = createTemplate(P4_ATH_TIMING)
export const p5FeesVsRevenue = createTemplate(P5_FEES_REVENUE)
export const p6TVLTrend = createTemplate(P6_TVL_TREND)
export const p7CategoryIdentification = createTemplate(P7_CATEGORY)
export const p8ChainMembership = createTemplate(P8_CHAIN_MEMBERSHIP)
export const p9TopChainName = createTemplate(P9_TOP_CHAIN)
export const p10TVLBand = createTemplate(P10_TVL_BAND)
export const p11FeesTrend = createTemplate(P11_FEES_TREND)
export const p12DEXVolumeTrend = createTemplate(P12_DEX_VOLUME_TREND)
export const p13TVLRankComparison = createTemplate(P13_TVL_RANK_COMPARISON)
export const p14CategoryLeaderComparison = createTemplate(P14_CATEGORY_LEADER)
export const p15RecentTVLDirection = createTemplate(P15_RECENT_TVL_DIRECTION)
export const p16CategoryPeer = createTemplate(P16_CATEGORY_PEER)
export const p20AthDistance = createTemplate(P20_ATH_DISTANCE)
export const p22CategoryMarketShare = createTemplate(P22_CATEGORY_MARKET_SHARE)
