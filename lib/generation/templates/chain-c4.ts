/**
 * C4: Chain Growth Ranking
 *
 * Rank chains by recent TVL growth.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"

import { deterministicShuffle, createRng } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

interface ChainGrowth {
  name: string
  change30d: number
}

export class C4ChainGrowthRanking extends ChainTemplate {
  id = "C4_GROWTH_RANKING"
  name = "Chain Growth Ranking"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // This template requires actual 30d growth data for multiple chains.
    // Currently we don't fetch historical TVL for chains other than the topic,
    // so we cannot accurately compute growth rankings.
    // 
    // TODO: To enable this template, we would need to either:
    // 1. Pre-compute chain growth data in the pools refresh script
    // 2. Fetch historical data for top N chains during episode generation
    //
    // For now, fail prereqs to prevent generating questions with fake data.
    return false
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    // For ranking questions, we need good separation
    // Without actual change data, default to safer formats
    return ["mc4", "ab"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const chainList = ctx.data.chainList!

    // Mock growth data - in real implementation, this would come from derived metrics
    // For now, generate pseudo-random growth based on seed
    const rng = createRng(seed)

    const growthData: ChainGrowth[] = chainList.slice(0, 20).map((chain) => ({
      name: chain.name,
      // Generate pseudo-growth between -30% and +50%
      change30d: (rng() * 0.8 - 0.3),
    }))

    // Sort by growth
    const sorted = [...growthData].sort((a, b) => b.change30d - a.change30d)

    // Ensure topic is in the selection
    const topicGrowth = sorted.find((c) => c.name === topic.name) ?? {
      name: topic.name,
      change30d: rng() * 0.4 - 0.1,
    }

    if (format === "mc4") {
      // "Which chain grew most in the last 30 days?"
      const topGrower = sorted[0]

      // Get 3 distractors from top 10
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
      const choiceData = allChoices.map((c) => ({
        name: c.name,
        change: `${c.change30d > 0 ? "+" : ""}${(c.change30d * 100).toFixed(1)}%`,
      }))
      
      // Find the distractors' data in order
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

    // AB format - compare two chains
    const chainA = sorted[0]
    const chainB = sorted.length > 1 ? sorted[1] : topicGrowth

    const swapped = rng() > 0.5
    const choices = swapped
      ? [chainB.name, chainA.name]
      : [chainA.name, chainB.name]
    const answerIndex = swapped ? 1 : 0

    const margin = Math.abs(chainA.change30d - chainB.change30d)
    
    // Winner is chainA (higher growth), loser is chainB
    const winner = chainA
    const loser = chainB

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
        // Include comparison context
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
