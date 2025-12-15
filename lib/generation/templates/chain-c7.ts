/**
 * C7: Chain TVL Band
 *
 * Which TVL range fits a chain?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { formatNumber } from "../distractors"
import type { ChainPoolEntry } from "@/lib/types/pools"

// Chain TVL bands as specified in question-templates.md
const CHAIN_TVL_BANDS = [
  { label: "<$100M", min: 0, max: 100_000_000 },
  { label: "$100M-$500M", min: 100_000_000, max: 500_000_000 },
  { label: "$500M-$2B", min: 500_000_000, max: 2_000_000_000 },
  { label: "$2B-$10B", min: 2_000_000_000, max: 10_000_000_000 },
  { label: ">$10B", min: 10_000_000_000, max: Infinity },
]

/**
 * Get chain TVL band index for a given TVL value
 */
function getChainTvlBandIndex(tvl: number): number {
  for (let i = 0; i < CHAIN_TVL_BANDS.length; i++) {
    if (tvl < CHAIN_TVL_BANDS[i].max) {
      return i
    }
  }
  return CHAIN_TVL_BANDS.length - 1
}

/**
 * Calculate distance to nearest bucket boundary (as fraction of TVL)
 */
function distanceToBoundary(tvl: number): number {
  const boundaries = [100_000_000, 500_000_000, 2_000_000_000, 10_000_000_000]
  let minDist = Infinity
  
  for (const boundary of boundaries) {
    const dist = Math.abs(tvl - boundary) / tvl
    if (dist < minDist) {
      minDist = dist
    }
  }
  
  return minDist
}

export class C7ChainTVLBand extends ChainTemplate {
  id = "C7_CHAIN_TVL_BAND"
  name = "Chain TVL Band"
  semanticTopics = ["tvl_magnitude"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    const topic = ctx.topic as ChainPoolEntry
    if (!topic.tvl || topic.tvl <= 0) return false

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
    const topic = ctx.topic as ChainPoolEntry
    const tvl = topic.tvl

    if (!tvl || tvl <= 0) return null

    const bandIndex = getChainTvlBandIndex(tvl)
    const correctBand = CHAIN_TVL_BANDS[bandIndex].label

    // Use 4 adjacent bands including the correct one
    let startIdx: number
    if (bandIndex === 0) {
      startIdx = 0
    } else if (bandIndex === CHAIN_TVL_BANDS.length - 1) {
      startIdx = CHAIN_TVL_BANDS.length - 4
    } else if (bandIndex === 1) {
      startIdx = 0
    } else {
      startIdx = bandIndex - 1
    }

    // Handle case where we have fewer than 4 bands available
    const endIdx = Math.min(startIdx + 4, CHAIN_TVL_BANDS.length)
    startIdx = Math.max(0, endIdx - 4)

    const choices = CHAIN_TVL_BANDS.slice(startIdx, endIdx).map((b) => b.label)
    const answerIndex = bandIndex - startIdx

    // Calculate margin based on distance to boundary
    const distToBoundary = distanceToBoundary(tvl)
    const margin = Math.min(1, distToBoundary * 2) // Normalize

    return {
      templateId: this.id,
      format,
      prompt: `Which TVL range fits ${topic.name}?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin,
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: topic.name,
        tvl: formatNumber(tvl),
        tvlBand: correctBand,
        tvlRank: topic.tvlRank,
      },
      buildNotes: [
        `TVL: ${formatNumber(tvl)} -> band: ${correctBand}`,
        `Distance to boundary: ${(distToBoundary * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const c7ChainTVLBand = new C7ChainTVLBand()
