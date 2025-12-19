/**
 * Declarative Template Configuration System
 *
 * This module provides a declarative way to define question templates.
 * Instead of writing ~150 line classes, templates are defined as ~30-50 line configs.
 *
 * Benefits:
 * - Reduction in template code
 * - Single source of truth (config IS the documentation)
 * - Consistent structure across all templates
 * - Easier testing and validation
 * - Unified system for templates and fallbacks
 */

import type {
  QuestionFormat,
  QuestionDraft,
  TemplateContext,
  DifficultySignals,
  FamiliarityRankBucket,
} from "@/lib/types/episode"
import type { Template } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"

// =============================================================================
// Core Types
// =============================================================================

/**
 * Episode type the template applies to
 */
export type TemplateType = "protocol" | "chain" | "both"

/**
 * Prerequisite check result
 */
export interface PrereqResult {
  passed: boolean
  reason?: string
}

/**
 * Base type for extracted data - any object with string keys
 * Using a more permissive type to allow specific interfaces
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtractedData = Record<string, any>

/**
 * Declarative template configuration
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TemplateConfig<T extends Record<string, any> = Record<string, any>> {
  /** Unique template identifier (e.g., "P1_FINGERPRINT") */
  id: string

  /** Human-readable template name */
  name: string

  /** Short description for auto-generated docs */
  description: string

  /** Episode type this template applies to */
  type: TemplateType

  /** Semantic topics this template covers (for deduplication) */
  semanticTopics: string[]

  /** Whether this template can be used multiple times in an episode */
  allowReuse?: boolean

  /**
   * Check if template prerequisites are met.
   * Return { passed: true } if the template can be used.
   * Return { passed: false, reason: "..." } if not.
   */
  checkPrereqs: (ctx: TemplateContext) => PrereqResult

  /**
   * Return formats to try, in preference order.
   * Most specific/harder format first, with fallbacks.
   * Can return empty array if no format is suitable for current context.
   */
  getFormats: (ctx: TemplateContext) => QuestionFormat[]

  /**
   * Extract the data needed for question generation.
   * This is the "heavy lifting" - pulling specific values from the context.
   * Returns null if extraction fails.
   */
  extract: (ctx: TemplateContext, seed: number) => T | null

  /**
   * Generate the question prompt for a given format.
   */
  getPrompt: (data: T, ctx: TemplateContext, format: QuestionFormat) => string

  /**
   * Generate clues (for fingerprint-style questions).
   * Return undefined if this template doesn't use clues.
   */
  getClues?: (data: T, ctx: TemplateContext) => string[] | undefined

  /**
   * Generate answer choices for a given format.
   * For TF format, this should return ["True", "False"].
   */
  getChoices: (
    data: T,
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ) => string[]

  /**
   * Determine the correct answer index in the choices array.
   */
  getAnswerIndex: (
    data: T,
    ctx: TemplateContext,
    format: QuestionFormat,
    choices: string[]
  ) => number

  /**
   * For TF format, return the boolean answer value.
   * Optional - only needed for TF questions.
   */
  getAnswerValue?: (data: T, ctx: TemplateContext) => boolean

  /**
   * Calculate the margin for difficulty scoring.
   * Return null if not applicable (e.g., fingerprint questions).
   */
  getMargin: (data: T, ctx: TemplateContext, format: QuestionFormat) => number | null

  /**
   * Get structured data for explanation generation.
   * This data is passed to the LLM to generate explanations.
   */
  getExplainData: (
    data: T,
    ctx: TemplateContext,
    format: QuestionFormat,
    choices: string[],
    answerIndex: number
  ) => Record<string, unknown>

  /**
   * Generate build notes for debugging.
   */
  getBuildNotes?: (
    data: T,
    ctx: TemplateContext,
    format: QuestionFormat
  ) => string[]

  /**
   * Compute dynamic semantic topics based on extracted data.
   * 
   * Called after instantiation to determine which semantic topics were actually
   * covered by this question. Used for templates like fingerprint that reveal
   * different information based on topic familiarity.
   * 
   * If not provided, returns the static semanticTopics array.
   */
  getDynamicSemanticTopics?: (
    data: T,
    ctx: TemplateContext
  ) => string[]
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Template implementation from a declarative config.
 *
 * This factory converts a TemplateConfig into the Template interface
 * that the slot selection system expects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTemplate<T extends Record<string, any>>(
  config: TemplateConfig<T>
): Template {
  // Cache for the most recently extracted data, keyed by seed
  // This allows getSemanticTopics to access the extracted data after instantiation
  let lastExtractedData: { seed: number; data: T } | null = null

  return {
    id: config.id,
    name: config.name,
    allowReuse: config.allowReuse,
    semanticTopics: config.semanticTopics,

    checkPrereqs(ctx: TemplateContext): boolean {
      // Check episode type
      if (config.type !== "both") {
        if (ctx.episodeType !== config.type) return false
      }

      const result = config.checkPrereqs(ctx)
      return result.passed
    },

    proposeFormats(ctx: TemplateContext): QuestionFormat[] {
      return config.getFormats(ctx)
    },

    instantiate(
      ctx: TemplateContext,
      format: QuestionFormat,
      seed: number
    ): QuestionDraft | null {
      // Extract data
      const data = config.extract(ctx, seed)
      if (!data) return null

      // Cache extracted data for getSemanticTopics
      lastExtractedData = { seed, data }

      // Generate question components
      const prompt = config.getPrompt(data, ctx, format)
      const clues = config.getClues?.(data, ctx)
      const choices = config.getChoices(data, ctx, format, seed)
      const answerIndex = config.getAnswerIndex(data, ctx, format, choices)
      const answerValue =
        format === "tf" ? config.getAnswerValue?.(data, ctx) : undefined
      const margin = config.getMargin(data, ctx, format)
      const explainData = config.getExplainData(
        data,
        ctx,
        format,
        choices,
        answerIndex
      )
      const buildNotes = config.getBuildNotes?.(data, ctx, format) ?? []

      // Build signals for difficulty calculation
      const signals: DifficultySignals = {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank) as FamiliarityRankBucket,
        margin,
        volatility: ctx.derived.tvlVolatility ?? null,
      }

      const draft: QuestionDraft = {
        templateId: config.id,
        format,
        prompt,
        choices,
        answerIndex,
        signals,
        explainData,
        buildNotes,
      }

      if (clues) draft.clues = clues
      if (answerValue !== undefined) draft.answerValue = answerValue

      return draft
    },

    // Dynamic semantic topics support
    getSemanticTopics(ctx: TemplateContext): string[] {
      // If template has dynamic semantic topics function and we have extracted data
      if (config.getDynamicSemanticTopics && lastExtractedData) {
        return config.getDynamicSemanticTopics(lastExtractedData.data, ctx)
      }
      // Fall back to static semantic topics
      return config.semanticTopics ?? []
    },
  }
}

