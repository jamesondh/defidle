/**
 * P6: TVL Trend
 *
 * Did a protocol's TVL increase or decrease over a given period?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import {
  percentChangeFromTvlHistory,
  getChangeBucket,
} from "../metrics"
import { getChangeBucketChoices, getChangeBucketIndex, formatNumber } from "../distractors"
import { createRng } from "../rng"

export class P6TVLTrend extends ProtocolTemplate {
  id = "P6_TVL_TREND"
  name = "TVL Trend"
  semanticTopics = ["tvl_trend_7d", "tvl_direction"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need either change_7d from list or TVL series
    const list = ctx.data.protocolList
    const hasChange7d = list?.find((p) => p.slug === detail.slug)?.change_7d !== undefined
    const hasTvlSeries = detail.tvl && detail.tvl.length >= 7

    return hasChange7d || hasTvlSeries
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const detail = ctx.data.protocolDetail!

    // Get 7d change
    let change7d = ctx.derived.change7d
    if (change7d === undefined && detail.tvl) {
      change7d = percentChangeFromTvlHistory(detail.tvl, 7) ?? undefined
    }

    if (change7d === undefined) return []

    // If change is near bucket boundary, prefer TF
    const boundaries = [-0.1, -0.01, 0.01, 0.1]
    const minDistToBoundary = Math.min(
      ...boundaries.map((b) => Math.abs(change7d! - b))
    )

    if (minDistToBoundary < 0.02) {
      return ["tf"]
    }

    return ["tf", "mc4", "ab"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!

    // Get change values
    let change7d = ctx.derived.change7d
    if (change7d === undefined && detail.tvl) {
      change7d = percentChangeFromTvlHistory(detail.tvl, 7) ?? undefined
    }

    let change30d = ctx.derived.change30d
    if (change30d === undefined && detail.tvl) {
      change30d = percentChangeFromTvlHistory(detail.tvl, 30) ?? undefined
    }

    if (change7d === undefined && change30d === undefined) return null

    // Use the most reliable change value
    const change = change7d ?? change30d!
    const period = change7d !== undefined ? "7 days" : "30 days"

    // Current TVL
    const currentTvl = detail.tvl?.length > 0
      ? detail.tvl[detail.tvl.length - 1].totalLiquidityUSD
      : 0

    if (format === "tf") {
      // Ask if TVL increased
      const increased = change > 0
      const statement = `${detail.name}'s TVL has increased over the past ${period}.`

      return {
        templateId: this.id,
        format,
        prompt: statement,
        answerValue: increased,
        choices: ["True", "False"],
        answerIndex: increased ? 0 : 1,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
          margin: Math.abs(change),
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: detail.name,
          trendDirection: increased ? "increased" : "decreased",
          // Use toFixed(1) to preserve small percentages (don't round 0.5% to 0%)
          changePercent: Math.abs(change * 100).toFixed(1),
          period,
          currentTvl: formatNumber(currentTvl),
        },
        buildNotes: [
          `TF: "${statement}" -> ${increased}`,
          `Change: ${(change * 100).toFixed(1)}%`,
        ],
      }
    }

    if (format === "mc4") {
      // Ask about the approximate change using buckets
      const choices = getChangeBucketChoices()
      const answerIndex = getChangeBucketIndex(change)

      // Calculate margin based on distance to bucket boundary
      const boundaries = [-0.1, -0.01, 0.01, 0.1]
      const minDistToBoundary = Math.min(
        ...boundaries.map((b) => Math.abs(change - b))
      )
      const margin = Math.min(1, minDistToBoundary * 5)

      return {
        templateId: this.id,
        format,
        prompt: `What was ${detail.name}'s approximate TVL change over the past ${period}?`,
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
          trendDirection: change > 0 ? "increased" : "decreased",
          changePercent: Math.abs(Math.round(change * 100)),
          changeBucket: getChangeBucket(change),
          period,
        },
        buildNotes: [
          `Change: ${(change * 100).toFixed(1)}% (${getChangeBucket(change)})`,
        ],
      }
    }

    // AB format - compare 7d vs 30d change
    if (change7d === undefined || change30d === undefined) {
      // Can't do AB without both periods
      return null
    }

    const rng = createRng(seed)
    const swapped = rng() > 0.5

    const change7dAbs = Math.abs(change7d)
    const change30dAbs = Math.abs(change30d)
    const sevenDaysLarger = change7dAbs > change30dAbs

    const choices = swapped
      ? ["30 days", "7 days"]
      : ["7 days", "30 days"]
    const answerIndex = swapped
      ? (sevenDaysLarger ? 1 : 0)
      : (sevenDaysLarger ? 0 : 1)

    const margin = Math.abs(change7dAbs - change30dAbs) / Math.max(change7dAbs, change30dAbs)

    return {
      templateId: this.id,
      format,
      prompt: `Did ${detail.name}'s TVL change more in the past 7 days or 30 days (in absolute terms)?`,
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
        change7d: `${change7d > 0 ? "+" : ""}${(change7d * 100).toFixed(1)}%`,
        change30d: `${change30d > 0 ? "+" : ""}${(change30d * 100).toFixed(1)}%`,
        winner: sevenDaysLarger ? "7 days" : "30 days",
      },
      buildNotes: [
        `7d change: ${(change7d * 100).toFixed(1)}%`,
        `30d change: ${(change30d * 100).toFixed(1)}%`,
        `${sevenDaysLarger ? "7 days" : "30 days"} had larger absolute change`,
      ],
    }
  }
}

export const p6TVLTrend = new P6TVLTrend()
