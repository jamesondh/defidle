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
 * This is used when no template can produce a valid question
 */
function safeFallback(
  slot: string,
  ctx: TemplateContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _seed: number
): QuestionDraft | null {
  // Create a simple true/false question about the topic
  const topicName = ctx.topic.name
  const isProtocol = ctx.episodeType === "protocol"

  return {
    templateId: "FALLBACK",
    format: "tf" as QuestionFormat,
    prompt: isProtocol
      ? `Is ${topicName} a DeFi protocol?`
      : `Is ${topicName} a blockchain network?`,
    choices: ["True", "False"],
    answerIndex: 0, // answerValue is true
    answerValue: true,
    signals: {
      format: "tf",
      familiarityRankBucket: "top_100",
      margin: 1.0, // Trivial question
      volatility: 0,
    },
    explainData: {
      name: topicName,
      type: isProtocol ? "protocol" : "chain",
      slot,
    },
    buildNotes: [`Used fallback question for slot ${slot}`],
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
  usedTemplates: Set<string>
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
      // Accept if score is reasonable (within 0.2 of target band)
      const withinEasyBounds = target === "easy" && score <= 0.5
      const withinMediumBounds =
        target === "medium" && score >= 0.2 && score <= 0.8
      const withinHardBounds = target === "hard" && score >= 0.4

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
    draft: safeFallback(slot, ctx, seed),
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

  for (const slot of slots) {
    const templates = matrix[slot] ?? []
    const slotSeed = baseSeed + slot.charCodeAt(0) // Unique seed per slot

    const result = selectQuestionForSlot(
      slot,
      templates,
      ctx,
      slotSeed,
      usedTemplates
    )

    buildLog.push(...result.logEntries)

    if (result.draft) {
      drafts.push(result.draft)
      usedTemplates.add(result.draft.templateId)
    }
  }

  return { drafts, buildLog }
}