// =============================================================================
// Common Prerequisite Helpers
// =============================================================================

/**
 * Check if context is for a protocol episode
 */
export function isProtocolContext(ctx: TemplateContext): boolean {
  return ctx.episodeType === "protocol"
}

/**
 * Check if context is for a chain episode
 */
export function isChainContext(ctx: TemplateContext): boolean {
  return ctx.episodeType === "chain"
}

/**
 * Check if protocol has minimum number of chains
 */
export function hasMinChains(ctx: TemplateContext, min: number): boolean {
  const detail = ctx.data.protocolDetail
  if (!detail?.currentChainTvls) return false

  // Import isActualChain dynamically to avoid circular deps
  const { filterToActualChains } = require("../chain-filter")
  const actualChains = filterToActualChains(detail.currentChainTvls)
  return actualChains.length >= min
}

/**
 * Check if protocol has fees data
 */
export function hasFeesData(ctx: TemplateContext): boolean {
  const fees = ctx.data.protocolFees
  return fees?.total7d !== undefined && fees.total7d > 0
}

/**
 * Check if protocol has revenue data
 */
export function hasRevenueData(ctx: TemplateContext): boolean {
  const revenue = ctx.data.protocolRevenue
  return revenue?.total7d !== undefined && revenue.total7d > 0
}

/**
 * Check if chain has sufficient history
 */
export function hasMinChainHistory(ctx: TemplateContext, days: number): boolean {
  const history = ctx.data.chainHistory
  if (!history || history.length < 2) return false

  const firstDate = history[0].date
  const lastDate = history[history.length - 1].date
  const historyDays = Math.floor((lastDate - firstDate) / 86400)
  return historyDays >= days
}

