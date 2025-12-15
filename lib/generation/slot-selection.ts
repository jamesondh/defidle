/**
 * Slot Selection Algorithm
 *
 * Selects questions for each episode slot by trying templates in priority order,
 * checking prerequisites, computing difficulty, and matching against slot targets.
 */

import type {
  QuestionDraft,
  QuestionFormat,
  DifficultyTarget,
  TemplateContext,
  BuildLogEntry,
} from "@/lib/types/episode"
import type { Template } from "@/lib/types/template"
import {
  computeDifficulty,
  matchesTarget,
  findBestFormat,
} from "./difficulty"
import { getSlotDifficultyTarget } from "./schedule"
import { selectQuantitativeFallback } from "./quantitative-fallbacks"

/**
 * Result of attempting to select a question for a slot
 */
export interface SlotSelectionResult {
  draft: QuestionDraft | null
  logEntries: BuildLogEntry[]
}

/**
 * Try to adjust the format of a question to match a target difficulty
 */
function tryAdjustDifficulty(
  template: Template,
  ctx: TemplateContext,
  originalDraft: QuestionDraft,
  target: DifficultyTarget,
  seed: number
): QuestionDraft | null {
  // Get all available formats for this template
  const formats = template.proposeFormats(ctx)

  // Find the format that best matches the target
  const bestFormat = findBestFormat(formats, target, {
    familiarityRankBucket: originalDraft.signals.familiarityRankBucket,
    margin: originalDraft.signals.margin,
    volatility: originalDraft.signals.volatility,
  })

  if (!bestFormat || bestFormat === originalDraft.format) {
    return null
  }

  // Try to instantiate with the adjusted format
  return template.instantiate(ctx, bestFormat, seed)
}

/**
 * Generate a safe fallback question for a slot
 * 
 * This function now delegates to the quantitative fallback system which provides
 * substantive, data-driven questions instead of trivial "Is X a DeFi protocol?" type questions.
 * 
 * The new fallback system provides:
 * - TVL threshold questions ($100M, $500M, $1B, $5B thresholds)
 * - Trend-based questions (did TVL increase/decrease this week?)
 * - Rank-based questions (top 10, top 25, top 50)
 * - Chain count questions (deployed on 3+, 5+, 10+ chains)
 * - A/B comparisons against nearby protocols/chains
 * 
 * See quantitative-fallbacks.ts for the full fallback pool.
 */
function safeFallback(
  slot: string,
  ctx: TemplateContext,
  seed: number,
  usedPrompts?: Set<string>,
  target?: DifficultyTarget
): QuestionDraft | null {
  // Use the new quantitative fallback system
  const draft = selectQuantitativeFallback(
    ctx,
    target ?? getSlotDifficultyTarget(slot),
    seed,
    usedPrompts
  )

  if (draft) {
    // Add slot info to build notes
    draft.buildNotes.push(`Selected for slot ${slot}`)
    return draft
  }

  // Ultimate fallback if even quantitative fallbacks fail (should be rare)
  // This only happens if all fallbacks fail their canUse check
  return {
    templateId: "FALLBACK_GENERIC",
    format: "tf" as QuestionFormat,
    prompt: `${ctx.topic.name} is tracked on DefiLlama.`,
    choices: ["True", "False"],
    answerIndex: 0,
    answerValue: true,
    signals: {
      format: "tf",
      familiarityRankBucket: ctx.derived.tvlRankBucket ?? "top_100",
      margin: 1.0,
      volatility: 0,
    },
    explainData: {
      name: ctx.topic.name,
      type: ctx.episodeType,
    },
    buildNotes: [`Used generic fallback for slot ${slot} (all quantitative fallbacks failed)`],
  }
}

/**
 * Select a question for a specific slot
 *
 * Tries templates in priority order, checking prerequisites and difficulty targeting.
 * Returns null only if no template can produce a valid question.
 */
