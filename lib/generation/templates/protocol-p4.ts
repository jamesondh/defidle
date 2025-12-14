/**
 * P4: ATH Timing
 *
 * When did a protocol reach its all-time high TVL?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import {
  findAthFromTvlHistory,
  formatYYYYMM,
  formatMonth,
  isAthCurrentMonth,
} from "../metrics"
import { formatNumber, makeTimingDistractors } from "../distractors"

export class P4ATHTiming extends ProtocolTemplate {
  id = "P4_ATH_TIMING"
  name = "ATH Timing"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    // Need at least 6 months of TVL history
    if (!this.hasMinHistoryDays(ctx, 180)) return false

    const detail = ctx.data.protocolDetail
    if (!detail?.tvl || detail.tvl.length < 30) return false

    // ATH should not be in current month (too easy/unstable)
    const ath = findAthFromTvlHistory(detail.tvl)
    if (!ath) return false
    if (isAthCurrentMonth(ath.ts)) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const detail = ctx.data.protocolDetail!
    const ath = findAthFromTvlHistory(detail.tvl)!

    // If ATH was recent (last 90 days), use TF
    const now = Date.now() / 1000
    const daysAgo = (now - ath.ts) / 86400

    if (daysAgo < 90) {
      return ["tf"]
    }

    return ["mc4", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const ath = findAthFromTvlHistory(detail.tvl)

    if (!ath) return null

    const athMonth = formatYYYYMM(ath.ts)
    const athMonthDisplay = formatMonth(ath.ts)

    if (format === "mc4") {
      // Generate month distractors
      const { choices, answerIndex } = makeTimingDistractors(athMonth, 3, seed)

      // Margin is based on how spread out the distractors are
      // For timing questions, use a fixed moderate margin
      const margin = 0.15

      return {
        templateId: this.id,
        format,
        prompt: `In what month did ${detail.name} reach its all-time high TVL?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
          margin,
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: detail.name,
          athValue: formatNumber(ath.value),
          athMonth: athMonthDisplay,
          // Note: We intentionally don't include comparison/distractor months here
          // as it makes explanations awkward (e.g., "not in June, December, or February")
        },
        buildNotes: [
          `ATH: ${formatNumber(ath.value)} in ${athMonthDisplay}`,
        ],
      }
    }

    // TF format - ask about a specific time period
    const now = Date.now() / 1000
    const daysAgo = (now - ath.ts) / 86400

    // Create a statement about when ATH occurred
    let statement: string
    let answerValue: boolean

    if (daysAgo < 180) {
      // Ask if ATH was in the last 6 months
      statement = `${detail.name} set its all-time high TVL within the last 6 months.`
      answerValue = true
    } else if (daysAgo < 365) {
      // Ask if ATH was in the last year
      statement = `${detail.name} reached its all-time high TVL within the last year.`
      answerValue = true
    } else {
      // Ask if ATH was more than a year ago
      statement = `${detail.name} last hit its all-time high TVL over a year ago.`
      answerValue = true
    }

    return {
      templateId: this.id,
      format,
      prompt: statement,
      answerValue,
      choices: ["True", "False"],
      answerIndex: answerValue ? 0 : 1,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
        margin: 0.2,
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: detail.name,
        athValue: formatNumber(ath.value),
        athMonth: athMonthDisplay,
      },
      buildNotes: [
        `TF: "${statement}" -> ${answerValue}`,
        `ATH was ${Math.round(daysAgo)} days ago`,
      ],
    }
  }
}

export const p4ATHTiming = new P4ATHTiming()
