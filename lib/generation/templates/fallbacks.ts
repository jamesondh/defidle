/**
 * Declarative Fallback Configurations
 *
 * Provides substantive fallback questions when regular templates fail.
 * These questions use real data comparisons instead of trivial "Is X a DeFi protocol?" type questions.
 *
 * Key features:
 * - Questions have variable True/False answers based on actual data
 * - TVL threshold questions at different levels ($100M, $1B, $5B)
 * - A/B comparisons against nearby protocols/chains
 * - Trend-based questions using 30-day data (minimum period for stability)
 * - Rank-based questions (top 10, top 25, etc.)
 * - Chain count questions for protocols
 * - Semantic topics for deduplication
 * - Margin validation to filter out trivially easy T/F questions
 */

import type { TemplateContext } from "@/lib/types/episode"
import type { ProtocolPoolEntry } from "@/lib/types/pools"
import {
  FallbackConfig,
  createTvlThresholdFallback,
  createRankThresholdFallback,
  createTrendFallback,
  createTrendThresholdFallback,
  createChainCountFallback,
  formatTvlValue,
} from "./config"

// =============================================================================
// Protocol Fallback Configurations
// =============================================================================

/**
 * TVL Threshold Fallbacks - varying thresholds for different difficulties
 */
const PROTOCOL_TVL_THRESHOLDS: FallbackConfig[] = [
  createTvlThresholdFallback({
    id: "protocol_tvl_above_100m",
    difficulty: "easy",
    threshold: 100_000_000,
    thresholdLabel: "$100M",
  }),
  createTvlThresholdFallback({
    id: "protocol_tvl_above_500m",
    difficulty: "easy",
    threshold: 500_000_000,
    thresholdLabel: "$500M",
  }),
  createTvlThresholdFallback({
    id: "protocol_tvl_above_1b",
    difficulty: "medium",
    threshold: 1_000_000_000,
    thresholdLabel: "$1B",
  }),
  createTvlThresholdFallback({
    id: "protocol_tvl_above_5b",
    difficulty: "medium",
    threshold: 5_000_000_000,
    thresholdLabel: "$5B",
  }),
]

/**
 * Trend-Based Fallbacks - TVL direction over time (30-day minimum)
 */
const PROTOCOL_TRENDS: FallbackConfig[] = [
  createTrendFallback({
    id: "protocol_tvl_increased_30d",
    difficulty: "easy",
    trendField: "change30d",
    direction: "increased",
    periodLabel: "the past 30 days",
  }),
  createTrendFallback({
    id: "protocol_tvl_decreased_30d",
    difficulty: "easy",
    trendField: "change30d",
    direction: "decreased",
    periodLabel: "the past 30 days",
  }),
  createTrendThresholdFallback({
    id: "protocol_tvl_up_10pct",
    difficulty: "medium",
    trendField: "change30d",
    threshold: 0.1,
    direction: "up",
    thresholdLabel: "10%",
    periodLabel: "the past month",
  }),
  createTrendThresholdFallback({
    id: "protocol_tvl_down_10pct",
    difficulty: "medium",
    trendField: "change30d",
    threshold: 0.1,
    direction: "down",
    thresholdLabel: "10%",
    periodLabel: "the past month",
  }),
]

/**
 * Rank-Based Fallbacks - protocol position in rankings
 */
const PROTOCOL_RANKS: FallbackConfig[] = [
  createRankThresholdFallback({
    id: "protocol_rank_top_10",
    difficulty: "easy",
    threshold: 10,
    rankField: "tvlRank",
    entityType: "protocols",
  }),
  createRankThresholdFallback({
    id: "protocol_rank_top_25",
    difficulty: "medium",
    threshold: 25,
    rankField: "tvlRank",
    entityType: "protocols",
  }),
  createRankThresholdFallback({
    id: "protocol_rank_top_50",
    difficulty: "easy",
    threshold: 50,
    rankField: "tvlRank",
    entityType: "protocols",
  }),
]

