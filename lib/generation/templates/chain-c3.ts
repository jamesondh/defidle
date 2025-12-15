/**
 * C3: Chain ATH Timing
 *
 * When did a chain reach its ATH TVL?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import {
  findAthFromChainHistory,
  formatYYYYMM,
  formatMonth,
  isAthCurrentMonth,
} from "../metrics"
import { formatNumber, makeTimingDistractors } from "../distractors"
import type { ChainPoolEntry } from "@/lib/types/pools"

export class C3ChainATHTiming extends ChainTemplate {
  id = "C3_ATH_TIMING"
  name = "Chain ATH Timing"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need at least 6 months of TVL history
    if (!this.hasMinHistoryDays(ctx, 180)) return false

    const history = ctx.data.chainHistory
    if (!history || history.length < 30) return false

    // ATH should not be in current month
    const ath = findAthFromChainHistory(history)
    if (!ath) return false
    if (isAthCurrentMonth(ath.ts)) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const history = ctx.data.chainHistory!
    const ath = findAthFromChainHistory(history)!

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
    const topic = ctx.topic as ChainPoolEntry
    const history = ctx.data.chainHistory!
    const ath = findAthFromChainHistory(history)

    if (!ath) return null

    const athMonth = formatYYYYMM(ath.ts)
    const athMonthDisplay = formatMonth(ath.ts)

    if (format === "mc4") {
      const { choices, answerIndex } = makeTimingDistractors(athMonth, 3, seed)

      return {
        templateId: this.id,
        format,
        prompt: `In what month did ${topic.name} reach its all-time high TVL?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: 0.15,
          volatility: null,
        },
        explainData: {
          name: topic.name,
          athTvl: formatNumber(ath.value),
          athMonth: athMonthDisplay,
          metric: "TVL",
          // Note: We intentionally don't include comparison/distractor months here
          // as it makes explanations awkward (e.g., "not in June, December, or February")
        },
        buildNotes: [
          `ATH: ${formatNumber(ath.value)} in ${athMonthDisplay}`,
        ],
      }
    }

    // TF format
    const now = Date.now() / 1000
    const daysAgo = (now - ath.ts) / 86400

    let statement: string
    let answerValue: boolean

    if (daysAgo < 180) {
      statement = `${topic.name} set its all-time high TVL within the last 6 months.`
      answerValue = true
    } else if (daysAgo < 365) {
      statement = `${topic.name} reached its all-time high TVL within the last year.`
      answerValue = true
    } else {
      statement = `${topic.name} last hit its all-time high TVL over a year ago.`
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
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: 0.2,
        volatility: null,
      },
      explainData: {
        name: topic.name,
        athTvl: formatNumber(ath.value),
        athMonth: athMonthDisplay,
        metric: "TVL",
      },
      buildNotes: [
        `TF: "${statement}" -> ${answerValue}`,
        `ATH was ${Math.round(daysAgo)} days ago`,
      ],
    }
  }
}

export const c3ChainATHTiming = new C3ChainATHTiming()
