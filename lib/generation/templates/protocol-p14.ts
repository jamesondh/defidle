/**
 * P14: Category Leader Comparison
 *
 * Compare protocol to another in the same category.
 * Works well for single-chain protocols since it doesn't require chain data.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { deterministicShuffle } from "../rng"
import type { ProtocolPoolEntry } from "@/lib/types/pools"
import { formatNumber } from "../distractors"

export class P14CategoryLeaderComparison extends ProtocolTemplate {
  id = "P14_CATEGORY_LEADER"
  name = "Category Leader Comparison"
  semanticTopics = ["tvl_comparison"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail?.category) return false

    // Need protocol list for comparison
    if (!ctx.data.protocolList || ctx.data.protocolList.length < 10) return false

    // Find other protocols in the same category
    const sameCategory = ctx.data.protocolList.filter(
      (p) => p.category === detail.category && p.slug !== ctx.topic.slug && p.tvl > 0
    )

    // Need at least one other protocol in the category
    return sameCategory.length >= 1
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    return ["ab", "mc4", "tf"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ProtocolPoolEntry
    const detail = ctx.data.protocolDetail!
    const list = ctx.data.protocolList!

    const category = detail.category

    // Get protocols in the same category, sorted by TVL
    const sameCategory = list
      .filter((p) => p.category === category && p.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)

    if (sameCategory.length < 2) return null

    // Find topic's rank within category
    const topicCategoryRank = sameCategory.findIndex((p) => p.slug === topic.slug) + 1

    if (format === "mc4") {
      // "Which is the #1 protocol in {category}?"
      const categoryLeader = sameCategory[0]
      
      // Get 3 distractors from the same category
      const distractorCandidates = sameCategory.slice(1, 8).filter((p) => p.slug !== topic.slug)
      
      if (distractorCandidates.length < 3) return null

      const shuffledDistractors = deterministicShuffle(distractorCandidates, `${seed}:distract`)
      const distractors = shuffledDistractors.slice(0, 3)

      const allChoices = [categoryLeader, ...distractors]
      const shuffled = deterministicShuffle(
        allChoices.map((p, i) => ({ name: p.name, isCorrect: i === 0 })),
        `${seed}:shuffle`
      )

      const choices = shuffled.map((x) => x.name)
      const answerIndex = shuffled.findIndex((x) => x.isCorrect)

      // Margin based on TVL gap between #1 and #2
      const margin = sameCategory.length >= 2
        ? (sameCategory[0].tvl - sameCategory[1].tvl) / sameCategory[0].tvl
        : 0.3

      return {
        templateId: this.id,
        format,
        prompt: `Which protocol has the most TVL in the ${category} category?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.min(1, margin),
          volatility: null,
        },
        explainData: {
          category,
          leader: categoryLeader.name,
          leaderTvl: formatNumber(categoryLeader.tvl),
          topicName: topic.name,
          topicCategoryRank,
          distractors: distractors.map((d) => ({
            name: d.name,
            tvl: formatNumber(d.tvl),
          })),
        },
        buildNotes: [
          `Category: ${category}`,
          `Leader: ${categoryLeader.name} (${formatNumber(categoryLeader.tvl)})`,
          `${topic.name} is #${topicCategoryRank} in category`,
        ],
      }
    }

    if (format === "ab") {
      // Compare topic to another protocol in category
      const otherInCategory = sameCategory.filter((p) => p.slug !== topic.slug)
      if (otherInCategory.length < 1) return null

      const shuffled = deterministicShuffle(otherInCategory.slice(0, 5), `${seed}:compare`)
      const compareProtocol = shuffled[0]

      const topicIsHigher = topic.tvl > compareProtocol.tvl
      const winner = topicIsHigher ? topic : compareProtocol
      const loser = topicIsHigher ? compareProtocol : topic

      // Randomize order
      const swapOrder = seed % 2 === 0
      const choices = swapOrder
        ? [loser.name, winner.name]
        : [winner.name, loser.name]
      const answerIndex = swapOrder ? 1 : 0

      const margin = Math.abs(topic.tvl - compareProtocol.tvl) / Math.max(topic.tvl, compareProtocol.tvl)

      return {
        templateId: this.id,
        format,
        prompt: `Which ${category} protocol has higher TVL?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.min(1, margin),
          volatility: null,
        },
        explainData: {
          category,
          protocolA: topic.name,
          protocolB: compareProtocol.name,
          tvlA: formatNumber(topic.tvl),
          tvlB: formatNumber(compareProtocol.tvl),
          winner: winner.name,
        },
        buildNotes: [
          `Category: ${category}`,
          `${topic.name}: ${formatNumber(topic.tvl)}`,
          `${compareProtocol.name}: ${formatNumber(compareProtocol.tvl)}`,
        ],
      }
    }

    // TF format
    // "Is {topic} the #1 {category} protocol by TVL?"
    const isLeader = sameCategory[0].slug === topic.slug

    return {
      templateId: this.id,
      format,
      prompt: `${topic.name} is the #1 ${category} protocol by TVL.`,
      choices: ["True", "False"],
      answerIndex: isLeader ? 0 : 1,
      answerValue: isLeader,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: isLeader ? 0.3 : (topicCategoryRank <= 3 ? 0.2 : 0.4),
        volatility: null,
      },
      explainData: {
        category,
        topicName: topic.name,
        topicCategoryRank,
        isLeader,
        leader: sameCategory[0].name,
        leaderTvl: formatNumber(sameCategory[0].tvl),
      },
      buildNotes: [
        `Category: ${category}`,
        `${topic.name} is #${topicCategoryRank} in category`,
        `Leader: ${sameCategory[0].name}`,
      ],
    }
  }
}

export const p14CategoryLeaderComparison = new P14CategoryLeaderComparison()
