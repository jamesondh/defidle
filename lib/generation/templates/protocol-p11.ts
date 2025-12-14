/**
 * P11: Fees Trend
 *
 * Did a protocol's fees increase or decrease over a period?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { getChangeBucketChoices, getChangeBucketIndex, formatNumber } from "../distractors"

/**
 * Calculate fees trend from fees data
 * Compares 7d average now vs 7d average 30 days ago
 */
function calculateFeesTrend(
  feesHistory: Array<{ date: number; value: number }>
): { trend: number; recent: number; past: number } | null {
  if (!feesHistory || feesHistory.length < 30) return null

  // Sort by date ascending
  const sorted = [...feesHistory].sort((a, b) => a.date - b.date)

  // Recent 7 days average
  const recent7d = sorted.slice(-7)
  const recentAvg = recent7d.reduce((sum, d) => sum + d.value, 0) / recent7d.length

  // 30 days ago 7-day average (days 23-30 from the end, or as close as possible)
  const past7d = sorted.slice(-30, -23)
  if (past7d.length === 0) return null
  const pastAvg = past7d.reduce((sum, d) => sum + d.value, 0) / past7d.length

  if (pastAvg <= 0) return null

  const trend = (recentAvg - pastAvg) / pastAvg

  return { trend, recent: recentAvg, past: pastAvg }
}

export class P11FeesTrend extends ProtocolTemplate {
  id = "P11_FEES_TREND"
  name = "Fees Trend"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    // Need fees data with history
    const fees = ctx.data.protocolFees
    if (!fees) return false

    // Check if we have sufficient fees history
    // The fees data structure includes totalDataChart or totalDataChartBreakdown
    if (!fees.totalDataChart || fees.totalDataChart.length < 30) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const fees = ctx.data.protocolFees!
    
    const feesHistory = fees.totalDataChart?.map((d) => ({
      date: d[0],
      value: d[1],
    }))

    if (!feesHistory) return []

    const trendData = calculateFeesTrend(feesHistory)
    if (!trendData) return ["tf"]

    // If change is near bucket boundary, prefer TF
    const boundaries = [-0.2, -0.05, 0.05, 0.2]
    const minDistToBoundary = Math.min(
      ...boundaries.map((b) => Math.abs(trendData.trend - b))
    )

    if (minDistToBoundary < 0.03) {
      return ["tf"]
    }

    return ["tf", "mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    _seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const fees = ctx.data.protocolFees!

    // Get fees history
    const feesHistory = fees.totalDataChart?.map((d) => ({
      date: d[0],
      value: d[1],
    }))

    if (!feesHistory || feesHistory.length < 30) return null

    const trendData = calculateFeesTrend(feesHistory)
    if (!trendData) return null

    const { trend, recent, past } = trendData
    const increased = trend > 0

    if (format === "tf") {
      const statement = `${detail.name}'s fees have increased over the past month.`

      // Calculate margin - how confident is the answer?
      const margin = Math.abs(trend)

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
          margin: Math.min(1, margin),
          volatility: null,
        },
        explainData: {
          name: detail.name,
          trendDirection: increased ? "increased" : "decreased",
          changePercent: Math.abs(Math.round(trend * 100)),
          recentFees: formatNumber(recent * 7), // Weekly total
          pastFees: formatNumber(past * 7),
        },
        buildNotes: [
          `TF: "${statement}" -> ${increased}`,
          `Trend: ${(trend * 100).toFixed(1)}%`,
          `Recent avg: ${formatNumber(recent)}/day, Past avg: ${formatNumber(past)}/day`,
        ],
      }
    }

    // MC4 format with buckets
    const choices = getChangeBucketChoices()
    const answerIndex = getChangeBucketIndex(trend)

    // Calculate margin based on distance to bucket boundary
    const boundaries = [-0.1, -0.01, 0.01, 0.1]
    const minDistToBoundary = Math.min(
      ...boundaries.map((b) => Math.abs(trend - b))
    )
    const margin = Math.min(1, minDistToBoundary * 5)

    return {
      templateId: this.id,
      format,
      prompt: `How did ${detail.name}'s fees change over the past 30 days?`,
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
        trendDirection: trend > 0 ? "increased" : "decreased",
        changePercent: Math.abs(Math.round(trend * 100)),
        recentFees: formatNumber(recent * 7),
        pastFees: formatNumber(past * 7),
      },
      buildNotes: [
        `Trend: ${(trend * 100).toFixed(1)}%`,
        `Bucket: ${choices[answerIndex]}`,
      ],
    }
  }
}

export const p11FeesTrend = new P11FeesTrend()
