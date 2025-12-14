/**
 * P7: Category Identification
 *
 * Identify a protocol's category.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { deterministicShuffle } from "../rng"

// Common DeFi categories for distractors
const COMMON_CATEGORIES = [
  "Dexes",
  "Lending",
  "Bridge",
  "CDP",
  "Yield",
  "Derivatives",
  "Liquid Staking",
  "Yield Aggregator",
  "Farm",
  "Reserve Currency",
  "Insurance",
  "Options",
  "Prediction Market",
  "Launchpad",
  "Synthetics",
  "RWA",
  "Privacy",
  "NFT Lending",
  "Cross Chain",
]

export class P7CategoryIdentification extends ProtocolTemplate {
  id = "P7_CATEGORY"
  name = "Category Identification"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need category
    if (!detail.category) return false

    // Need protocol list for context
    if (!ctx.data.protocolList || ctx.data.protocolList.length < 4) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const tvlRank = ctx.topic.tvlRank

    // Use mc4 for well-known protocols, mc6 for broader selection
    if (tvlRank <= 25) {
      return ["mc4"]
    }
    return ["mc4", "mc6"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const list = ctx.data.protocolList!

    const correctCategory = detail.category

    // Get unique categories from protocol list
    const categoriesInList = new Set(
      list.map((p) => p.category).filter((c): c is string => !!c)
    )

    // Build distractor pool from categories in the list + common categories
    const distractorPool = Array.from(
      new Set([...categoriesInList, ...COMMON_CATEGORIES])
    ).filter((c) => c !== correctCategory)

    const distractorCount = format === "mc6" ? 5 : 3

    if (distractorPool.length < distractorCount) return null

    // Deterministically select distractors
    const shuffled = deterministicShuffle(distractorPool, seed.toString())
    const distractors = shuffled.slice(0, distractorCount)

    // Build choices with correct answer
    const allChoices = [correctCategory, ...distractors]
    const shuffledChoices = deterministicShuffle(
      allChoices.map((cat, i) => ({ cat, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )

    const choices = shuffledChoices.map((x) => x.cat)
    const answerIndex = shuffledChoices.findIndex((x) => x.isCorrect)

    return {
      templateId: this.id,
      format,
      prompt: `What category is ${detail.name}?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
        margin: 0.3, // Category is relatively clear-cut
        volatility: null,
      },
      explainData: {
        name: detail.name,
        category: correctCategory,
        tvlRank: ctx.topic.tvlRank,
      },
      buildNotes: [
        `Protocol: ${detail.name}`,
        `Category: ${correctCategory}`,
        `Distractors: ${distractors.join(", ")}`,
      ],
    }
  }
}

export const p7CategoryIdentification = new P7CategoryIdentification()