/**
 * Check if protocol has sufficient TVL history
 */
export function hasMinProtocolHistory(ctx: TemplateContext, days: number): boolean {
  const detail = ctx.data.protocolDetail
  if (!detail?.tvl || detail.tvl.length < 2) return false

  const firstDate = detail.tvl[0].date
  const lastDate = detail.tvl[detail.tvl.length - 1].date
  const historyDays = Math.floor((lastDate - firstDate) / 86400)
  return historyDays >= days
}

/**
 * Check if chain has fees data
 */
export function hasChainFeesData(ctx: TemplateContext): boolean {
  const fees = ctx.data.chainFees
  return fees?.protocols !== undefined && fees.protocols.length > 0
}

/**
 * Check if chain has DEX volume data
 */
export function hasChainDexData(ctx: TemplateContext): boolean {
  const dex = ctx.data.chainDexVolume
  return dex?.protocols !== undefined && dex.protocols.length > 0
}

/**
 * Check if chain pool is available with minimum entries
 */
export function hasChainPool(ctx: TemplateContext, min: number = 4): boolean {
  return ctx.data.chainPool !== undefined && ctx.data.chainPool.length >= min
}

/**
 * Check if protocol list is available with minimum entries
 */
export function hasProtocolList(ctx: TemplateContext, min: number = 6): boolean {
  return ctx.data.protocolList !== undefined && ctx.data.protocolList.length >= min
}

// =============================================================================
// Common Format Helpers
// =============================================================================

/**
 * Standard format selection based on TVL rank
 * Higher rank protocols get harder formats (mc6), lower rank get easier (mc4)
 */
export function standardFormats(
  ctx: TemplateContext,
  options: {
    hard?: QuestionFormat[]
    medium?: QuestionFormat[]
    easy?: QuestionFormat[]
  } = {}
): QuestionFormat[] {
  const rank = ctx.topic.tvlRank
  const hard = options.hard ?? ["mc6", "mc4"]
  const medium = options.medium ?? ["mc4"]
  const easy = options.easy ?? ["mc4", "ab"]

  if (rank <= 25) return hard
  if (rank <= 50) return medium
  return easy
}

/**
 * A/B format with optional TF degradation based on margin
 */
export function abFormats(margin: number | null): QuestionFormat[] {
  if (margin !== null && margin < 0.15) {
    return ["tf"]
  }
  return ["ab", "tf"]
}

// =============================================================================
// Fallback Configuration Types
// =============================================================================

/**
 * Difficulty target for fallback questions
 * Fallbacks should only be easy or medium - hard slots get medium fallbacks
 */
export type FallbackDifficulty = "easy" | "medium"

/**
 * Declarative fallback configuration
 *
 * Fallbacks are simpler than templates - they:
 * - Have a single fixed format (tf or ab)
 * - Read directly from ctx.derived instead of extracting data
 * - Are used as last-resort questions when templates fail
 */
export interface FallbackConfig {
  /** Unique fallback identifier (e.g., "protocol_tvl_above_100m") */
  id: string

  /** Target difficulty range */
  difficulty: FallbackDifficulty

  /** Question format (tf or ab) */
  format: QuestionFormat

  /** Semantic topics covered (for deduplication) */
  semanticTopics: string[]

  /** Check if this fallback can be used given the context */
  canUse: (ctx: TemplateContext) => boolean

  /** Generate the question prompt */
  getPrompt: (ctx: TemplateContext) => string

  /** Get the choices (for ab format). TF format uses ["True", "False"] automatically */
  getChoices?: (ctx: TemplateContext) => string[]

  /** Determine the correct answer index */
  getAnswerIndex: (ctx: TemplateContext) => number

  /** Get the boolean answer value (for tf format) */
  getAnswerValue?: (ctx: TemplateContext) => boolean

  /** Get structured data for explanation generation */
  getExplainData: (ctx: TemplateContext) => Record<string, unknown>

  /** Get the margin for difficulty filtering. Returns null if not applicable */
  getMargin?: (ctx: TemplateContext) => number | null
}

// =============================================================================
// Fallback Builder Helpers
// =============================================================================

