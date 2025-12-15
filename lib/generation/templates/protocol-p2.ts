/**
 * P2: Cross-Chain Dominance
 *
 * Compare a protocol's TVL across two chains.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { abMargin } from "../metrics"
import { formatNumber } from "../distractors"
import { createRng } from "../rng"
import { isActualChain } from "../chain-filter"

export class P2CrossChainDominance extends ProtocolTemplate {
  id = "P2_CROSSCHAIN"
  name = "Cross-Chain Dominance"
  // Reveals per-chain TVL values in the explanation
  semanticTopics = ["tvl_absolute"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need at least 2 chains with TVL data
    const chainTvls = detail.currentChainTvls
    if (!chainTvls) return false

    const nonZeroChains = Object.entries(chainTvls).filter(
      ([key, tvl]) => tvl > 0 && isActualChain(key)
    )
    if (nonZeroChains.length < 2) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const detail = ctx.data.protocolDetail!
    const chainTvls = detail.currentChainTvls

    // Get sorted chain TVLs (filtering out non-chain keys like "borrowed")
    const sorted = Object.entries(chainTvls)
      .filter(([key, tvl]) => tvl > 0 && isActualChain(key))
      .sort((a, b) => b[1] - a[1])

    if (sorted.length < 2) return []

    const margin = abMargin(sorted[0][1], sorted[1][1])

    // If margin is small, prefer tf with "about equal" nuance
    if (margin !== null && margin < 0.15) {
      return ["tf"]
    }

    return ["ab", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const chainTvls = detail.currentChainTvls

    // Get sorted chain TVLs (filtering out non-chain keys like "borrowed")
    const sorted = Object.entries(chainTvls)
      .filter(([key, tvl]) => tvl > 0 && isActualChain(key))
      .sort((a, b) => b[1] - a[1])

    if (sorted.length < 2) return null

    const rng = createRng(seed)

    // Pick two chains to compare
    // For variety, sometimes pick non-adjacent pairs
    let chainA: string
    let chainB: string
    let tvlA: number
    let tvlB: number

    if (sorted.length >= 3 && rng() > 0.5) {
      // Pick chain 1 vs chain 3 for more challenge
      chainA = sorted[0][0]
      chainB = sorted[2][0]
      tvlA = sorted[0][1]
      tvlB = sorted[2][1]
    } else {
      // Default: compare top 2 chains
      chainA = sorted[0][0]
      chainB = sorted[1][0]
      tvlA = sorted[0][1]
      tvlB = sorted[1][1]
    }

    const margin = abMargin(tvlA, tvlB)!

    // Format names for display (capitalize first letter)
    const formatChainName = (name: string) =>
      name.charAt(0).toUpperCase() + name.slice(1)

    const chainADisplay = formatChainName(chainA)
    const chainBDisplay = formatChainName(chainB)

    if (format === "ab") {
      // Randomly order the choices
      const swapped = rng() > 0.5
      const choices = swapped
        ? [chainBDisplay, chainADisplay]
        : [chainADisplay, chainBDisplay]
      const answerIndex = swapped ? 1 : 0

      return {
        templateId: this.id,
        format,
        prompt: `Where does ${detail.name} have higher TVL?`,
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
          winnerChain: chainADisplay,
          loserChain: chainBDisplay,
          winnerTvl: formatNumber(tvlA),
          loserTvl: formatNumber(tvlB),
          marginPercent: Math.round(margin * 100),
        },
        buildNotes: [
          `Comparing ${chainADisplay} (${formatNumber(tvlA)}) vs ${chainBDisplay} (${formatNumber(tvlB)})`,
          `Margin: ${(margin * 100).toFixed(1)}%`,
        ],
      }
    }

    // TF format
    const isHigher = tvlA > tvlB
    const statement = `${detail.name} has higher TVL on ${chainADisplay} than on ${chainBDisplay}.`

    return {
      templateId: this.id,
      format,
      prompt: statement,
      answerValue: isHigher,
      choices: ["True", "False"],
      answerIndex: isHigher ? 0 : 1,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
        margin,
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: detail.name,
        winnerChain: chainADisplay,
        loserChain: chainBDisplay,
        winnerTvl: formatNumber(tvlA),
        loserTvl: formatNumber(tvlB),
        marginPercent: Math.round(margin * 100),
      },
      buildNotes: [
        `TF: "${statement}" -> ${isHigher}`,
        `Margin: ${(margin * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const p2CrossChainDominance = new P2CrossChainDominance()