/**
 * Chain Count Fallbacks - multi-chain deployment
 */
const PROTOCOL_CHAIN_COUNTS: FallbackConfig[] = [
  createChainCountFallback({
    id: "protocol_chains_above_3",
    difficulty: "easy",
    threshold: 3,
  }),
  createChainCountFallback({
    id: "protocol_chains_above_5",
    difficulty: "medium",
    threshold: 5,
  }),
  createChainCountFallback({
    id: "protocol_chains_above_10",
    difficulty: "medium",
    threshold: 10,
  }),
]

/**
 * A/B Comparison Fallbacks - compare against nearby protocols
 */
const PROTOCOL_COMPARISONS: FallbackConfig[] = [
  {
    id: "protocol_compare_nearby",
    difficulty: "medium",
    format: "ab",
    semanticTopics: ["tvl_absolute"],
    canUse: (ctx) =>
      ctx.derived.nearbyProtocols !== undefined &&
      ctx.derived.nearbyProtocols.length > 0,
    getPrompt: () => `Which protocol has higher TVL?`,
    getChoices: (ctx) => {
      const nearby = ctx.derived.nearbyProtocols?.[0]
      if (!nearby) return [ctx.topic.name, "Unknown"]
      return [ctx.topic.name, nearby.name]
    },
    getAnswerIndex: (ctx) => {
      const nearby = ctx.derived.nearbyProtocols?.[0]
      if (!nearby) return 0
      return (ctx.derived.currentTvl ?? 0) >= nearby.tvl ? 0 : 1
    },
    getExplainData: (ctx) => {
      const nearby = ctx.derived.nearbyProtocols?.[0]
      const topicTvl = ctx.derived.currentTvl ?? 0
      const nearbyTvl = nearby?.tvl ?? 0
      const winner = topicTvl >= nearbyTvl ? ctx.topic.name : nearby?.name ?? "Unknown"
      const loser = topicTvl >= nearbyTvl ? nearby?.name ?? "Unknown" : ctx.topic.name
      const margin = Math.abs(topicTvl - nearbyTvl) / Math.max(topicTvl, nearbyTvl)
      return {
        winner,
        loser,
        winnerTvl: formatTvlValue(Math.max(topicTvl, nearbyTvl)),
        loserTvl: formatTvlValue(Math.min(topicTvl, nearbyTvl)),
        marginPercent: (margin * 100).toFixed(1),
      }
    },
    getMargin: (ctx) => {
      const nearby = ctx.derived.nearbyProtocols?.[0]
      if (!nearby) return null
      const topicTvl = ctx.derived.currentTvl ?? 0
      return Math.abs(topicTvl - nearby.tvl) / Math.max(topicTvl, nearby.tvl)
    },
  },
  {
    id: "protocol_compare_category",
    difficulty: "medium",
    format: "ab",
    semanticTopics: ["tvl_absolute"],
    canUse: (ctx) =>
      isProtocolTopic(ctx.topic) &&
      ctx.derived.categoryProtocols !== undefined &&
      ctx.derived.categoryProtocols.length > 0,
    getPrompt: (ctx) => {
      const topic = ctx.topic as ProtocolPoolEntry
      return `Which ${topic.category} protocol has higher TVL?`
    },
    getChoices: (ctx) => {
      const categoryProtocol = ctx.derived.categoryProtocols?.[0]
      if (!categoryProtocol) return [ctx.topic.name, "Unknown"]
      return [ctx.topic.name, categoryProtocol.name]
    },
    getAnswerIndex: (ctx) => {
      const categoryProtocol = ctx.derived.categoryProtocols?.[0]
      if (!categoryProtocol) return 0
      return (ctx.derived.currentTvl ?? 0) >= categoryProtocol.tvl ? 0 : 1
    },
    getExplainData: (ctx) => {
      const categoryProtocol = ctx.derived.categoryProtocols?.[0]
      const topicTvl = ctx.derived.currentTvl ?? 0
      const otherTvl = categoryProtocol?.tvl ?? 0
      const winner = topicTvl >= otherTvl ? ctx.topic.name : categoryProtocol?.name ?? "Unknown"
      const loser = topicTvl >= otherTvl ? categoryProtocol?.name ?? "Unknown" : ctx.topic.name
      const topic = ctx.topic as ProtocolPoolEntry
      return {
        winner,
        loser,
        winnerTvl: formatTvlValue(Math.max(topicTvl, otherTvl)),
        loserTvl: formatTvlValue(Math.min(topicTvl, otherTvl)),
        category: topic.category,
      }
    },
    getMargin: (ctx) => {
      const categoryProtocol = ctx.derived.categoryProtocols?.[0]
      if (!categoryProtocol) return null
      const topicTvl = ctx.derived.currentTvl ?? 0
      return Math.abs(topicTvl - categoryProtocol.tvl) / Math.max(topicTvl, categoryProtocol.tvl)
    },
  },
]