/**
 * Helper to create TVL threshold fallbacks
 * Reduces boilerplate for the common "has more than $X TVL" pattern
 */
export function createTvlThresholdFallback(options: {
  id: string
  difficulty: FallbackDifficulty
  threshold: number
  thresholdLabel: string
  semanticTopics?: string[]
  /** Custom prompt builder. Default: "{name} has more than {threshold} in TVL." */
  promptBuilder?: (name: string, threshold: string) => string
}): FallbackConfig {
  const { id, difficulty, threshold, thresholdLabel, semanticTopics = ["tvl_absolute"] } = options
  const promptBuilder = options.promptBuilder ?? ((name, t) => `${name} has more than ${t} in TVL.`)

  return {
    id,
    difficulty,
    format: "tf",
    semanticTopics,
    canUse: (ctx) => ctx.derived.currentTvl !== undefined,
    getPrompt: (ctx) => promptBuilder(ctx.topic.name, thresholdLabel),
    getAnswerIndex: (ctx) => ((ctx.derived.currentTvl ?? 0) > threshold ? 0 : 1),
    getAnswerValue: (ctx) => (ctx.derived.currentTvl ?? 0) > threshold,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: formatTvlValue(ctx.derived.currentTvl ?? 0),
      threshold: thresholdLabel,
      comparison: (ctx.derived.currentTvl ?? 0) > threshold ? "above" : "below",
    }),
    getMargin: (ctx) => getTvlThresholdMargin(ctx.derived.currentTvl ?? 0, threshold),
  }
}

/**
 * Helper to create rank threshold fallbacks
 * Reduces boilerplate for the common "is in top X" pattern
 */
export function createRankThresholdFallback(options: {
  id: string
  difficulty: FallbackDifficulty
  threshold: number
  rankField: "tvlRank" | "chainTvlRank"
  semanticTopics?: string[]
  entityType: "protocols" | "chains"
}): FallbackConfig {
  const {
    id,
    difficulty,
    threshold,
    rankField,
    semanticTopics = ["tvl_rank"],
    entityType,
  } = options

  return {
    id,
    difficulty,
    format: "tf",
    semanticTopics,
    canUse: (ctx) => ctx.derived[rankField] !== undefined,
    getPrompt: (ctx) =>
      `${ctx.topic.name} is ranked in the top ${threshold} ${entityType} by TVL.`,
    getAnswerIndex: (ctx) => ((ctx.derived[rankField] ?? 999) <= threshold ? 0 : 1),
    getAnswerValue: (ctx) => (ctx.derived[rankField] ?? 999) <= threshold,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      rank: ctx.derived[rankField],
      threshold,
      comparison: (ctx.derived[rankField] ?? 999) <= threshold ? "within" : "outside",
    }),
    getMargin: (ctx) => {
      const divisor = entityType === "protocols" ? 50 : 30
      return Math.abs((ctx.derived[rankField] ?? 999) - threshold) / divisor
    },
  }
}

/**
 * Helper to create trend direction fallbacks
 * Reduces boilerplate for "TVL increased/decreased" pattern
 */
export function createTrendFallback(options: {
  id: string
  difficulty: FallbackDifficulty
  trendField: "change7d" | "chainChange30d"
  direction: "increased" | "decreased"
  semanticTopics?: string[]
  /** Time period description for the prompt */
  periodLabel: string
  /** Minimum absolute change to consider meaningful */
  minChange?: number
}): FallbackConfig {
  const {
    id,
    difficulty,
    trendField,
    direction,
    semanticTopics = ["tvl_trend"],
    periodLabel,
    minChange = 0.01,
  } = options

  const isIncrease = direction === "increased"

  return {
    id,
    difficulty,
    format: "tf",
    semanticTopics,
    canUse: (ctx) =>
      ctx.derived[trendField] !== undefined &&
      Math.abs(ctx.derived[trendField] ?? 0) > minChange,
    getPrompt: (ctx) =>
      `${ctx.topic.name}'s TVL ${direction} over ${periodLabel}.`,
    getAnswerIndex: (ctx) => {
      const change = ctx.derived[trendField] ?? 0
      const matches = isIncrease ? change > 0 : change < 0
      return matches ? 0 : 1
    },
    getAnswerValue: (ctx) => {
      const change = ctx.derived[trendField] ?? 0
      return isIncrease ? change > 0 : change < 0
    },
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChangeValue(ctx.derived[trendField] ?? 0),
      direction: (ctx.derived[trendField] ?? 0) > 0 ? "increased" : "decreased",
      tvl: formatTvlValue(ctx.derived.currentTvl ?? 0),
    }),
    getMargin: (ctx) => Math.abs(ctx.derived[trendField] ?? 0),
  }
}

