/**
 * P10: TVL Band
 *
 * Which TVL range fits a protocol?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { formatNumber } from "../distractors"
import { sumActualChainTvl } from "../chain-filter"

// TVL bands as specified in question-templates.md
const TVL_BANDS = [
  { label: "<$50M", min: 0, max: 50_000_000 },
  { label: "$50M-$250M", min: 50_000_000, max: 250_000_000 },
  { label: "$250M-$1B", min: 250_000_000, max: 1_000_000_000 },
  { label: "$1B-$5B", min: 1_000_000_000, max: 5_000_000_000 },
  { label: ">$5B", min: 5_000_000_000, max: Infinity },
]

/**
 * Get TVL band index for a given TVL value
 */
function getTvlBandIndex(tvl: number): number {
  for (let i = 0; i < TVL_BANDS.length; i++) {
    if (tvl < TVL_BANDS[i].max) {
      return i
    }
  }
  return TVL_BANDS.length - 1
}

/**
 * Calculate distance to nearest bucket boundary (as fraction of TVL)
 */
function distanceToBoundary(tvl: number): number {
  const boundaries = [50_000_000, 250_000_000, 1_000_000_000, 5_000_000_000]
  let minDist = Infinity
  
  for (const boundary of boundaries) {
    const dist = Math.abs(tvl - boundary) / tvl
    if (dist < minDist) {
      minDist = dist
    }
  }
  
  return minDist
}

export class P10TVLBand extends ProtocolTemplate {
  id = "P10_TVL_BAND"
  name = "TVL Band"
  // Reveals absolute TVL value in the explanation
  semanticTopics = ["tvl_absolute"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need TVL data
    if (!detail.tvl || detail.tvl.length === 0) return false

    // Get current TVL
    const currentTvl = detail.tvl[detail.tvl.length - 1]?.totalLiquidityUSD
    if (!currentTvl || currentTvl <= 0) return false

    return true
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    // This question works best as MC4 with bucket choices
    return ["mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    _seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!

    // Get current TVL - prefer historical series, fall back to sum of actual chains
    const currentTvl =
      detail.tvl[detail.tvl.length - 1]?.totalLiquidityUSD ??
      (detail.currentChainTvls
        ? sumActualChainTvl(detail.currentChainTvls)
        : 0)

    if (currentTvl <= 0) return null

    const bandIndex = getTvlBandIndex(currentTvl)
    const correctBand = TVL_BANDS[bandIndex].label

    // Use all 5 bands as choices (for educational value)
    // But if mc4, pick 4 adjacent bands including the correct one
    let choices: string[]
    let answerIndex: number

    if (format === "mc4") {
      // Pick 4 adjacent bands including the correct one
      let startIdx: number
      if (bandIndex === 0) {
        startIdx = 0
      } else if (bandIndex === TVL_BANDS.length - 1) {
        startIdx = TVL_BANDS.length - 4
      } else if (bandIndex === 1) {
        startIdx = 0
      } else {
        startIdx = bandIndex - 1
      }

      choices = TVL_BANDS.slice(startIdx, startIdx + 4).map((b) => b.label)
      answerIndex = bandIndex - startIdx
    } else {
      choices = TVL_BANDS.map((b) => b.label)
      answerIndex = bandIndex
    }

    // Calculate margin based on distance to boundary
    const distToBoundary = distanceToBoundary(currentTvl)
    const margin = Math.min(1, distToBoundary * 2) // Normalize

    return {
      templateId: this.id,
      format,
      prompt: `Which TVL range fits ${detail.name}?`,
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
        tvl: formatNumber(currentTvl),
        tvlBand: correctBand,
        tvlRank: ctx.topic.tvlRank,
      },
      buildNotes: [
        `TVL: ${formatNumber(currentTvl)} -> band: ${correctBand}`,
        `Distance to boundary: ${(distToBoundary * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const p10TVLBand = new P10TVLBand()