// =============================================================================
// Chain Fallback Configurations
// =============================================================================

/**
 * Chain TVL Threshold Fallbacks
 */
const CHAIN_TVL_THRESHOLDS: FallbackConfig[] = [
  createTvlThresholdFallback({
    id: "chain_tvl_above_100m",
    difficulty: "easy",
    threshold: 100_000_000,
    thresholdLabel: "$100M",
    promptBuilder: (name, t) => `${name} has more than ${t} in total TVL.`,
  }),
  createTvlThresholdFallback({
    id: "chain_tvl_above_500m",
    difficulty: "easy",
    threshold: 500_000_000,
    thresholdLabel: "$500M",
    promptBuilder: (name, t) => `${name} has more than ${t} in total TVL.`,
  }),
  createTvlThresholdFallback({
    id: "chain_tvl_above_1b",
    difficulty: "medium",
    threshold: 1_000_000_000,
    thresholdLabel: "$1B",
    promptBuilder: (name, t) => `${name} has more than ${t} in total TVL.`,
  }),
  createTvlThresholdFallback({
    id: "chain_tvl_above_5b",
    difficulty: "medium",
    threshold: 5_000_000_000,
    thresholdLabel: "$5B",
    promptBuilder: (name, t) => `${name} has more than ${t} in total TVL.`,
  }),
  createTvlThresholdFallback({
    id: "chain_tvl_above_10b",
    difficulty: "medium",
    threshold: 10_000_000_000,
    thresholdLabel: "$10B",
    promptBuilder: (name, t) => `${name} has more than ${t} in total TVL.`,
  }),
]

/**
 * Chain Trend Fallbacks
 */
const CHAIN_TRENDS: FallbackConfig[] = [
  createTrendFallback({
    id: "chain_tvl_increased_30d",
    difficulty: "easy",
    trendField: "chainChange30d",
    direction: "increased",
    periodLabel: "the past 30 days",
  }),
  createTrendFallback({
    id: "chain_tvl_decreased_30d",
    difficulty: "easy",
    trendField: "chainChange30d",
    direction: "decreased",
    periodLabel: "the past 30 days",
  }),
  createTrendThresholdFallback({
    id: "chain_tvl_up_10pct",
    difficulty: "medium",
    trendField: "chainChange30d",
    threshold: 0.1,
    direction: "up",
    thresholdLabel: "10%",
    periodLabel: "the past month",
  }),
  createTrendThresholdFallback({
    id: "chain_tvl_down_10pct",
    difficulty: "medium",
    trendField: "chainChange30d",
    threshold: 0.1,
    direction: "down",
    thresholdLabel: "10%",
    periodLabel: "the past month",
  }),
]

/**
 * Chain Rank Fallbacks
 */