/**
 * Helper to create trend threshold fallbacks
 * For "increased by more than X%" pattern
 */
export function createTrendThresholdFallback(options: {
  id: string
  difficulty: FallbackDifficulty
  trendField: "change7d" | "chainChange30d"
  threshold: number
  direction: "up" | "down"
  thresholdLabel: string
  periodLabel: string
  semanticTopics?: string[]
}): FallbackConfig {
  const {
    id,
    difficulty,
    trendField,
    threshold,
    direction,
    thresholdLabel,
    periodLabel,
    semanticTopics = ["tvl_trend"],
  } = options

  const isUp = direction === "up"
  const signedThreshold = isUp ? threshold : -threshold

  return {
    id,
    difficulty,
    format: "tf",
    semanticTopics,
    canUse: (ctx) => ctx.derived[trendField] !== undefined,
    getPrompt: (ctx) =>
      isUp
        ? `${ctx.topic.name}'s TVL increased by more than ${thresholdLabel} over ${periodLabel}.`
        : `${ctx.topic.name}'s TVL dropped by more than ${thresholdLabel} over ${periodLabel}.`,
    getAnswerIndex: (ctx) => {
      const change = ctx.derived[trendField] ?? 0
      const matches = isUp ? change > threshold : change < -threshold
      return matches ? 0 : 1
    },
    getAnswerValue: (ctx) => {
      const change = ctx.derived[trendField] ?? 0
      return isUp ? change > threshold : change < -threshold
    },
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      change: formatChangeValue(ctx.derived[trendField] ?? 0),
      threshold: thresholdLabel,
      comparison: (() => {
        const change = ctx.derived[trendField] ?? 0
        const met = isUp ? change > threshold : change < -threshold
        return met ? (isUp ? "exceeded" : "dropped more than") : "did not reach"
      })(),
    }),
    getMargin: (ctx) => Math.abs((ctx.derived[trendField] ?? 0) - signedThreshold),
  }
}

/**
 * Helper to create chain count fallbacks
 */
export function createChainCountFallback(options: {
  id: string
  difficulty: FallbackDifficulty
  threshold: number
}): FallbackConfig {
  const { id, difficulty, threshold } = options

  return {
    id,
    difficulty,
    format: "tf",
    semanticTopics: ["chain_count"],
    canUse: (ctx) => ctx.derived.chainCount !== undefined,
    getPrompt: (ctx) =>
      `${ctx.topic.name} is deployed on more than ${threshold} blockchains.`,
    getAnswerIndex: (ctx) => ((ctx.derived.chainCount ?? 0) > threshold ? 0 : 1),
    getAnswerValue: (ctx) => (ctx.derived.chainCount ?? 0) > threshold,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      chainCount: ctx.derived.chainCount,
      threshold,
      comparison: (ctx.derived.chainCount ?? 0) > threshold ? "more than" : `${threshold} or fewer`,
    }),
    getMargin: (ctx) => Math.abs((ctx.derived.chainCount ?? 0) - threshold) / 10,
  }
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * Format a number as a currency string (e.g., $1.2B, $450M)
 */
export function formatTvlValue(value: number): string {
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
export function formatChangeValue(change: number): string {
  const sign = change >= 0 ? "+" : ""
  return `${sign}${(change * 100).toFixed(1)}%`
}

/**
 * Calculate margin for TVL threshold questions.
 * Returns the relative distance from the threshold (0 = at threshold, 1 = far from threshold)
 */
export function getTvlThresholdMargin(tvl: number, threshold: number): number {
  if (tvl === 0) return 1
  return Math.abs(tvl - threshold) / Math.max(tvl, threshold)
}

// =============================================================================
// Export common utilities
// =============================================================================

export { getRankBucket }
