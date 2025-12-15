/**
 * Quantitative Fallback Questions
 *
 * Provides substantive fallback questions when regular templates fail.
 * These questions use real data comparisons instead of trivial "Is X a DeFi protocol?" type questions.
 *
 * Key improvements over the old fallback system:
 * - Questions have variable True/False answers based on actual data
 * - TVL threshold questions at different levels ($100M, $1B, $5B)
 * - A/B comparisons against nearby protocols/chains
 * - Trend-based questions using change7d data
 * - Rank-based questions (top 10, top 25, etc.)
 * - Chain count questions for protocols
 * - Semantic topics for deduplication (prevents multiple TVL questions)
 * - Margin validation to filter out trivially easy T/F questions
 */

import type {
  TemplateContext,
  QuestionDraft,
  QuestionFormat,
  DifficultyTarget,
} from "@/lib/types/episode"
import type { ProtocolPoolEntry, ChainPoolEntry } from "@/lib/types/pools"
import { createRng } from "./rng"

// =============================================================================
// Types
// =============================================================================

/**
 * A quantitative fallback question definition
 */
export interface QuantitativeFallback {
  /** Unique identifier for this fallback */
  id: string
  /** Target difficulty range (easy or medium - fallbacks shouldn't be hard) */
  difficulty: "easy" | "medium"
  /** Question format (tf or ab) */
  format: QuestionFormat
  /** Semantic topics covered by this fallback (for deduplication) */
  semanticTopics: string[]
  /** Generate the question prompt */
  getPrompt: (ctx: TemplateContext) => string
  /** Get the choices (for ab format) */
  getChoices?: (ctx: TemplateContext) => string[]
  /** Determine the correct answer index */
  getAnswerIndex: (ctx: TemplateContext) => number
  /** Get the boolean answer value (for tf format) */
  getAnswerValue?: (ctx: TemplateContext) => boolean
  /** Get structured data for explanation generation */
  getExplainData: (ctx: TemplateContext) => Record<string, unknown>
  /** Check if this fallback can be used given the context */
  canUse: (ctx: TemplateContext) => boolean
  /** Get the margin for this fallback (for difficulty filtering). Returns null if not applicable. */
  getMargin?: (ctx: TemplateContext) => number | null
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a number as a currency string (e.g., $1.2B, $450M)
 */
function formatTvl(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

/**
 * Format a percentage change (e.g., +5.2%, -3.1%)
 */
function formatChange(change: number): string {
  const sign = change >= 0 ? "+" : ""
  return `${sign}${(change * 100).toFixed(1)}%`
}

/**
 * Type guard for protocol topics
 */
function isProtocolTopic(
  topic: ProtocolPoolEntry | ChainPoolEntry
): topic is ProtocolPoolEntry {
  return "category" in topic
}

/**
 * Calculate margin for TVL threshold questions.
 * Returns the relative distance from the threshold (0 = at threshold, 1 = far from threshold)
 */
function getTvlThresholdMargin(tvl: number, threshold: number): number {
  if (tvl === 0) return 1
  return Math.abs(tvl - threshold) / Math.max(tvl, threshold)
}

// =============================================================================
// Protocol Fallback Questions
// =============================================================================

export const QUANTITATIVE_PROTOCOL_FALLBACKS: QuantitativeFallback[] = [
  // ---------------------------------------------------------------------------
  // TVL Threshold Questions (varying difficulty based on threshold)
  // ---------------------------------------------------------------------------
  {
    id: "protocol_tvl_above_100m",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $100M in TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 100_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 100_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$100M",
      comparison: (ctx.derived.currentTvl ?? 0) > 100_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 100_000_000),
  },
  {
    id: "protocol_tvl_above_500m",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $500M in TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 500_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 500_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$500M",
      comparison: (ctx.derived.currentTvl ?? 0) > 500_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 500_000_000),
  },
  {
    id: "protocol_tvl_above_1b",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $1B in TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 1_000_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 1_000_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$1B",
      comparison: (ctx.derived.currentTvl ?? 0) > 1_000_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 1_000_000_000),
  },
  {
    id: "protocol_tvl_above_5b",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $5B in TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 5_000_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 5_000_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$5B",
      comparison: (ctx.derived.currentTvl ?? 0) > 5_000_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 5_000_000_000),
  },

  // ---------------------------------------------------------------------------
  // Trend-Based Questions
  // ---------------------------------------------------------------------------
  {
    id: "protocol_tvl_increased_7d",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) => `${ctx.topic.name}'s TVL increased over the past 7 days.`,
    getAnswerIndex: (ctx) => (ctx.derived.change7d ?? 0) > 0 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.change7d ?? 0) > 0,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.change7d ?? 0),
      direction: (ctx.derived.change7d ?? 0) > 0 ? "increased" : "decreased",
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
    }),
    canUse: (ctx) =>
      ctx.derived.change7d !== undefined &&
      Math.abs(ctx.derived.change7d) > 0.01, // Avoid "flat" cases
    getMargin: (ctx) => Math.abs(ctx.derived.change7d ?? 0),
  },
  {
    id: "protocol_tvl_decreased_7d",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) => `${ctx.topic.name}'s TVL decreased over the past 7 days.`,
    getAnswerIndex: (ctx) => (ctx.derived.change7d ?? 0) < 0 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.change7d ?? 0) < 0,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.change7d ?? 0),
      direction: (ctx.derived.change7d ?? 0) < 0 ? "decreased" : "increased",
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
    }),
    canUse: (ctx) =>
      ctx.derived.change7d !== undefined &&
      Math.abs(ctx.derived.change7d) > 0.01,
    getMargin: (ctx) => Math.abs(ctx.derived.change7d ?? 0),
  },
  {
    id: "protocol_tvl_up_5pct",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) =>
      `${ctx.topic.name}'s TVL increased by more than 5% over the past week.`,
    getAnswerIndex: (ctx) => (ctx.derived.change7d ?? 0) > 0.05 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.change7d ?? 0) > 0.05,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.change7d ?? 0),
      threshold: "5%",
      comparison: (ctx.derived.change7d ?? 0) > 0.05 ? "exceeded" : "did not reach",
    }),
    canUse: (ctx) => ctx.derived.change7d !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.change7d ?? 0) - 0.05),
  },
  {
    id: "protocol_tvl_down_5pct",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) =>
      `${ctx.topic.name}'s TVL dropped by more than 5% over the past week.`,
    getAnswerIndex: (ctx) => (ctx.derived.change7d ?? 0) < -0.05 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.change7d ?? 0) < -0.05,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.change7d ?? 0),
      threshold: "5%",
      comparison:
        (ctx.derived.change7d ?? 0) < -0.05 ? "dropped more than" : "did not drop by",
    }),
    canUse: (ctx) => ctx.derived.change7d !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.change7d ?? 0) + 0.05),
  },

  // ---------------------------------------------------------------------------
  // Rank-Based Questions
  // ---------------------------------------------------------------------------
  {
    id: "protocol_rank_top_10",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_rank"],
    getPrompt: (ctx) =>
      `${ctx.topic.name} is ranked in the top 10 protocols by TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.tvlRank ?? 999) <= 10 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.tvlRank ?? 999) <= 10,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived.tvlRank,
      threshold: 10,
      comparison: (ctx.derived.tvlRank ?? 999) <= 10 ? "within" : "outside",
    }),
    canUse: (ctx) => ctx.derived.tvlRank !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.tvlRank ?? 999) - 10) / 50,
  },
  {
    id: "protocol_rank_top_25",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_rank"],
    getPrompt: (ctx) =>
      `${ctx.topic.name} is ranked in the top 25 protocols by TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.tvlRank ?? 999) <= 25 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.tvlRank ?? 999) <= 25,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived.tvlRank,
      threshold: 25,
      comparison: (ctx.derived.tvlRank ?? 999) <= 25 ? "within" : "outside",
    }),
    canUse: (ctx) => ctx.derived.tvlRank !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.tvlRank ?? 999) - 25) / 50,
  },
  {
    id: "protocol_rank_top_50",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_rank"],
    getPrompt: (ctx) =>
      `${ctx.topic.name} is ranked in the top 50 protocols by TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.tvlRank ?? 999) <= 50 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.tvlRank ?? 999) <= 50,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived.tvlRank,
      threshold: 50,
      comparison: (ctx.derived.tvlRank ?? 999) <= 50 ? "within" : "outside",
    }),
    canUse: (ctx) => ctx.derived.tvlRank !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.tvlRank ?? 999) - 50) / 100,
  },

  // ---------------------------------------------------------------------------
  // Chain Count Questions
  // ---------------------------------------------------------------------------
  {
    id: "protocol_chains_above_3",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["chain_count"],
    getPrompt: (ctx) =>
      `${ctx.topic.name} is deployed on more than 3 blockchains.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainCount ?? 0) > 3 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainCount ?? 0) > 3,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      chainCount: ctx.derived.chainCount,
      threshold: 3,
      comparison: (ctx.derived.chainCount ?? 0) > 3 ? "more than" : "3 or fewer",
    }),
    canUse: (ctx) => ctx.derived.chainCount !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainCount ?? 0) - 3) / 10,
  },
  {
    id: "protocol_chains_above_5",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["chain_count"],
    getPrompt: (ctx) =>
      `${ctx.topic.name} is deployed on more than 5 blockchains.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainCount ?? 0) > 5 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainCount ?? 0) > 5,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      chainCount: ctx.derived.chainCount,
      threshold: 5,
      comparison: (ctx.derived.chainCount ?? 0) > 5 ? "more than" : "5 or fewer",
    }),
    canUse: (ctx) => ctx.derived.chainCount !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainCount ?? 0) - 5) / 10,
  },
  {
    id: "protocol_chains_above_10",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["chain_count"],
    getPrompt: (ctx) =>
      `${ctx.topic.name} is deployed on more than 10 blockchains.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainCount ?? 0) > 10 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainCount ?? 0) > 10,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      chainCount: ctx.derived.chainCount,
      threshold: 10,
      comparison: (ctx.derived.chainCount ?? 0) > 10 ? "more than" : "10 or fewer",
    }),
    canUse: (ctx) => ctx.derived.chainCount !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainCount ?? 0) - 10) / 20,
  },

  // ---------------------------------------------------------------------------
  // A/B Comparison Questions
  // ---------------------------------------------------------------------------
  {
    id: "protocol_compare_nearby",
    difficulty: "medium",
    format: "ab",
    semanticTopics: ["tvl_absolute"],
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
        winnerTvl: formatTvl(Math.max(topicTvl, nearbyTvl)),
        loserTvl: formatTvl(Math.min(topicTvl, nearbyTvl)),
        marginPercent: (margin * 100).toFixed(1),
      }
    },
    canUse: (ctx) =>
      ctx.derived.nearbyProtocols !== undefined &&
      ctx.derived.nearbyProtocols.length > 0,
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
        winnerTvl: formatTvl(Math.max(topicTvl, otherTvl)),
        loserTvl: formatTvl(Math.min(topicTvl, otherTvl)),
        category: topic.category,
      }
    },
    canUse: (ctx) =>
      isProtocolTopic(ctx.topic) &&
      ctx.derived.categoryProtocols !== undefined &&
      ctx.derived.categoryProtocols.length > 0,
    getMargin: (ctx) => {
      const categoryProtocol = ctx.derived.categoryProtocols?.[0]
      if (!categoryProtocol) return null
      const topicTvl = ctx.derived.currentTvl ?? 0
      return Math.abs(topicTvl - categoryProtocol.tvl) / Math.max(topicTvl, categoryProtocol.tvl)
    },
  },
]

