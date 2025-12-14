/**
 * C5: Top Protocol by Fees
 *
 * Which protocol generates the most fees on a given chain?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { top2Margin } from "../metrics"
import { formatNumber } from "../distractors"
import { deterministicShuffle, createRng } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

export class C5TopProtocolByFees extends ChainTemplate {
  id = "C5_TOP_BY_FEES"
  name = "Top Protocol by Fees"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need chain fees data with at least 4 protocols
    const chainFees = ctx.data.chainFees
    if (!chainFees) return false

    const protocols = chainFees.protocols.filter(
      (p) => p.fees24h !== undefined && p.fees24h > 0
    )

    return protocols.length >= 4
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const chainFees = ctx.data.chainFees!
    const sorted = chainFees.protocols
      .filter((p) => p.fees24h !== undefined && p.fees24h > 0)
      .sort((a, b) => (b.fees24h ?? 0) - (a.fees24h ?? 0))

    if (sorted.length < 2) return []

    const margin = top2Margin([sorted[0].fees24h ?? 0, sorted[1].fees24h ?? 0])

    // If margin is small, prefer AB format
    if (margin !== null && margin < 0.15) {
      return ["ab"]
    }

    return ["mc4", "ab"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const chainFees = ctx.data.chainFees!

    // Get protocols sorted by fees
    const sorted = chainFees.protocols
      .filter((p) => p.fees24h !== undefined && p.fees24h > 0)
      .sort((a, b) => (b.fees24h ?? 0) - (a.fees24h ?? 0))

    if (sorted.length < 2) return null

    const topProtocol = sorted[0]
    const topFees = topProtocol.fees24h ?? 0
    const totalFees = sorted.reduce((sum, p) => sum + (p.fees24h ?? 0), 0)
    const sharePercent = totalFees > 0 ? Math.round((topFees / totalFees) * 100) : 0

    const margin = top2Margin([sorted[0].fees24h ?? 0, sorted[1].fees24h ?? 0]) ?? 0.1

    const rng = createRng(seed)

    if (format === "mc4") {
      // Get 3 distractors from top 10
      const distractors = sorted.slice(1, 10)
      const shuffledDistractors = deterministicShuffle(distractors, `${seed}:distractors`)
      const selectedDistractors = shuffledDistractors.slice(0, 3)

      if (selectedDistractors.length < 3) return null

      const allChoices = [topProtocol, ...selectedDistractors]
      const shuffled = deterministicShuffle(
        allChoices.map((p, i) => ({
          name: p.displayName ?? p.name,
          isCorrect: i === 0,
        })),
        `${seed}:shuffle`
      )

      const choices = shuffled.map((x) => x.name)
      const answerIndex = shuffled.findIndex((x) => x.isCorrect)

      return {
        templateId: this.id,
        format,
        prompt: `Which protocol is #1 by 24h fees on ${topic.name}?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin,
          volatility: null,
        },
        explainData: {
          chain: topic.name,
          topProtocol: topProtocol.displayName ?? topProtocol.name,
          feesAmount: formatNumber(topFees),
          sharePercent,
        },
        buildNotes: [
          `Top protocol: ${topProtocol.name} with ${formatNumber(topFees)} fees`,
          `Margin over #2: ${(margin * 100).toFixed(1)}%`,
        ],
      }
    }

    // AB format - compare top 2
    const secondProtocol = sorted[1]

    const swapped = rng() > 0.5
    const choices = swapped
      ? [secondProtocol.displayName ?? secondProtocol.name, topProtocol.displayName ?? topProtocol.name]
      : [topProtocol.displayName ?? topProtocol.name, secondProtocol.displayName ?? secondProtocol.name]
    const answerIndex = swapped ? 1 : 0

    return {
      templateId: this.id,
      format,
      prompt: `Which protocol generates more in 24h fees on ${topic.name}?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin,
        volatility: null,
      },
      explainData: {
        chain: topic.name,
        topProtocol: topProtocol.displayName ?? topProtocol.name,
        topFees: formatNumber(topFees),
        secondProtocol: secondProtocol.displayName ?? secondProtocol.name,
        secondFees: formatNumber(secondProtocol.fees24h ?? 0),
      },
      buildNotes: [
        `${topProtocol.name}: ${formatNumber(topFees)}`,
        `${secondProtocol.name}: ${formatNumber(secondProtocol.fees24h ?? 0)}`,
      ],
    }
  }
}

export const c5TopProtocolByFees = new C5TopProtocolByFees()
