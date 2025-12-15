/**
 * P9: Top Chain Name
 *
 * Which chain has the most TVL for a multi-chain protocol?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { abMargin } from "../metrics"
import { formatNumber } from "../distractors"
import { deterministicShuffle } from "../rng"
import { filterToActualChains, warnIfSingleChain } from "../chain-filter"

// Popular chains for distractors when needed
const POPULAR_CHAINS = [
  "Ethereum",
  "Arbitrum",
  "Polygon",
  "Optimism",
  "Base",
  "BSC",
  "Avalanche",
  "Fantom",
  "zkSync Era",
  "Linea",
  "Scroll",
  "Blast",
]

export class P9TopChainName extends ProtocolTemplate {
  id = "P9_TOP_CHAIN"
  name = "Top Chain Name"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need chain TVL data with at least 2 actual chains
    const chainTvls = detail.currentChainTvls
    if (!chainTvls) return false

    // Filter to actual chains (excludes "borrowed", "staking", etc.)
    const actualChains = filterToActualChains(chainTvls)

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
    const sorted = filterToActualChains(chainTvls).sort((a, b) => b[1] - a[1])

    // If only 2 chains, use TF
    if (sorted.length === 2) {
      return ["tf"]
    }

    // Check margin between top 2
    const margin = abMargin(sorted[0][1], sorted[1][1])
    
    // If margin is very small, prefer tf to avoid ambiguity
    if (margin !== null && margin < 0.15) {
      return ["tf", "mc4"]
    }

    return ["mc4", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const chainTvls = detail.currentChainTvls

    // Filter to actual chains only and sort by TVL
    const sorted = filterToActualChains(chainTvls).sort((a, b) => b[1] - a[1])

    if (sorted.length < 2) return null

    const topChain = sorted[0][0]
    const topChainTvl = sorted[0][1]
    const secondChain = sorted[1][0]
    const secondChainTvl = sorted[1][1]
    const totalTvl = sorted.reduce((sum, [, tvl]) => sum + tvl, 0)
    const topShare = topChainTvl / totalTvl

    // Format chain names for display
    const formatChainName = (name: string) =>
      name.charAt(0).toUpperCase() + name.slice(1)

    const topChainDisplay = formatChainName(topChain)
    const secondChainDisplay = formatChainName(secondChain)

    const margin = abMargin(topChainTvl, secondChainTvl)!

    if (format === "tf") {
      // Ask if the top chain has more TVL than the second chain
      const statement = `${detail.name} has more TVL on ${topChainDisplay} than on ${secondChainDisplay}.`
      const answerValue = true // topChain is always the leader

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
          margin,
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: detail.name,
          topChain: topChainDisplay,
          topChainTvl: formatNumber(topChainTvl),
          secondChain: secondChainDisplay,
          secondChainTvl: formatNumber(secondChainTvl),
          sharePercent: Math.round(topShare * 100),
          marginPercent: Math.round(margin * 100),
        },
        buildNotes: [
          `TF: "${statement}" -> ${answerValue}`,
          `Top: ${topChainDisplay} (${formatNumber(topChainTvl)})`,
          `Second: ${secondChainDisplay} (${formatNumber(secondChainTvl)})`,
          `Margin: ${(margin * 100).toFixed(1)}%`,
        ],
      }
    }

    // MC4 format - "On which chain does {protocol} have the most TVL?"
    // Use other chains the protocol is on as distractors
    const otherChains = sorted.slice(1).map(([chain]) => formatChainName(chain))

    let distractors: string[]
    if (otherChains.length >= 3) {
      // Shuffle and pick 3 from protocol's other chains
      const shuffled = deterministicShuffle(otherChains, `${seed}:distractors`)
      distractors = shuffled.slice(0, 3)
    } else {
      // Need to add some popular chains the protocol isn't on
      const protocolChains = new Set(sorted.map(([c]) => c.toLowerCase()))
      const absentPopular = POPULAR_CHAINS.filter(
        (c) => !protocolChains.has(c.toLowerCase())
      )
      const shuffledAbsent = deterministicShuffle(absentPopular, `${seed}:absent`)
      const needed = 3 - otherChains.length
      distractors = [...otherChains, ...shuffledAbsent.slice(0, needed)]
    }

    // Build choices
    const allChoices = [topChainDisplay, ...distractors]
    const shuffledChoices = deterministicShuffle(
      allChoices.map((chain, i) => ({ chain, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )

    const choices = shuffledChoices.map((x) => x.chain)
    const answerIndex = shuffledChoices.findIndex((x) => x.isCorrect)

    return {
      templateId: this.id,
      format,
      prompt: `On which chain does ${detail.name} have the most TVL?`,
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
        topChainTvl: formatNumber(topChainTvl),
        sharePercent: Math.round(topShare * 100),
        chainCount: sorted.length,
        secondChain: secondChainDisplay,
        secondChainTvl: formatNumber(secondChainTvl),
      },
      buildNotes: [
        `Top chain: ${topChainDisplay} with ${formatNumber(topChainTvl)} (${(topShare * 100).toFixed(1)}%)`,
        `Distractors: ${distractors.join(", ")}`,
        `Margin over #2: ${(margin * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const p9TopChainName = new P9TopChainName()
