/**
 * C4: Chain Growth Ranking
 *
 * Rank chains by recent TVL growth.
 * Uses pre-computed 30d change data from the chain pool.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"

import { deterministicShuffle } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

interface ChainGrowth {
  name: string
  change30d: number
}

export class C4ChainGrowthRanking extends ChainTemplate {
  id = "C4_GROWTH_RANKING"
  name = "Chain Growth Ranking"
  // Asks about TVL growth over time (trend)
  semanticTopics = ["tvl_trend"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need chain pool data with change30d computed
    const chainPool = ctx.data.chainPool
    if (!chainPool || chainPool.length < 4) return false

    // Count how many chains have valid change30d data
    const chainsWithGrowth = chainPool.filter(
      (c: ChainPoolEntry) => c.change30d !== undefined && c.change30d !== null
    )
    
    // Need at least 4 chains with growth data for mc4 format
    if (chainsWithGrowth.length < 4) return false

    return true
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    return ["mc4", "ab"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const chainPool = ctx.data.chainPool!

    // Build growth data from pool
    const growthData: ChainGrowth[] = chainPool
      .filter((c: ChainPoolEntry) => c.change30d !== undefined && c.change30d !== null)
      .map((c: ChainPoolEntry) => ({
        name: c.name,
        change30d: c.change30d!,
      }))

    if (growthData.length < 4) return null

    // Sort by growth descending
    const sorted = [...growthData].sort((a, b) => b.change30d - a.change30d)

    if (format === "mc4") {
      // "Which chain grew most in the last 30 days?"
      const topGrower = sorted[0]

      // Get 3 distractors - mix of high and low performers for variety
      // Take from top 10 to keep choices plausible
      const candidates = sorted.slice(1, 10).filter((c) => c.name !== topGrower.name)
      const shuffledCandidates = deterministicShuffle(candidates, `${seed}:distractors`)
      const distractors = shuffledCandidates.slice(0, 3)

      if (distractors.length < 3) return null

      const allChoices = [topGrower, ...distractors]
      const shuffled = deterministicShuffle(
        allChoices.map((c, i) => ({ name: c.name, isCorrect: i === 0 })),
        `${seed}:shuffle`
      )

      const choices = shuffled.map((x) => x.name)
      const answerIndex = shuffled.findIndex((x) => x.isCorrect)

      // Calculate margin between top 2
      const margin = sorted.length >= 2
        ? Math.abs(sorted[0].change30d - sorted[1].change30d)
        : 0.1

      // Build comparison data for all choices
      const distractorData = distractors.map((d) => ({
        name: d.name,
        change: `${d.change30d > 0 ? "+" : ""}${(d.change30d * 100).toFixed(1)}%`,
      }))

      return {
        templateId: this.id,
        format,
        prompt: "Which of these chains grew the most in TVL over the past 30 days?",
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.min(1, margin),
          volatility: null,
        },
        explainData: {
          topChain: topGrower.name,
          topGrowth: `${(topGrower.change30d * 100).toFixed(1)}`,
          topChange: `${topGrower.change30d > 0 ? "+" : ""}${(topGrower.change30d * 100).toFixed(1)}%`,
          // Include comparison data for wrong choices
          otherChains: distractorData,
          comparison: distractorData.map((d) => `${d.name} (${d.change})`).join(", "),
        },
        buildNotes: [
          `Top grower: ${topGrower.name} with ${(topGrower.change30d * 100).toFixed(1)}%`,
          `Other choices: ${distractorData.map((d) => `${d.name}: ${d.change}`).join(", ")}`,
        ],
      }
    }

    // AB format - compare two chains from different parts of the ranking
    const chainA = sorted[0] // Top grower
    // Find topic chain's growth, or use #2 if topic isn't in the list
    const topicGrowth = sorted.find((c) => c.name === topic.name)
    const chainB = topicGrowth && topicGrowth !== chainA 
      ? topicGrowth 
      : sorted[Math.min(1, sorted.length - 1)]

    // Determine which is actually higher
    const winner = chainA.change30d >= chainB.change30d ? chainA : chainB
    const loser = winner === chainA ? chainB : chainA

    // Randomize order of choices
    const swapOrder = seed % 2 === 0
    const choices = swapOrder
      ? [loser.name, winner.name]
      : [winner.name, loser.name]
    const answerIndex = swapOrder ? 1 : 0

    const margin = Math.abs(chainA.change30d - chainB.change30d)

    return {
      templateId: this.id,
      format,
      prompt: "Which chain grew more in TVL over the past 30 days?",
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: Math.min(1, margin),
        volatility: null,
      },
      explainData: {
        chainA: chainA.name,
        chainB: chainB.name,
        changeA: `${chainA.change30d > 0 ? "+" : ""}${(chainA.change30d * 100).toFixed(1)}%`,
        changeB: `${chainB.change30d > 0 ? "+" : ""}${(chainB.change30d * 100).toFixed(1)}%`,
        winnerChain: winner.name,
        winnerChange: `${winner.change30d > 0 ? "+" : ""}${(winner.change30d * 100).toFixed(1)}%`,
        loserChain: loser.name,
        loserChange: `${loser.change30d > 0 ? "+" : ""}${(loser.change30d * 100).toFixed(1)}%`,
        comparison: `${winner.name} grew ${(winner.change30d * 100).toFixed(1)}% vs ${loser.name}'s ${(loser.change30d * 100).toFixed(1)}%`,
      },
      buildNotes: [
        `${chainA.name}: ${(chainA.change30d * 100).toFixed(1)}%`,
        `${chainB.name}: ${(chainB.change30d * 100).toFixed(1)}%`,
      ],
    }
  }
}

export const c4ChainGrowthRanking = new C4ChainGrowthRanking()
