/**
 * P5: Fees vs Revenue
 *
 * Compare a protocol's fees and revenue metrics.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { formatNumber, getRevenueBucketChoices, getRevenueBucketIndex } from "../distractors"
import { createRng } from "../rng"

export class P5FeesVsRevenue extends ProtocolTemplate {
  id = "P5_FEES_REVENUE"
  name = "Fees vs Revenue"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    // Need fees data
    const fees = ctx.data.protocolFees
    if (!fees) return false

    // Check if we have 7d fees data
    const has7dFees = fees.total7d !== undefined && fees.total7d > 0

    return has7dFees
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const revenue = ctx.data.protocolRevenue

    // If no revenue data, use TF format asking if there's non-zero revenue
    if (!revenue || !revenue.total7d) {
      return ["tf"]
    }

    // If revenue exists, we can ask about the ratio
    return ["mc4", "ab", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const fees = ctx.data.protocolFees!
    const revenue = ctx.data.protocolRevenue

    const fees7d = fees.total7d ?? 0
    const rev7d = revenue?.total7d ?? 0
    const hasRevenue = rev7d > 0
    const revToFeesRatio = fees7d > 0 ? rev7d / fees7d : 0

    if (format === "tf") {
      // Ask if protocol has non-zero revenue
      const statement = `${detail.name} has generated non-zero protocol revenue over the past week.`
      const answerValue = hasRevenue

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
          margin: 0.3, // Binary question, moderate margin
          volatility: null,
        },
        explainData: {
          name: detail.name,
          fees7d: formatNumber(fees7d),
          rev7d: formatNumber(rev7d),
          hasRevenue,
        },
        buildNotes: [
          `TF: "${statement}" -> ${answerValue}`,
          `Fees 7d: ${formatNumber(fees7d)}, Revenue 7d: ${formatNumber(rev7d)}`,
        ],
      }
    }

    if (!hasRevenue) return null // Can't do MC4 or AB without revenue

    if (format === "mc4") {
      // Ask about revenue-to-fees ratio using buckets
      const choices = getRevenueBucketChoices()
      const answerIndex = getRevenueBucketIndex(revToFeesRatio)

      // Calculate margin based on distance to bucket boundary
      const boundaries = [0.1, 0.3, 0.6]
      const minDistToBoundary = Math.min(
        ...boundaries.map((b) => Math.abs(revToFeesRatio - b))
      )
      const margin = Math.min(1, minDistToBoundary * 4)

      return {
        templateId: this.id,
        format,
        prompt: `What percentage of ${detail.name}'s fees became protocol revenue over the past 7 days?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
          margin,
          volatility: null,
        },
        explainData: {
          name: detail.name,
          fees7d: formatNumber(fees7d),
          rev7d: formatNumber(rev7d),
          revPercent: Math.round(revToFeesRatio * 100),
        },
        buildNotes: [
          `Revenue to fees ratio: ${(revToFeesRatio * 100).toFixed(1)}%`,
        ],
      }
    }

    // AB format - compare fees vs revenue
    const rng = createRng(seed)
    const swapped = rng() > 0.5

    // Ask which is higher (fees is always higher unless revenue > fees)
    const feesHigher = fees7d > rev7d
    const choices = swapped
      ? ["Revenue", "Fees"]
      : ["Fees", "Revenue"]
    const answerIndex = swapped
      ? (feesHigher ? 1 : 0)
      : (feesHigher ? 0 : 1)

    const margin = Math.abs(fees7d - rev7d) / Math.max(fees7d, rev7d)

    return {
      templateId: this.id,
      format,
      prompt: `Over the last 7 days, did ${detail.name} generate more in fees or revenue?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
        margin,
        volatility: null,
      },
      explainData: {
        name: detail.name,
        fees7d: formatNumber(fees7d),
        rev7d: formatNumber(rev7d),
        winner: feesHigher ? "fees" : "revenue",
      },
      buildNotes: [
        `Fees 7d: ${formatNumber(fees7d)}, Revenue 7d: ${formatNumber(rev7d)}`,
        `${feesHigher ? "Fees" : "Revenue"} is higher by ${(margin * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const p5FeesVsRevenue = new P5FeesVsRevenue()