export function selectQuestionForSlot(
  slot: string,
  templates: Template[],
  ctx: TemplateContext,
  seed: number,
  usedTemplates: Set<string>,
  usedPrompts?: Set<string>
): SlotSelectionResult {
  const target = getSlotDifficultyTarget(slot)
  const logEntries: BuildLogEntry[] = []

  for (const template of templates) {
    // Skip if already used (unless template allows reuse)
    if (usedTemplates.has(template.id) && !template.allowReuse) {
      logEntries.push({
        slot,
        template: template.id,
        decision: "skip",
        reason: "already_used",
      })
      continue
    }

    // Check prerequisites
    if (!template.checkPrereqs(ctx)) {
      logEntries.push({
        slot,
        template: template.id,
        decision: "skip",
        reason: "prereq_failed",
      })
      continue
    }

    // Try each format in preference order
    const formats = template.proposeFormats(ctx)
    for (const format of formats) {
      const draft = template.instantiate(ctx, format, seed)

      if (!draft) {
        logEntries.push({
          slot,
          template: template.id,
          format,
          decision: "skip",
          reason: "instantiate_failed",
        })
        continue
      }

      const score = computeDifficulty(draft.signals)

      if (matchesTarget(score, target)) {
        logEntries.push({
          slot,
          template: template.id,
          format,
          decision: "selected",
          score,
          target,
        })
        return {
          draft: { ...draft, buildNotes: [...draft.buildNotes, `Score: ${score.toFixed(2)}`] },
          logEntries,
        }
      }

      // Try adjusting format to match target
      const adjusted = tryAdjustDifficulty(template, ctx, draft, target, seed)
      if (adjusted) {
        const adjScore = computeDifficulty(adjusted.signals)
        if (matchesTarget(adjScore, target)) {
          logEntries.push({
            slot,
            template: template.id,
            decision: "adjusted",
            originalFormat: format,
            newFormat: adjusted.format,
            score: adjScore,
            target,
          })
          return {
            draft: {
              ...adjusted,
              buildNotes: [
                ...adjusted.buildNotes,
                `Adjusted from ${format} to ${adjusted.format}`,
                `Score: ${adjScore.toFixed(2)}`,
              ],
            },
            logEntries,
          }
        }
      }

      logEntries.push({
        slot,
        template: template.id,
        format,
        decision: "reject",
        reason: "difficulty_mismatch",
        score,
        target,
      })
    }
  }

  // No template worked - check if we can accept a "close enough" question
  // Try again, accepting any question that's within reasonable bounds
  for (const template of templates) {
    if (usedTemplates.has(template.id) && !template.allowReuse) continue
    if (!template.checkPrereqs(ctx)) continue

    const formats = template.proposeFormats(ctx)
    for (const format of formats) {
      const draft = template.instantiate(ctx, format, seed)
      if (!draft) continue

      const score = computeDifficulty(draft.signals)
      // Accept if score is reasonable - relaxed bounds to reduce fallback frequency
      // For hard slot, we accept score >= 0.25 rather than falling back to trivial questions
      // (score ~0.13 from fallbacks). A medium-difficulty question is better than a trivial one.
      const withinEasyBounds = target === "easy" && score <= 0.5
      const withinMediumBounds =
        target === "medium" && score >= 0.2 && score <= 0.8
      const withinHardBounds = target === "hard" && score >= 0.25

      if (withinEasyBounds || withinMediumBounds || withinHardBounds) {
        logEntries.push({
          slot,
          template: template.id,
          format,
          decision: "selected",
          reason: "close_enough",
          score,
          target,
        })
        return {
          draft: {
            ...draft,
            buildNotes: [
              ...draft.buildNotes,
              `Score: ${score.toFixed(2)} (close enough for ${target})`,
            ],
          },
          logEntries,
        }
      }
    }
  }

  // Use safe fallback as last resort
  logEntries.push({
    slot,
    decision: "fallback",
    reason: "no_template_matched",
  })

  return {
    draft: safeFallback(slot, ctx, seed, usedPrompts, target),
    logEntries,
  }
}

/**
 * Select questions for all slots in an episode
 */
export function selectAllQuestions(
  slots: string[],
  matrix: Record<string, Template[]>,
  ctx: TemplateContext,
  baseSeed: number
): { drafts: QuestionDraft[]; buildLog: BuildLogEntry[] } {
  const drafts: QuestionDraft[] = []
  const buildLog: BuildLogEntry[] = []
  const usedTemplates = new Set<string>()
  const usedPrompts = new Set<string>()

  for (const slot of slots) {
    const templates = matrix[slot] ?? []
    const slotSeed = baseSeed + slot.charCodeAt(0) // Unique seed per slot

    const result = selectQuestionForSlot(
      slot,
      templates,
      ctx,
      slotSeed,
      usedTemplates,
      usedPrompts
    )

    buildLog.push(...result.logEntries)

    if (result.draft) {
      drafts.push(result.draft)
      usedTemplates.add(result.draft.templateId)
      usedPrompts.add(result.draft.prompt)
    }
  }

  return { drafts, buildLog }
}
