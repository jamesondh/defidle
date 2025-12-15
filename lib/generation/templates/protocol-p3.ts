/**
 * P3: Top Chain Concentration
 *
 * What share of a protocol's TVL is on its dominant chain?
 * Only applicable to multi-chain protocols (2+ actual chains).
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { formatNumber, getConcentrationBucketChoices, getConcentrationBucketIndex } from "../distractors"
import { filterToActualChains, warnIfSingleChain } from "../chain-filter"

export class P3TopChainConcentration extends ProtocolTemplate {
  id = "P3_CONCENTRATION"
  name = "Top Chain Concentration"
  // Reveals per-chain TVL values in the explanation
  semanticTopics = ["tvl_absolute"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need chain TVL data
    const chainTvls = detail.currentChainTvls
    if (!chainTvls) return false

    // Filter to actual chains only (excludes "borrowed", "staking", etc.)
    const actualChains = filterToActualChains(chainTvls)

    // Need at least 2 actual chains for concentration to be meaningful
    // For single-chain protocols, asking "what % is on X" is nonsensical (always 100%)
    if (actualChains.length < 2) {
      warnIfSingleChain(detail.name, chainTvls, this.id)
      return false
    }

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const detail = ctx.data.protocolDetail!
    const chainTvls = detail.currentChainTvls

    // Filter to actual chains only
    const actualChains = filterToActualChains(chainTvls)

    if (actualChains.length < 2) {
      return []
    }

    return ["mc4", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    _seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const chainTvls = detail.currentChainTvls

    // Filter to actual chains only and sort by TVL
    const sorted = filterToActualChains(chainTvls).sort((a, b) => b[1] - a[1])

    // Need at least 2 chains for this template
    if (sorted.length < 2) return null

    const topChain = sorted[0][0]
    const topChainTvl = sorted[0][1]
    const totalTvl = sorted.reduce((sum, [, tvl]) => sum + tvl, 0)
    const topShare = topChainTvl / totalTvl

    // Format chain name
    const formatChainName = (name: string) =>
      name.charAt(0).toUpperCase() + name.slice(1)
    const topChainDisplay = formatChainName(topChain)

    if (format === "mc4") {
      const choices = getConcentrationBucketChoices()
      const answerIndex = getConcentrationBucketIndex(topShare)

      // Calculate margin based on distance to bucket boundary
      const boundaries = [0.25, 0.5, 0.75]
      const minDistToBoundary = Math.min(
        ...boundaries.map((b) => Math.abs(topShare - b))
      )
      const margin = Math.min(1, minDistToBoundary * 4) // Normalize

      return {
        templateId: this.id,
        format,
        prompt: `What share of ${detail.name}'s TVL is on its top chain (${topChainDisplay})?`,
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
          topChain: topChainDisplay,
          sharePercent: Math.round(topShare * 100),
          topChainTvl: formatNumber(topChainTvl),
          totalTvl: formatNumber(totalTvl),
          chainCount: sorted.length,
        },
        buildNotes: [
          `Top chain: ${topChainDisplay} with ${(topShare * 100).toFixed(1)}% share`,
          `Total TVL: ${formatNumber(totalTvl)}`,
          `Chains: ${sorted.length}`,
        ],
      }
    }

    // TF format - ask if >50% or >75%
    const threshold = topShare > 0.75 ? 0.75 : 0.5
    const thresholdStr = threshold === 0.75 ? "75%" : "50%"
    const statement = `More than ${thresholdStr} of ${detail.name}'s TVL is on ${topChainDisplay}.`
    const answerValue = topShare > threshold

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
        margin: Math.abs(topShare - threshold),
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: detail.name,
        topChain: topChainDisplay,
        sharePercent: Math.round(topShare * 100),
        topChainTvl: formatNumber(topChainTvl),
        totalTvl: formatNumber(totalTvl),
        chainCount: sorted.length,
      },
      buildNotes: [
        `TF: "${statement}" -> ${answerValue}`,
        `Actual share: ${(topShare * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const p3TopChainConcentration = new P3TopChainConcentration()
