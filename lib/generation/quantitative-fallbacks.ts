/**
 * Quantitative Fallback Questions
 *
 * This module provides the selection logic for quantitative fallback questions.
 * The fallback configurations are defined declaratively in templates/fallbacks.ts.
 *
 * Key features:
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
import { createRng } from "./rng"
import {
  FallbackConfig,
  FallbackDifficulty,
} from "./templates/config"
import {
  PROTOCOL_FALLBACKS,
  CHAIN_FALLBACKS,
  getFallbacksForType,
} from "./templates/fallbacks"

// =============================================================================
// Re-export types for backward compatibility
// =============================================================================

export type { FallbackConfig as QuantitativeFallback }

// Re-export the fallback arrays for backward compatibility
export const QUANTITATIVE_PROTOCOL_FALLBACKS = PROTOCOL_FALLBACKS
export const QUANTITATIVE_CHAIN_FALLBACKS = CHAIN_FALLBACKS

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
): FallbackConfig[] {
  const fallbacks = getFallbacksForType(episodeType)

  // Fallbacks should only be easy or medium - hard slots get medium fallbacks
  const targetDifficulty: FallbackDifficulty = target === "hard" ? "medium" : target

  return fallbacks.filter((fb) => fb.difficulty === targetDifficulty)
}

/**
 * Get all available fallbacks for an episode type
 */
export function getAllFallbacks(
  episodeType: "protocol" | "chain"
): FallbackConfig[] {
  return getFallbacksForType(episodeType)
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
    if (usedSemanticTopics && fb.semanticTopics.some((t) => usedSemanticTopics.has(t))) {
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
      if (usedSemanticTopics && fb.semanticTopics.some((t) => usedSemanticTopics.has(t))) {
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
      if (usedSemanticTopics && fb.semanticTopics.some((t) => usedSemanticTopics.has(t))) {
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
  let selected: FallbackConfig
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
        format: "ab" as QuestionFormat,
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
      format: "tf" as QuestionFormat,
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