const CHAIN_RANKS: FallbackConfig[] = [
  createRankThresholdFallback({
    id: "chain_rank_top_5",
    difficulty: "easy",
    threshold: 5,
    rankField: "chainTvlRank",
    entityType: "chains",
  }),
  createRankThresholdFallback({
    id: "chain_rank_top_10",
    difficulty: "easy",
    threshold: 10,
    rankField: "chainTvlRank",
    entityType: "chains",
  }),
  createRankThresholdFallback({
    id: "chain_rank_top_20",
    difficulty: "medium",
    threshold: 20,
    rankField: "chainTvlRank",
    entityType: "chains",
  }),
]

/**
 * Chain A/B Comparison Fallbacks
 */
const CHAIN_COMPARISONS: FallbackConfig[] = [
  {
    id: "chain_compare_nearby",
    difficulty: "medium",
    format: "ab",
    semanticTopics: ["tvl_absolute"],
    canUse: (ctx) =>
      ctx.derived.nearbyChains !== undefined && ctx.derived.nearbyChains.length > 0,
    getPrompt: () => `Which chain has higher TVL?`,
    getChoices: (ctx) => {
      const nearby = ctx.derived.nearbyChains?.[0]
      if (!nearby) return [ctx.topic.name, "Unknown"]
      return [ctx.topic.name, nearby.name]
    },
    getAnswerIndex: (ctx) => {
      const nearby = ctx.derived.nearbyChains?.[0]
      if (!nearby) return 0
      return (ctx.derived.currentTvl ?? 0) >= nearby.tvl ? 0 : 1
    },
    getExplainData: (ctx) => {
      const nearby = ctx.derived.nearbyChains?.[0]
      const topicTvl = ctx.derived.currentTvl ?? 0
      const nearbyTvl = nearby?.tvl ?? 0
      const winner = topicTvl >= nearbyTvl ? ctx.topic.name : nearby?.name ?? "Unknown"
      const loser = topicTvl >= nearbyTvl ? nearby?.name ?? "Unknown" : ctx.topic.name
      const margin = Math.abs(topicTvl - nearbyTvl) / Math.max(topicTvl, nearbyTvl)
      return {
        winner,
        loser,
        winnerTvl: formatTvlValue(Math.max(topicTvl, nearbyTvl)),
        loserTvl: formatTvlValue(Math.min(topicTvl, nearbyTvl)),
        marginPercent: (margin * 100).toFixed(1),
      }
    },
    getMargin: (ctx) => {
      const nearby = ctx.derived.nearbyChains?.[0]
      if (!nearby) return null
      const topicTvl = ctx.derived.currentTvl ?? 0
      return Math.abs(topicTvl - nearby.tvl) / Math.max(topicTvl, nearby.tvl)
    },
  },
]

// =============================================================================
// Type Guards
// =============================================================================

function isProtocolTopic(topic: unknown): topic is ProtocolPoolEntry {
  return typeof topic === "object" && topic !== null && "category" in topic
}

// =============================================================================
// Exports
// =============================================================================

/**
 * All protocol fallback configurations
 */
export const PROTOCOL_FALLBACKS: FallbackConfig[] = [
  ...PROTOCOL_TVL_THRESHOLDS,
  ...PROTOCOL_TRENDS,
  ...PROTOCOL_RANKS,
  ...PROTOCOL_CHAIN_COUNTS,
  ...PROTOCOL_COMPARISONS,
]

/**
 * All chain fallback configurations
 */
export const CHAIN_FALLBACKS: FallbackConfig[] = [
  ...CHAIN_TVL_THRESHOLDS,
  ...CHAIN_TRENDS,
  ...CHAIN_RANKS,
  ...CHAIN_COMPARISONS,
]

/**
 * Get fallbacks for a specific episode type
 */
export function getFallbacksForType(
  episodeType: "protocol" | "chain"
): FallbackConfig[] {
  return episodeType === "protocol" ? PROTOCOL_FALLBACKS : CHAIN_FALLBACKS
}