// =============================================================================
// Chain Fallback Questions
// =============================================================================

export const QUANTITATIVE_CHAIN_FALLBACKS: QuantitativeFallback[] = [
  // ---------------------------------------------------------------------------
  // TVL Threshold Questions
  // ---------------------------------------------------------------------------
  {
    id: "chain_tvl_above_100m",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $100M in total TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 100_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 100_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$100M",
      comparison: (ctx.derived.currentTvl ?? 0) > 100_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 100_000_000),
  },
  {
    id: "chain_tvl_above_500m",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $500M in total TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 500_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 500_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$500M",
      comparison: (ctx.derived.currentTvl ?? 0) > 500_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 500_000_000),
  },
  {
    id: "chain_tvl_above_1b",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $1B in total TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 1_000_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 1_000_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$1B",
      comparison: (ctx.derived.currentTvl ?? 0) > 1_000_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 1_000_000_000),
  },
  {
    id: "chain_tvl_above_5b",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $5B in total TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 5_000_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 5_000_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$5B",
      comparison: (ctx.derived.currentTvl ?? 0) > 5_000_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 5_000_000_000),
  },
  {
    id: "chain_tvl_above_10b",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_absolute"],
    getPrompt: (ctx) => `${ctx.topic.name} has more than $10B in total TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.currentTvl ?? 0) > 10_000_000_000 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > 10_000_000_000,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
      threshold: "$10B",
      comparison: (ctx.derived.currentTvl ?? 0) > 10_000_000_000 ? "above" : "below",
    }),
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, 10_000_000_000),
  },

  // ---------------------------------------------------------------------------
  // Trend-Based Questions
  // ---------------------------------------------------------------------------
  {
    id: "chain_tvl_increased_30d",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) => `${ctx.topic.name}'s TVL increased over the past 30 days.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainChange30d ?? 0) > 0 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainChange30d ?? 0) > 0,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.chainChange30d ?? 0),
      direction: (ctx.derived.chainChange30d ?? 0) > 0 ? "increased" : "decreased",
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
    }),
    canUse: (ctx) =>
      ctx.derived.chainChange30d !== undefined &&
      Math.abs(ctx.derived.chainChange30d) > 0.01,
    getMargin: (ctx) => Math.abs(ctx.derived.chainChange30d ?? 0),
  },
  {
    id: "chain_tvl_decreased_30d",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) => `${ctx.topic.name}'s TVL decreased over the past 30 days.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainChange30d ?? 0) < 0 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainChange30d ?? 0) < 0,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.chainChange30d ?? 0),
      direction: (ctx.derived.chainChange30d ?? 0) < 0 ? "decreased" : "increased",
      tvl: formatTvl(ctx.derived.currentTvl ?? 0),
    }),
    canUse: (ctx) =>
      ctx.derived.chainChange30d !== undefined &&
      Math.abs(ctx.derived.chainChange30d) > 0.01,
    getMargin: (ctx) => Math.abs(ctx.derived.chainChange30d ?? 0),
  },
  {
    id: "chain_tvl_up_10pct",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) =>
      `${ctx.topic.name}'s TVL increased by more than 10% over the past month.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainChange30d ?? 0) > 0.1 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainChange30d ?? 0) > 0.1,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.chainChange30d ?? 0),
      threshold: "10%",
      comparison: (ctx.derived.chainChange30d ?? 0) > 0.1 ? "exceeded" : "did not reach",
    }),
    canUse: (ctx) => ctx.derived.chainChange30d !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainChange30d ?? 0) - 0.1),
  },
  {
    id: "chain_tvl_down_10pct",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_trend"],
    getPrompt: (ctx) =>
      `${ctx.topic.name}'s TVL dropped by more than 10% over the past month.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainChange30d ?? 0) < -0.1 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainChange30d ?? 0) < -0.1,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChange(ctx.derived.chainChange30d ?? 0),
      threshold: "10%",
      comparison:
        (ctx.derived.chainChange30d ?? 0) < -0.1 ? "dropped more than" : "did not drop by",
    }),
    canUse: (ctx) => ctx.derived.chainChange30d !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainChange30d ?? 0) + 0.1),
  },

  // ---------------------------------------------------------------------------
  // Rank-Based Questions
  // ---------------------------------------------------------------------------
  {
    id: "chain_rank_top_5",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_rank"],
    getPrompt: (ctx) => `${ctx.topic.name} is ranked in the top 5 chains by TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainTvlRank ?? 999) <= 5 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainTvlRank ?? 999) <= 5,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived.chainTvlRank,
      threshold: 5,
      comparison: (ctx.derived.chainTvlRank ?? 999) <= 5 ? "within" : "outside",
    }),
    canUse: (ctx) => ctx.derived.chainTvlRank !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainTvlRank ?? 999) - 5) / 20,
  },
  {
    id: "chain_rank_top_10",
    difficulty: "easy",
    format: "tf",
    semanticTopics: ["tvl_rank"],
    getPrompt: (ctx) => `${ctx.topic.name} is ranked in the top 10 chains by TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainTvlRank ?? 999) <= 10 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainTvlRank ?? 999) <= 10,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived.chainTvlRank,
      threshold: 10,
      comparison: (ctx.derived.chainTvlRank ?? 999) <= 10 ? "within" : "outside",
    }),
    canUse: (ctx) => ctx.derived.chainTvlRank !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainTvlRank ?? 999) - 10) / 30,
  },
  {
    id: "chain_rank_top_20",
    difficulty: "medium",
    format: "tf",
    semanticTopics: ["tvl_rank"],
    getPrompt: (ctx) => `${ctx.topic.name} is ranked in the top 20 chains by TVL.`,
    getAnswerIndex: (ctx) => (ctx.derived.chainTvlRank ?? 999) <= 20 ? 0 : 1,
    getAnswerValue: (ctx) => (ctx.derived.chainTvlRank ?? 999) <= 20,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived.chainTvlRank,
      threshold: 20,
      comparison: (ctx.derived.chainTvlRank ?? 999) <= 20 ? "within" : "outside",
    }),
    canUse: (ctx) => ctx.derived.chainTvlRank !== undefined,
    getMargin: (ctx) => Math.abs((ctx.derived.chainTvlRank ?? 999) - 20) / 30,
  },

  // ---------------------------------------------------------------------------
  // A/B Comparison Questions
  // ---------------------------------------------------------------------------
  {
    id: "chain_compare_nearby",
    difficulty: "medium",
    format: "ab",
    semanticTopics: ["tvl_absolute"],
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
        winnerTvl: formatTvl(Math.max(topicTvl, nearbyTvl)),
        loserTvl: formatTvl(Math.min(topicTvl, nearbyTvl)),
        marginPercent: (margin * 100).toFixed(1),
      }
    },
    canUse: (ctx) =>
      ctx.derived.nearbyChains !== undefined && ctx.derived.nearbyChains.length > 0,
    getMargin: (ctx) => {
      const nearby = ctx.derived.nearbyChains?.[0]
      if (!nearby) return null
      const topicTvl = ctx.derived.currentTvl ?? 0
      return Math.abs(topicTvl - nearby.tvl) / Math.max(topicTvl, nearby.tvl)
    },
  },
]

// =============================================================================
// Constants for margin filtering
// =============================================================================

/**
 * Minimum margin required for T/F questions in hard slots.
 * Questions with margins above this threshold are considered "too easy" for hard slots.
 * For example, asking "Does Bitcoin have $5B TVL?" when it has $6.9B is trivially easy (38% margin).
 */
const MAX_TF_MARGIN_FOR_HARD_SLOT = 0.25

// =============================================================================
// Selection Functions
// =============================================================================

/**
 * Get fallbacks for a specific episode type and difficulty target
 */
export function getFallbacksForTarget(
  episodeType: "protocol" | "chain",
  target: DifficultyTarget
): QuantitativeFallback[] {
  const fallbacks =
    episodeType === "protocol"
      ? QUANTITATIVE_PROTOCOL_FALLBACKS
      : QUANTITATIVE_CHAIN_FALLBACKS

  // Fallbacks should only be easy or medium - hard slots get medium fallbacks
  const targetDifficulty = target === "hard" ? "medium" : target

  return fallbacks.filter((fb) => fb.difficulty === targetDifficulty)
}

/**
 * Get all available fallbacks for an episode type
 */
export function getAllFallbacks(
  episodeType: "protocol" | "chain"
): QuantitativeFallback[] {
  return episodeType === "protocol"
    ? QUANTITATIVE_PROTOCOL_FALLBACKS
    : QUANTITATIVE_CHAIN_FALLBACKS
}

/**
 * Select a fallback question for a slot
 * 
 * For hard slots, we prefer A/B comparison fallbacks over T/F threshold questions.
 * A/B comparisons are more engaging and avoid the issue of trivially obvious
 * threshold questions (e.g., "Does X have $5B TVL?" when X has $173M).
 * 
 * Additionally, T/F questions with high margins (>25%) are filtered out for hard slots
 * since they're trivially easy.
 */
export function selectQuantitativeFallback(
  ctx: TemplateContext,
  target: DifficultyTarget,
  seed: number,
  usedPrompts?: Set<string>,
  usedSemanticTopics?: Set<string>
): { draft: QuestionDraft; semanticTopics: string[] } | null {
  const rng = createRng(seed)

  // Get fallbacks matching the target difficulty
  let fallbacks = getFallbacksForTarget(ctx.episodeType, target)

  // Filter to usable fallbacks (check canUse, prompt dedup, semantic topic dedup)
  let available = fallbacks.filter((fb) => {
    if (!fb.canUse(ctx)) return false
    const prompt = fb.getPrompt(ctx)
    if (usedPrompts?.has(prompt)) return false
    // Check if any of this fallback's semantic topics are already used
    if (usedSemanticTopics && fb.semanticTopics.some(t => usedSemanticTopics.has(t))) {
      return false
    }
    return true
  })

  // For hard slots, apply additional filtering
  if (target === "hard") {
    // Filter out T/F questions with high margins (too easy)
    available = available.filter((fb) => {
      if (fb.format !== "tf") return true // A/B questions are fine
      const margin = fb.getMargin?.(ctx)
      if (margin === null || margin === undefined) return true // No margin info, allow it
      return margin <= MAX_TF_MARGIN_FOR_HARD_SLOT
    })
  }

  // If no fallbacks match target difficulty, try all fallbacks
  if (available.length === 0) {
    fallbacks = getAllFallbacks(ctx.episodeType)
    available = fallbacks.filter((fb) => {
      if (!fb.canUse(ctx)) return false
      const prompt = fb.getPrompt(ctx)
      if (usedPrompts?.has(prompt)) return false
      if (usedSemanticTopics && fb.semanticTopics.some(t => usedSemanticTopics.has(t))) {
        return false
      }
      // Still apply margin filtering for hard slots
      if (target === "hard" && fb.format === "tf") {
        const margin = fb.getMargin?.(ctx)
        if (margin !== null && margin !== undefined && margin > MAX_TF_MARGIN_FOR_HARD_SLOT) {
          return false
        }
      }
      return true
    })
  }

  // If still nothing, try without prompt deduplication but keep semantic topic dedup
  if (available.length === 0) {
    available = fallbacks.filter((fb) => {
      if (!fb.canUse(ctx)) return false
      if (usedSemanticTopics && fb.semanticTopics.some(t => usedSemanticTopics.has(t))) {
        return false
      }
      return true
    })
  }

  // If absolutely nothing works, return null
  if (available.length === 0) {
    return null
  }

  // For hard slots, strongly prefer A/B comparison fallbacks over T/F threshold questions.
  // A/B comparisons are more engaging and avoid trivially obvious threshold questions
  // (e.g., asking "Does Stellar have $5B TVL?" when it has $173M).
  let selected: QuantitativeFallback
  if (target === "hard") {
    const abFallbacks = available.filter((fb) => fb.format === "ab")
    if (abFallbacks.length > 0) {
      // Prefer A/B fallbacks for hard slots
      const index = Math.floor(rng() * abFallbacks.length)
      selected = abFallbacks[index]
    } else {
      // Fall back to any available if no A/B options
      const index = Math.floor(rng() * available.length)
      selected = available[index]
    }
  } else {
    // For easy/medium slots, random selection is fine
    const index = Math.floor(rng() * available.length)
    selected = available[index]
  }

  // Build the question draft
  const prompt = selected.getPrompt(ctx)
  const explainData = selected.getExplainData(ctx)
  const answerIndex = selected.getAnswerIndex(ctx)
  const margin = selected.getMargin?.(ctx) ?? 0.5

  if (selected.format === "ab") {
    const choices = selected.getChoices?.(ctx) ?? []
    return {
      draft: {
        templateId: `FALLBACK_${selected.id.toUpperCase()}`,
        format: "ab",
        prompt,
        choices,
        answerIndex,
        signals: {
          format: "ab",
          familiarityRankBucket: ctx.derived.tvlRankBucket ?? "top_100",
          margin,
          volatility: 0,
        },
        explainData,
        buildNotes: [`Selected quantitative fallback: ${selected.id}`],
      },
      semanticTopics: selected.semanticTopics,
    }
  }

  // True/False format
  const answerValue = selected.getAnswerValue?.(ctx) ?? answerIndex === 0
  return {
    draft: {
      templateId: `FALLBACK_${selected.id.toUpperCase()}`,
      format: "tf",
      prompt,
      choices: ["True", "False"],
      answerIndex,
      answerValue,
      signals: {
        format: "tf",
        familiarityRankBucket: ctx.derived.tvlRankBucket ?? "top_100",
        margin,
        volatility: 0,
      },
      explainData,
      buildNotes: [`Selected quantitative fallback: ${selected.id}`],
    },
    semanticTopics: selected.semanticTopics,
  }
}
