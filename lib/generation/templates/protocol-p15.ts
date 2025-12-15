/**
 * P15: Recent TVL Direction
 *
 * Simple question about protocol's recent TVL trend.
 * Works well for single-chain protocols and doesn't require long history.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import type { ProtocolPoolEntry } from "@/lib/types/pools"
import { formatNumber } from "../distractors"

export class P15RecentTVLDirection extends ProtocolTemplate {
  id = "P15_RECENT_TVL_DIRECTION"
  name = "Recent TVL Direction"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    // Need some change data
    const change7d = ctx.derived.change7d
    const change30d = ctx.derived.change30d

    // Need at least one of 7d or 30d change, and it should be significant (>2%)
    const has7d = change7d !== undefined && Math.abs(change7d) > 0.02
    const has30d = change30d !== undefined && Math.abs(change30d) > 0.02

    return has7d || has30d
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    return ["ab", "tf", "mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ProtocolPoolEntry
    
    const change7d = ctx.derived.change7d
    const change30d = ctx.derived.change30d

    // Prefer 7d change as it's more recent and relevant
    const useChange7d = change7d !== undefined && Math.abs(change7d) > 0.02
    const changeValue = useChange7d ? change7d! : change30d!
    const period = useChange7d ? "7 days" : "30 days"
    const increased = changeValue > 0

    if (format === "ab") {
      // "Did TVL increase or decrease over the past {period}?"
      const swapOrder = seed % 2 === 0
      const choices = swapOrder
        ? ["Decreased", "Increased"]
        : ["Increased", "Decreased"]
      const answerIndex = swapOrder
        ? (increased ? 1 : 0)
        : (increased ? 0 : 1)

      return {
        templateId: this.id,
        format,
        prompt: `Over the past ${period}, did ${topic.name}'s TVL increase or decrease?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.min(1, Math.abs(changeValue)),
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: topic.name,
          period,
          change: `${changeValue > 0 ? "+" : ""}${(changeValue * 100).toFixed(1)}%`,
          direction: increased ? "increased" : "decreased",
          currentTvl: formatNumber(topic.tvl),
        },
        buildNotes: [
          `${period} change: ${(changeValue * 100).toFixed(1)}%`,
          `Direction: ${increased ? "up" : "down"}`,
        ],
      }
    }

    if (format === "tf") {
      // Statement about direction
      const answerValue = increased

      return {
        templateId: this.id,
        format,
        prompt: `${topic.name}'s TVL has increased over the past ${period}.`,
        choices: ["True", "False"],
        answerIndex: answerValue ? 0 : 1,
        answerValue,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.min(1, Math.abs(changeValue)),
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: topic.name,
          period,
          change: `${changeValue > 0 ? "+" : ""}${(changeValue * 100).toFixed(1)}%`,
          direction: increased ? "increased" : "decreased",
          currentTvl: formatNumber(topic.tvl),
        },
        buildNotes: [
          `${period} change: ${(changeValue * 100).toFixed(1)}%`,
          `Statement: ${answerValue}`,
        ],
      }
    }

    // MC4 format - bucketed change
    const buckets = ["Down >10%", "Down 5-10%", "Roughly flat", "Up 5-10%", "Up >10%"]
    let correctBucket: string
    if (changeValue <= -0.1) correctBucket = "Down >10%"
    else if (changeValue <= -0.05) correctBucket = "Down 5-10%"
    else if (changeValue < 0.05) correctBucket = "Roughly flat"
    else if (changeValue < 0.1) correctBucket = "Up 5-10%"
    else correctBucket = "Up >10%"

    // Select 4 buckets including the correct one
    const availableBuckets = buckets.filter((b) => b !== correctBucket)
    const distractors = availableBuckets.slice(0, 3)
    
    const allChoices = [correctBucket, ...distractors]
    // Sort in logical order (most down to most up)
    const sortedChoices = allChoices.sort((a, b) => {
      const order = ["Down >10%", "Down 5-10%", "Roughly flat", "Up 5-10%", "Up >10%"]
      return order.indexOf(a) - order.indexOf(b)
    })
    
    const answerIndex = sortedChoices.indexOf(correctBucket)

    return {
      templateId: this.id,
      format,
      prompt: `How did ${topic.name}'s TVL change over the past ${period}?`,
      choices: sortedChoices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: 0.15, // Bucket proximity
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: topic.name,
        period,
        change: `${changeValue > 0 ? "+" : ""}${(changeValue * 100).toFixed(1)}%`,
        bucket: correctBucket,
        currentTvl: formatNumber(topic.tvl),
      },
      buildNotes: [
        `${period} change: ${(changeValue * 100).toFixed(1)}%`,
        `Bucket: ${correctBucket}`,
      ],
    }
  }
}

export const p15RecentTVLDirection = new P15RecentTVLDirection()
