/**
 * Text Generation Integration
 *
 * Integrates LLM client, caching, and fallbacks to generate
 * explanations for quiz questions.
 */

import type { QuestionDraft, Question, TemplateContext } from "@/lib/types/episode"
import {
  generateExplanation,
  isLLMAvailable,
  getLLMConfig,
} from "./client"
import {
  getCached,
  setCache,
  getLLMCacheKey,
  hashData,
} from "./cache"
import {
  generateFallbackExplanation,
  generateSimpleFallback,
} from "./fallbacks"
import { computeDifficulty, estimateTarget } from "@/lib/generation/difficulty"

// =============================================================================
// Types
// =============================================================================

export interface TextGenerationOptions {
  /** Skip LLM calls entirely (for testing) */
  skipLLM?: boolean
  /** Skip cache lookup (force regeneration) */
  skipCache?: boolean
  /** Enable verbose logging */
  verbose?: boolean
}

export interface TextGenerationResult {
  explanation: string
  llmFallback: boolean
  source: "cache" | "llm" | "fallback"
  error?: string
}

// =============================================================================
// Main Text Generation
// =============================================================================

/**
 * Generate explanation text for a single question
 *
 * This function:
 * 1. Checks cache for existing explanation
 * 2. Calls LLM if not cached and available
 * 3. Falls back to template if LLM fails
 * 4. Caches successful LLM results
 */
export async function generateQuestionExplanation(
  draft: QuestionDraft,
  ctx: TemplateContext,
  slot: string,
  options: TextGenerationOptions = {}
): Promise<TextGenerationResult> {
  const { skipLLM = false, skipCache = false, verbose = false } = options

  // Build cache key components
  const dataHash = hashData(draft.explainData as Record<string, unknown>)
  const cacheKey = getLLMCacheKey(
    ctx.date,
    ctx.episodeType,
    ctx.topic.slug,
    slot,
    draft.templateId,
    "explanation",
    dataHash
  )

  // 1. Check cache first (unless skipCache)
  if (!skipCache) {
    const cached = await getCached(ctx.date, cacheKey)
    if (cached) {
      if (verbose) {
        console.log(`  [${slot}] Cache hit for ${draft.templateId}`)
      }
      return {
        explanation: cached.text,
        llmFallback: false,
        source: "cache",
      }
    }
  }

  // 2. Try LLM if available
  if (!skipLLM && isLLMAvailable()) {
    if (verbose) {
      console.log(`  [${slot}] Calling LLM for ${draft.templateId}...`)
    }

    const result = await generateExplanation(
      draft.explainData as Record<string, unknown>,
      ctx.topic.name,
      draft.templateId
    )

    if (result.success && result.text) {
      // Cache the successful result
      await setCache(ctx.date, cacheKey, result.text, result.model)

      if (verbose) {
        console.log(`  [${slot}] LLM success: "${result.text.slice(0, 50)}..."`)
      }

      return {
        explanation: result.text,
        llmFallback: false,
        source: "llm",
      }
    }

    // LLM failed - log and continue to fallback
    if (verbose) {
      console.log(`  [${slot}] LLM failed: ${result.error}`)
    }
  }

  // 3. Fall back to template-based explanation
  if (verbose) {
    console.log(`  [${slot}] Using fallback for ${draft.templateId}`)
  }

  const fallbackText = generateFallbackExplanation(
    draft.templateId,
    draft.explainData as Record<string, unknown>
  )

  // Check if fallback has missing placeholders
  if (fallbackText.includes("[")) {
    // Some data was missing, use simple fallback
    const simpleText = generateSimpleFallback(
      ctx.topic.name,
      draft.templateId,
      ctx.date
    )
    return {
      explanation: simpleText,
      llmFallback: true,
      source: "fallback",
      error: "Template data incomplete",
    }
  }

  return {
    explanation: fallbackText,
    llmFallback: true,
    source: "fallback",
  }
}

/**
 * Generate explanations for all questions in an episode
 *
 * @param drafts - Question drafts with explainData
 * @param ctx - Template context with episode info
 * @param options - Generation options
 * @returns Questions with explanations and llmFallback flags
 */
export async function generateAllQuestionText(
  drafts: QuestionDraft[],
  slots: string[],
  ctx: TemplateContext,
  options: TextGenerationOptions = {}
): Promise<Question[]> {
  const { verbose = false } = options

  if (verbose) {
    const config = getLLMConfig()
    console.log("\nLLM Configuration:")
    console.log(`  Model: ${config.model}`)
    console.log(`  Timeout: ${config.timeoutMs}ms`)
    console.log(`  Max retries: ${config.maxRetries}`)
    console.log(`  Skip LLM: ${config.skipLLM}`)
    console.log(`  Has API key: ${config.hasApiKey}`)
    console.log()
  }

  if (verbose) {
    console.log("Generating explanations...")
  }

  const questions: Question[] = []

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]
    const slot = slots[i]

    const result = await generateQuestionExplanation(draft, ctx, slot, options)

    // Compute actual difficulty from signals, not from slot target
    const difficultyScore = computeDifficulty(draft.signals)
    const actualDifficulty = estimateTarget(difficultyScore)
    
    const question: Question = {
      qid: `q${i + 1}`,
      slot,
      templateId: draft.templateId,
      format: draft.format,
      prompt: draft.prompt,
      clues: draft.clues,
      choices: draft.choices,
      answerIndex: draft.answerIndex,
      answerValue: draft.answerValue,
      answerOrder: draft.answerOrder,
      explanation: result.explanation,
      difficulty: actualDifficulty, // Now based on actual score, not slot target
      llmFallback: result.llmFallback,
      signals: draft.signals,
    }

    questions.push(question)
  }

  // Log summary
  if (verbose) {
    const cacheHits = questions.filter(
      (q) => !q.llmFallback && !options.skipCache
    ).length
    const llmGenerated = questions.filter(
      (q) => !q.llmFallback
    ).length
    const fallbacks = questions.filter((q) => q.llmFallback).length

    console.log("\nExplanation generation summary:")
    console.log(`  Cache hits: ${cacheHits}`)
    console.log(`  LLM generated: ${llmGenerated - cacheHits}`)
    console.log(`  Fallbacks used: ${fallbacks}`)
  }

  return questions
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if LLM is configured and ready
 */
export function checkLLMReady(): {
  ready: boolean
  reason?: string
} {
  const config = getLLMConfig()

  if (config.skipLLM) {
    return { ready: false, reason: "SKIP_LLM is enabled" }
  }

  if (!config.hasApiKey) {
    return { ready: false, reason: "OPENAI_API_KEY not set" }
  }

  return { ready: true }
}
