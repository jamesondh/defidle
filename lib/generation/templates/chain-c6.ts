/**
 * C6: Top DEX by Volume
 *
 * Which DEX has the highest volume on a given chain?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { top2Margin } from "../metrics"
import { formatNumber } from "../distractors"
import { deterministicShuffle, createRng } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

export class C6TopDEXByVolume extends ChainTemplate {
  id = "C6_TOP_DEX"
  name = "Top DEX by Volume"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need chain DEX volume data with at least 4 DEXes
    const chainDexVolume = ctx.data.chainDexVolume
    if (!chainDexVolume) return false

    const dexes = chainDexVolume.protocols.filter(
      (p) => p.total24h !== undefined && p.total24h > 0
    )

    return dexes.length >= 4
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const chainDexVolume = ctx.data.chainDexVolume!
    const sorted = chainDexVolume.protocols
      .filter((p) => p.total24h !== undefined && p.total24h > 0)
      .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))

    if (sorted.length < 2) return []

    const margin = top2Margin([sorted[0].total24h ?? 0, sorted[1].total24h ?? 0])

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
    const chainDexVolume = ctx.data.chainDexVolume!

    // Get DEXes sorted by volume
    const sorted = chainDexVolume.protocols
      .filter((p) => p.total24h !== undefined && p.total24h > 0)
      .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))

    if (sorted.length < 2) return null

    const topDex = sorted[0]
    const topVolume = topDex.total24h ?? 0
    const totalVolume = sorted.reduce((sum, p) => sum + (p.total24h ?? 0), 0)
    const sharePercent = totalVolume > 0 ? Math.round((topVolume / totalVolume) * 100) : 0

    const margin = top2Margin([sorted[0].total24h ?? 0, sorted[1].total24h ?? 0]) ?? 0.1

    const rng = createRng(seed)

    if (format === "mc4") {
      // Get 3 distractors from top 10
      const distractors = sorted.slice(1, 10)
      const shuffledDistractors = deterministicShuffle(distractors, `${seed}:distractors`)
      const selectedDistractors = shuffledDistractors.slice(0, 3)

      if (selectedDistractors.length < 3) return null

      const allChoices = [topDex, ...selectedDistractors]
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
        prompt: `Which DEX is #1 by 24h volume on ${topic.name}?`,
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
          topDex: topDex.displayName ?? topDex.name,
          volumeAmount: formatNumber(topVolume),
          sharePercent,
        },
        buildNotes: [
          `Top DEX: ${topDex.name} with ${formatNumber(topVolume)} volume`,
          `Margin over #2: ${(margin * 100).toFixed(1)}%`,
        ],
      }
    }

    // AB format - compare top 2
    const secondDex = sorted[1]

    const swapped = rng() > 0.5
    const choices = swapped
      ? [secondDex.displayName ?? secondDex.name, topDex.displayName ?? topDex.name]
      : [topDex.displayName ?? topDex.name, secondDex.displayName ?? secondDex.name]
    const answerIndex = swapped ? 1 : 0

    return {
      templateId: this.id,
      format,
      prompt: `Which DEX has higher 24h volume on ${topic.name}?`,
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
        topDex: topDex.displayName ?? topDex.name,
        topVolume: formatNumber(topVolume),
        secondDex: secondDex.displayName ?? secondDex.name,
        secondVolume: formatNumber(secondDex.total24h ?? 0),
      },
      buildNotes: [
        `${topDex.name}: ${formatNumber(topVolume)}`,
        `${secondDex.name}: ${formatNumber(secondDex.total24h ?? 0)}`,
      ],
    }
  }
}

export const c6TopDEXByVolume = new C6TopDEXByVolume()
