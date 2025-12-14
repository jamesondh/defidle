/**
 * P12: DEX Volume Trend
 *
 * Did a DEX's volume increase or decrease? (Only for DEX protocols)
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { getChangeBucketChoices, getChangeBucketIndex, formatNumber } from "../distractors"

/**
 * Calculate volume trend from volume data
 * Compares recent 7d volume vs previous 7d volume
 */
function calculateVolumeTrend(
  volumeHistory: Array<{ date: number; value: number }>
): { trend: number; recent: number; past: number } | null {
  if (!volumeHistory || volumeHistory.length < 14) return null

  // Sort by date ascending
  const sorted = [...volumeHistory].sort((a, b) => a.date - b.date)

  // Recent 7 days total
  const recent7d = sorted.slice(-7)
  const recentTotal = recent7d.reduce((sum, d) => sum + d.value, 0)

  // Previous 7 days total (days 8-14 from the end)
  const past7d = sorted.slice(-14, -7)
  if (past7d.length === 0) return null
  const pastTotal = past7d.reduce((sum, d) => sum + d.value, 0)

  if (pastTotal <= 0) return null

  const trend = (recentTotal - pastTotal) / pastTotal

  return { trend, recent: recentTotal, past: pastTotal }
}

export class P12DEXVolumeTrend extends ProtocolTemplate {
  id = "P12_DEX_VOLUME_TREND"
  name = "DEX Volume Trend"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Must be a DEX
    if (detail.category !== "Dexes") return false

    // Need DEX volume data
    // Note: This requires protocolDexVolume to be fetched and added to FetchedData
    // For now, check if we have it available
    const dexData = (ctx.data as { protocolDexVolume?: { totalDataChart?: Array<[number, number]> } }).protocolDexVolume
    if (!dexData) return false

    // Check if we have sufficient volume history
    if (!dexData.totalDataChart || dexData.totalDataChart.length < 14) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const dexData = (ctx.data as { protocolDexVolume?: { totalDataChart?: Array<[number, number]> } }).protocolDexVolume!
    
    const volumeHistory = dexData.totalDataChart?.map((d) => ({
      date: d[0],
      value: d[1],
    }))

    if (!volumeHistory) return []

    const trendData = calculateVolumeTrend(volumeHistory)
    if (!trendData) return ["tf"]

    // If change is near bucket boundary, prefer TF
    const boundaries = [-0.1, -0.01, 0.01, 0.1]
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
    const dexData = (ctx.data as { protocolDexVolume?: { totalDataChart?: Array<[number, number]> } }).protocolDexVolume!

    // Get volume history
    const volumeHistory = dexData.totalDataChart?.map((d) => ({
      date: d[0],
      value: d[1],
    }))

    if (!volumeHistory || volumeHistory.length < 14) return null

    const trendData = calculateVolumeTrend(volumeHistory)
    if (!trendData) return null

    const { trend, recent, past } = trendData
    const increased = trend > 0

    if (format === "tf") {
      const statement = `${detail.name}'s trading volume has increased over the past 7 days.`

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
          recentVolume: formatNumber(recent),
          pastVolume: formatNumber(past),
        },
        buildNotes: [
          `TF: "${statement}" -> ${increased}`,
          `Trend: ${(trend * 100).toFixed(1)}%`,
          `Recent 7d: ${formatNumber(recent)}, Previous 7d: ${formatNumber(past)}`,
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
      prompt: `How did ${detail.name}'s trading volume change over the past 7 days compared to the previous week?`,
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
        recentVolume: formatNumber(recent),
        pastVolume: formatNumber(past),
      },
      buildNotes: [
        `Trend: ${(trend * 100).toFixed(1)}%`,
        `Bucket: ${choices[answerIndex]}`,
        `Recent 7d: ${formatNumber(recent)}, Previous 7d: ${formatNumber(past)}`,
      ],
    }
  }
}

export const p12DEXVolumeTrend = new P12DEXVolumeTrend()
