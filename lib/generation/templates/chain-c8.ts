/**
 * C8: 30-Day Direction
 *
 * Did a chain's TVL increase or decrease over the last 30 days?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { percentChangeFromChainHistory } from "../metrics"
import { formatNumber } from "../distractors"
import { createRng } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

export class C8_30DayDirection extends ChainTemplate {
  id = "C8_30D_DIRECTION"
  name = "30-Day Direction"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need chain history with at least 30 days
    const history = ctx.data.chainHistory
    if (!history || history.length < 30) return false

    // Calculate the change to make sure we have valid data
    const change30d = percentChangeFromChainHistory(history, 30)
    if (change30d === null) return false

    // Skip if change is too small (less than 2%)
    if (Math.abs(change30d) < 0.02) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const history = ctx.data.chainHistory!
    const change30d = percentChangeFromChainHistory(history, 30)

    if (change30d === null) return []

    // If change is very small (2-5%), prefer TF
    if (Math.abs(change30d) < 0.05) {
      return ["tf"]
    }

    return ["ab", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const history = ctx.data.chainHistory!

    const change30d = percentChangeFromChainHistory(history, 30)
    if (change30d === null) return null

    const increased = change30d > 0
    const direction = increased ? "increased" : "decreased"

    // Get current and past TVL for explanation
    const currentTvl = history[history.length - 1]?.tvl ?? 0
    const pastTvl = history.length >= 30 
      ? history[history.length - 30]?.tvl ?? 0 
      : history[0]?.tvl ?? 0

    const rng = createRng(seed)

    if (format === "tf") {
      const statement = `${topic.name}'s TVL has increased over the last 30 days.`

      return {
        templateId: this.id,
        format,
        prompt: statement,
        answerValue: increased,
        choices: ["True", "False"],
        answerIndex: increased ? 0 : 1,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.abs(change30d),
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: topic.name,
          direction,
          changePercent: Math.abs(Math.round(change30d * 100)),
          currentTvl: formatNumber(currentTvl),
          pastTvl: formatNumber(pastTvl),
        },
        buildNotes: [
          `TF: "${statement}" -> ${increased}`,
          `30d change: ${(change30d * 100).toFixed(1)}%`,
          `Current: ${formatNumber(currentTvl)}, 30d ago: ${formatNumber(pastTvl)}`,
        ],
      }
    }

    // AB format - "Did TVL increase or decrease?"
    const swapped = rng() > 0.5
    const choices = swapped 
      ? ["Decreased", "Increased"] 
      : ["Increased", "Decreased"]
    const answerIndex = swapped 
      ? (increased ? 1 : 0) 
      : (increased ? 0 : 1)

    return {
      templateId: this.id,
      format,
      prompt: `Over the last 30 days, did ${topic.name}'s TVL increase or decrease?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: Math.abs(change30d),
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: topic.name,
        direction,
        changePercent: Math.abs(Math.round(change30d * 100)),
        currentTvl: formatNumber(currentTvl),
        pastTvl: formatNumber(pastTvl),
      },
      buildNotes: [
        `AB: ${topic.name} TVL ${direction}`,
        `30d change: ${(change30d * 100).toFixed(1)}%`,
        `Current: ${formatNumber(currentTvl)}, 30d ago: ${formatNumber(pastTvl)}`,
      ],
    }
  }
}

export const c8_30DayDirection = new C8_30DayDirection()
