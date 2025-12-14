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
import { createRng } from "./rng"

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
 * Fallback question definitions for diverse fallback generation
 */
interface FallbackQuestion {
  id: string
  getPrompt: (ctx: TemplateContext) => string
  getExplainData: (ctx: TemplateContext) => Record<string, unknown>
  /** Check if this fallback can be used given the context */
  canUse?: (ctx: TemplateContext) => boolean
}

/**
 * Pool of diverse fallback questions for protocols
 */
const PROTOCOL_FALLBACKS: FallbackQuestion[] = [
  {
    id: "protocol_is_defi",
    getPrompt: (ctx) => `Is ${ctx.topic.name} a DeFi protocol?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      type: "protocol",
    }),
  },
  {
    id: "protocol_tvl_positive",
    getPrompt: (ctx) => `Does ${ctx.topic.name} have more than $1M in TVL?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvl: ctx.derived.tvlRank ? `ranked #${ctx.derived.tvlRank}` : "significant",
      hasHighTvl: true,
    }),
    canUse: (ctx) => (ctx.derived.tvlRank ?? 999) <= 100,
  },
  {
    id: "protocol_top_100",
    getPrompt: (ctx) => `Is ${ctx.topic.name} ranked in the top 100 protocols by TVL?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvlRank: ctx.derived.tvlRank,
      isTop100: (ctx.derived.tvlRank ?? 999) <= 100,
    }),
    canUse: (ctx) => ctx.derived.tvlRank !== undefined,
  },
  {
    id: "protocol_tracked_defillama",
    getPrompt: (ctx) => `Is ${ctx.topic.name} tracked on DefiLlama?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      isTracked: true,
    }),
  },
  {
    id: "protocol_multichain",
    getPrompt: (ctx) => `Is ${ctx.topic.name} deployed on more than one blockchain?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      chainCount: ctx.derived.chainCount,
      isMultichain: (ctx.derived.chainCount ?? 0) > 1,
    }),
    canUse: (ctx) => ctx.derived.chainCount !== undefined,
  },
]

/**
 * Pool of diverse fallback questions for chains
 */
const CHAIN_FALLBACKS: FallbackQuestion[] = [
  {
    id: "chain_is_blockchain",
    getPrompt: (ctx) => `Is ${ctx.topic.name} a blockchain network?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      type: "chain",
    }),
  },
  {
    id: "chain_has_defi",
    getPrompt: (ctx) => `Does ${ctx.topic.name} have DeFi protocols deployed on it?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      hasDefi: true,
    }),
  },
  {
    id: "chain_top_50",
    getPrompt: (ctx) => `Is ${ctx.topic.name} ranked in the top 50 chains by TVL?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      tvlRank: ctx.derived.chainTvlRank ?? ctx.derived.tvlRank,
      isTop50: (ctx.derived.chainTvlRank ?? ctx.derived.tvlRank ?? 999) <= 50,
    }),
    canUse: (ctx) => (ctx.derived.chainTvlRank ?? ctx.derived.tvlRank) !== undefined,
  },
  {
    id: "chain_tracked_defillama",
    getPrompt: (ctx) => `Is ${ctx.topic.name} tracked on DefiLlama?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      isTracked: true,
    }),
  },
  {
    id: "chain_tvl_positive",
    getPrompt: (ctx) => `Does ${ctx.topic.name} have more than $10M in total TVL?`,
    getExplainData: (ctx) => ({
      name: ctx.topic.name,
      hasTvl: true,
    }),
    canUse: (ctx) => (ctx.derived.chainTvlRank ?? ctx.derived.tvlRank ?? 999) <= 50,
  },
]

/**
 * Generate a safe fallback question for a slot
 * This is used when no template can produce a valid question.
 * Uses a diverse pool of fallback questions and tracks used prompts to avoid duplicates.
 */
function safeFallback(
  slot: string,
  ctx: TemplateContext,
  seed: number,
  usedPrompts?: Set<string>
): QuestionDraft | null {
  const topicName = ctx.topic.name
  const isProtocol = ctx.episodeType === "protocol"
  const fallbacks = isProtocol ? PROTOCOL_FALLBACKS : CHAIN_FALLBACKS

  // Use seed to select a fallback, but also consider which ones we've used
  const rng = createRng(seed)
  
  // Filter to fallbacks that can be used and haven't been used yet
  const availableFallbacks = fallbacks.filter((fb) => {
    // Check if this fallback can be used given context
    if (fb.canUse && !fb.canUse(ctx)) return false
    // Check if prompt already used
    if (usedPrompts) {
      const prompt = fb.getPrompt(ctx)
      if (usedPrompts.has(prompt)) return false
    }
    return true
  })

  // If no available fallbacks, use the first one from the pool (better than nothing)
  const fallbackPool = availableFallbacks.length > 0 ? availableFallbacks : fallbacks

  // Deterministically select based on seed
  const index = Math.floor(rng() * fallbackPool.length)
  const selected = fallbackPool[index]

  const prompt = selected.getPrompt(ctx)
  const explainData = selected.getExplainData(ctx)

  // Determine answer based on the fallback type
  // All our fallbacks are designed to have "True" as the answer
  const answerValue = true
  const answerIndex = 0

  return {
    templateId: "FALLBACK",
    format: "tf" as QuestionFormat,
    prompt,
    choices: ["True", "False"],
    answerIndex,
    answerValue,
    signals: {
      format: "tf",
      familiarityRankBucket: "top_100",
      margin: 1.0, // Trivial question
      volatility: 0,
    },
    explainData,
    buildNotes: [`Used fallback question "${selected.id}" for slot ${slot}`],
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
    draft: safeFallback(slot, ctx, seed, usedPrompts),
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
