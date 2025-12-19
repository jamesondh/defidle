/**
 * Post-Balance Pass
 *
 * Validates and adjusts episode questions after initial selection to ensure:
 * - Max 1 high-volatility question per episode
 * - Proper difficulty distribution
 * - No question quality issues
 * - No questions that are redundant with fingerprint clues
 */

import type {
  QuestionDraft,
  BuildLogEntry,
  TemplateContext,
} from "@/lib/types/episode"
import { getChangeBucketChoices, getChangeBucketIndex } from "./distractors"
import { computeDifficulty } from "./difficulty"

// Note: Fingerprint redundancy checking has been removed in favor of the
// semantic topic system which handles this during slot selection.
// See the comment on postBalancePass() for details.

/**
 * High volatility threshold - questions above this are considered high-vol
 */
const HIGH_VOLATILITY_THRESHOLD = 0.75

/**
 * Check if a question is high-volatility
 */
function isHighVolatility(draft: QuestionDraft): boolean {
  return (
    draft.signals.volatility !== null &&
    draft.signals.volatility > HIGH_VOLATILITY_THRESHOLD
  )
}

/**
 * Convert a question to bucket format to reduce volatility impact
 * This converts precise value questions to bucketed options
 */
function convertToBucketFormat(
  draft: QuestionDraft,
  ctx: TemplateContext
): QuestionDraft | null {
  // Only convert if we have change-related data
  if (
    draft.templateId === "P6_TVL_TREND" ||
    draft.templateId === "C4_GROWTH_RANKING"
  ) {
    // Convert to bucketed MC4 format
    const change = ctx.derived.change7d ?? ctx.derived.change30d ?? 0
    const choices = getChangeBucketChoices()
    const answerIndex = getChangeBucketIndex(change)

    return {
      ...draft,
      format: "mc4",
      choices,
      answerIndex,
      signals: {
        ...draft.signals,
        format: "mc4",
        volatility: 0.3, // Reduced volatility for buckets
      },
      buildNotes: [
        ...draft.buildNotes,
        "Converted to bucket format to reduce volatility",
      ],
    }
  }

  return null
}

/**
 * Validate difficulty distribution
 * Ideal: 1 easy, 2 medium, 1 hard, 1 easy
 * Acceptable: At least 1 easy, at least 1 hard, rest can be medium
 */
function validateDifficultyMix(drafts: QuestionDraft[]): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []

  const scores = drafts.map((d) => computeDifficulty(d.signals))
  // Use consistent thresholds with estimateTarget() in difficulty.ts
  const easyCount = scores.filter((s) => s < 0.30).length
  const hardCount = scores.filter((s) => s >= 0.45).length

  if (easyCount === 0) {
    issues.push("No easy questions in episode")
  }

  // Only warn about missing hard questions if we have 5 questions
  // and slot D (hard target) didn't get a challenging enough question
  if (hardCount === 0 && drafts.length >= 5) {
    // Check if slot D got at least a medium question (score >= 0.34)
    // This is acceptable since mc6 format with high margins scores ~0.34-0.43
    const slotDScore = scores.length >= 4 ? scores[3] : 0
    if (slotDScore < 0.34) {
      issues.push("No challenging questions in episode")
    }
  }

  // Check for too many hard questions
  if (hardCount > 2) {
    issues.push(`Too many hard questions: ${hardCount}`)
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}

// isRedundantWithFingerprint() removed - redundancy is now handled by semantic topics

/**
 * Post-balance pass on selected questions
 *
 * Ensures:
 * 1. Max 1 high-volatility question per episode
 * 2. Reasonable difficulty distribution
 * 3. No duplicate prompts (safety check)
 * 
 * Note: Fingerprint redundancy checking has been removed because:
 * - The semantic topic system already prevents selecting questions that would be
 *   redundant with fingerprint clues during slot selection
 * - The dynamic semantic topics on fingerprint templates (P1, C1) only add
 *   "fingerprint_tvl_revealed" or "fingerprint_trend_revealed" when those clues
 *   are actually shown (for unfamiliar topics)
 * - This prevents false positives where familiar topics get flagged as redundant
 */
