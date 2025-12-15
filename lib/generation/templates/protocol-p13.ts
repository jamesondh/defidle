/**
 * P13: TVL Rank Comparison
 *
 * Compare a protocol's TVL rank to another similar protocol.
 * Works well for single-chain protocols since it doesn't require chain data.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { deterministicShuffle } from "../rng"
import type { ProtocolPoolEntry } from "@/lib/types/pools"

export class P13TVLRankComparison extends ProtocolTemplate {
  id = "P13_TVL_RANK_COMPARISON"
  name = "TVL Rank Comparison"
  // Reveals relative TVL rankings (may mention absolute values in explanation)
  semanticTopics = ["tvl_absolute"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    // Need protocol list for comparison
    if (!ctx.data.protocolList || ctx.data.protocolList.length < 10) return false

    return true
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    return ["ab", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ProtocolPoolEntry
    const list = ctx.data.protocolList!

    // Find comparison protocols in similar TVL range
    const topicRank = topic.tvlRank

    // Get protocols within a reasonable rank range
    const candidates = list
      .filter((p) => {
        if (p.slug === topic.slug) return false
        if (!p.tvl || p.tvl <= 0) return false
        // Find protocols ranked within 20 spots
        const listIndex = list.findIndex((x) => x.slug === p.slug)
        return Math.abs(listIndex - topicRank) <= 20 && Math.abs(listIndex - topicRank) >= 3
      })
      .slice(0, 10)

    if (candidates.length < 1) return null

    // Select a comparison protocol
    const shuffled = deterministicShuffle(candidates, `${seed}:compare`)
    const compareProtocol = shuffled[0]
    const compareIndex = list.findIndex((x) => x.slug === compareProtocol.slug)
    
    // Topic has higher rank (better) if topicRank < compareIndex
    const topicIsHigher = topicRank < compareIndex

    if (format === "ab") {
      // "Which protocol has higher TVL?"
      const winner = topicIsHigher ? topic : compareProtocol
      const loser = topicIsHigher ? compareProtocol : topic

      // Randomize choice order
      const swapOrder = seed % 2 === 0
      const choices = swapOrder
        ? [loser.name, winner.name]
        : [winner.name, loser.name]
      const answerIndex = swapOrder ? 1 : 0

      // Calculate margin based on rank difference
      const rankDiff = Math.abs(topicRank - compareIndex)
      const margin = Math.min(1, rankDiff / 50) // Larger rank diff = easier

      return {
        templateId: this.id,
        format,
        prompt: `Which protocol has higher TVL?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin,
          volatility: null,
        },
        explainData: {
          protocolA: topic.name,
          protocolB: compareProtocol.name,
          rankA: topicRank,
          rankB: compareIndex,
          winner: winner.name,
          loser: loser.name,
        },
        buildNotes: [
          `${topic.name} rank: ${topicRank}`,
          `${compareProtocol.name} rank: ${compareIndex}`,
          `Winner: ${winner.name}`,
        ],
      }
    }

    // TF format - "Is {topic} ranked higher than {compare}?"
    const answerValue = topicIsHigher

    return {
      templateId: this.id,
      format,
      prompt: `${topic.name} has higher TVL than ${compareProtocol.name}.`,
      choices: ["True", "False"],
      answerIndex: answerValue ? 0 : 1,
      answerValue,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: Math.min(1, Math.abs(topicRank - compareIndex) / 50),
        volatility: null,
      },
      explainData: {
        protocolA: topic.name,
        protocolB: compareProtocol.name,
        rankA: topicRank,
        rankB: compareIndex,
        isHigher: topicIsHigher,
      },
      buildNotes: [
        `${topic.name} rank: ${topicRank}`,
        `${compareProtocol.name} rank: ${compareIndex}`,
        `Topic is higher: ${topicIsHigher}`,
      ],
    }
  }
}

export const p13TVLRankComparison = new P13TVLRankComparison()
