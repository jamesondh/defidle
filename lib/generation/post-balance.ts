/**
 * Post-Balance Pass
 *
 * Validates and adjusts episode questions after initial selection to ensure:
 * - Max 1 high-volatility question per episode
 * - Proper difficulty distribution
 * - No question quality issues
 */

import type {
  QuestionDraft,
  BuildLogEntry,
  TemplateContext,
} from "@/lib/types/episode"
import { getChangeBucketChoices, getChangeBucketIndex } from "./distractors"
import { computeDifficulty } from "./difficulty"

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
  const easyCount = scores.filter((s) => s <= 0.38).length
  const hardCount = scores.filter((s) => s >= 0.6).length

  if (easyCount === 0) {
    issues.push("No easy questions in episode")
  }

  if (hardCount === 0 && drafts.length >= 4) {
    issues.push("No hard questions in episode")
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

/**
 * Post-balance pass on selected questions
 *
 * Ensures:
 * 1. Max 1 high-volatility question per episode
 * 2. Reasonable difficulty distribution
 * 3. No duplicate prompts (safety check)
 */
export function postBalancePass(
  drafts: QuestionDraft[],
  ctx: TemplateContext,
  buildLog: BuildLogEntry[]
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

  // 3. Check for duplicate prompts (safety check)
  const prompts = new Set<string>()
  for (let i = 0; i < result.length; i++) {
    const prompt = result[i].prompt
    if (prompts.has(prompt)) {
      buildLog.push({
        qid: `q${i + 1}`,
        decision: "post_balance",
        reason: "duplicate_prompt_detected",
      })
    }
    prompts.add(prompt)
  }

  return result
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