export function postBalancePass(
  drafts: QuestionDraft[],
  ctx: TemplateContext,
  buildLog: BuildLogEntry[],
  _usedSemanticTopics?: Set<string>  // Kept for API compatibility but not used
): QuestionDraft[] {
  const result = [...drafts]

  // 1. Handle high-volatility questions
  const highVolIndices: number[] = []
  for (let i = 0; i < result.length; i++) {
    if (isHighVolatility(result[i])) {
      highVolIndices.push(i)
    }
  }

  // Keep only the first high-vol question, convert others to bucket format
  if (highVolIndices.length > 1) {
    for (let i = 1; i < highVolIndices.length; i++) {
      const idx = highVolIndices[i]
      const converted = convertToBucketFormat(result[idx], ctx)

      if (converted) {
        result[idx] = converted
        buildLog.push({
          qid: `q${idx + 1}`,
          decision: "post_balance",
          reason: "reduce_volatility",
        })
      }
    }
  }

  // 2. Validate difficulty distribution
  const difficultyCheck = validateDifficultyMix(result)
  if (!difficultyCheck.isValid) {
    for (const issue of difficultyCheck.issues) {
      buildLog.push({
        decision: "post_balance",
        reason: issue,
      })
    }
    // Note: We don't automatically fix difficulty issues, just log them
    // This is because forceful changes could make questions incorrect
  }

  // 3. Check for and handle duplicate prompts
  const prompts = new Set<string>()
  for (let i = 0; i < result.length; i++) {
    const prompt = result[i].prompt
    if (prompts.has(prompt)) {
      buildLog.push({
        qid: `q${i + 1}`,
        decision: "post_balance",
        reason: "duplicate_prompt_detected",
      })
      
      // If this is a fallback question, try to generate a different one
      if (result[i].templateId === "FALLBACK") {
        const replacement = generateAlternativeFallback(result[i], ctx, prompts)
        if (replacement && !prompts.has(replacement.prompt)) {
          result[i] = replacement
          buildLog.push({
            qid: `q${i + 1}`,
            decision: "post_balance",
            reason: "fallback_replaced_with_alternative",
          })
        }
      }
    }
    prompts.add(result[i].prompt)
  }

  return result
}

/**
 * Generate an alternative fallback question to avoid duplicates
 */
function generateAlternativeFallback(
  original: QuestionDraft,
  ctx: TemplateContext,
  usedPrompts: Set<string>
): QuestionDraft | null {
  const topicName = ctx.topic.name
  const isProtocol = ctx.episodeType === "protocol"
  
  // Alternative fallback questions
  const alternatives = isProtocol
    ? [
        {
          prompt: `Is ${topicName} tracked on DefiLlama?`,
          explainData: { name: topicName, isTracked: true },
        },
        {
          prompt: `Does ${topicName} have any TVL locked?`,
          explainData: { name: topicName, hasTvl: true },
        },
        {
          prompt: `Is ${topicName} a decentralized application?`,
          explainData: { name: topicName, isDecentralized: true },
        },
      ]
    : [
        {
          prompt: `Is ${topicName} tracked on DefiLlama?`,
          explainData: { name: topicName, isTracked: true },
        },
        {
          prompt: `Does ${topicName} support smart contracts?`,
          explainData: { name: topicName, supportsSmartContracts: true },
        },
        {
          prompt: `Is ${topicName} a layer 1 or layer 2 network?`,
          explainData: { name: topicName, isL1OrL2: true },
        },
      ]
  
  // Find first alternative that's not already used
  for (const alt of alternatives) {
    if (!usedPrompts.has(alt.prompt)) {
      return {
        ...original,
        prompt: alt.prompt,
        explainData: alt.explainData,
        buildNotes: [...original.buildNotes, "Replaced with alternative to avoid duplicate"],
      }
    }
  }
  
  return null
}

/**
 * Summarize post-balance changes
 */
export function summarizePostBalance(
  buildLog: BuildLogEntry[]
): {
  volatilityReductions: number
  otherAdjustments: number
} {
  let volatilityReductions = 0
  let otherAdjustments = 0

  for (const entry of buildLog) {
    if (entry.decision === "post_balance") {
      if (entry.reason === "reduce_volatility") {
        volatilityReductions++
      } else {
        otherAdjustments++
      }
    }
  }

  return { volatilityReductions, otherAdjustments }
}
