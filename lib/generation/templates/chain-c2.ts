/**
 * C2: Chain TVL Comparison
 *
 * Compare TVL between two chains.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { abMargin } from "../metrics"
import { formatNumber } from "../distractors"
import { createRng } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

export class C2ChainTVLComparison extends ChainTemplate {
  id = "C2_CHAIN_COMPARISON"
  name = "Chain TVL Comparison"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need chain list for comparison
    const chainList = ctx.data.chainList
    if (!chainList || chainList.length < 2) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const topic = ctx.topic as ChainPoolEntry
    const chainList = ctx.data.chainList!

    // Find a suitable comparison chain
    const sorted = [...chainList].sort((a, b) => b.tvl - a.tvl)
    const topicIndex = sorted.findIndex((c) => c.name === topic.name)

    if (topicIndex < 0) return []

    // Find adjacent chain for comparison
    const compareIndex = topicIndex === 0 ? 1 : topicIndex - 1
    if (compareIndex >= sorted.length) return []

    const margin = abMargin(topic.tvl, sorted[compareIndex].tvl)

    // If margin is small, use bucketed comparison
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
    const topic = ctx.topic as ChainPoolEntry
    const chainList = ctx.data.chainList!

    // Sort chains by TVL
    const sorted = [...chainList].sort((a, b) => b.tvl - a.tvl)
    const topicIndex = sorted.findIndex((c) => c.name === topic.name)

    if (topicIndex < 0) return null

    const rng = createRng(seed)

    // Pick a comparison chain
    let compareChain: typeof sorted[0]

    if (sorted.length >= 3 && rng() > 0.6) {
      // Sometimes pick a non-adjacent chain for variety
      const offset = Math.floor(rng() * 3) + 1
      const compareIndex =
        topicIndex + (rng() > 0.5 ? offset : -offset)
      const safeIndex = Math.max(0, Math.min(sorted.length - 1, compareIndex))
      if (safeIndex !== topicIndex) {
        compareChain = sorted[safeIndex]
      } else {
        compareChain = sorted[topicIndex === 0 ? 1 : topicIndex - 1]
      }
    } else {
      // Default: compare with adjacent chain
      compareChain = sorted[topicIndex === 0 ? 1 : topicIndex - 1]
    }

    const topicTvl = topic.tvl
    const compareTvl = compareChain.tvl
    const margin = abMargin(topicTvl, compareTvl)!
    const topicIsHigher = topicTvl > compareTvl

    if (format === "ab") {
      const swapped = rng() > 0.5
      const choices = swapped
        ? [compareChain.name, topic.name]
        : [topic.name, compareChain.name]

      const correctName = topicIsHigher ? topic.name : compareChain.name
      const answerIndex = choices.indexOf(correctName)

      return {
        templateId: this.id,
        format,
        prompt: "Which chain has higher TVL?",
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin,
          volatility: null,
        },
        explainData: {
          winnerChain: topicIsHigher ? topic.name : compareChain.name,
          loserChain: topicIsHigher ? compareChain.name : topic.name,
          winnerTvl: formatNumber(topicIsHigher ? topicTvl : compareTvl),
          loserTvl: formatNumber(topicIsHigher ? compareTvl : topicTvl),
          marginPercent: Math.round(margin * 100),
        },
        buildNotes: [
          `Comparing ${topic.name} (${formatNumber(topicTvl)}) vs ${compareChain.name} (${formatNumber(compareTvl)})`,
          `Margin: ${(margin * 100).toFixed(1)}%`,
        ],
      }
    }

    // TF format
    const statement = `${topic.name} has higher TVL than ${compareChain.name}.`

    return {
      templateId: this.id,
      format,
      prompt: statement,
      answerValue: topicIsHigher,
      choices: ["True", "False"],
      answerIndex: topicIsHigher ? 0 : 1,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin,
        volatility: null,
      },
      explainData: {
        winnerChain: topicIsHigher ? topic.name : compareChain.name,
        loserChain: topicIsHigher ? compareChain.name : topic.name,
        winnerTvl: formatNumber(topicIsHigher ? topicTvl : compareTvl),
        loserTvl: formatNumber(topicIsHigher ? compareTvl : topicTvl),
        marginPercent: Math.round(margin * 100),
      },
      buildNotes: [
        `TF: "${statement}" -> ${topicIsHigher}`,
        `Margin: ${(margin * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const c2ChainTVLComparison = new C2ChainTVLComparison()
