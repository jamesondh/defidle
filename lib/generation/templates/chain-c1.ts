/**
 * C1: Chain Fingerprint Guess
 *
 * Identify a chain from a set of clues.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { getTvlBand, getTvlRankBucket, getChangeBucket, percentChangeFromChainHistory } from "../metrics"
import { pickChainDistractors, type ChainEntity } from "../distractors"
import { deterministicShuffle } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

export class C1ChainFingerprint extends ChainTemplate {
  id = "C1_FINGERPRINT"
  name = "Chain Fingerprint Guess"
  // Note: Fingerprint questions reveal TVL bands as clues, so they cover the tvl_absolute topic
  semanticTopics = ["tvl_absolute"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need chain list for distractors
    const chainList = ctx.data.chainList
    if (!chainList || chainList.length < 6) return false

    // Need basic chain info
    const topic = ctx.topic as ChainPoolEntry
    if (!topic.tvl || !topic.tvlRank) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const tvlRank = ctx.topic.tvlRank

    // Use mc4 for less prominent chains
    if (tvlRank > 20) {
      return ["mc4"]
    }

    return ["mc6", "mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const chainList = ctx.data.chainList!

    // Generate clues
    const clues: string[] = []

    // TVL rank bucket
    const rankBucket = getTvlRankBucket(topic.tvlRank)
    clues.push(`TVL rank: ${rankBucket}`)

    // TVL band
    const tvlBand = getTvlBand(topic.tvl)
    clues.push(`TVL: ${tvlBand}`)

    // Token symbol (if available)
    if (topic.tokenSymbol) {
      clues.push(`Native token: ${topic.tokenSymbol}`)
    }

    // 30d trend (if available)
    if (ctx.data.chainHistory && ctx.data.chainHistory.length > 30) {
      const change30d = percentChangeFromChainHistory(ctx.data.chainHistory, 30)
      if (change30d !== null) {
        const trendBucket = getChangeBucket(change30d)
        clues.push(`30d trend: ${trendBucket}`)
      }
    }

    // Get distractors
    const distractorCount = format === "mc6" ? 5 : 3
    const pool: ChainEntity[] = chainList.map((c) => ({
      id: c.name,
      slug: c.name,
      name: c.name,
      tvl: c.tvl,
    }))

    const distractorNames = pickChainDistractors(
      topic.slug,
      pool,
      distractorCount,
      seed
    )

    if (!distractorNames) return null

    // Build choices with correct answer
    const allChoices = [topic.name, ...distractorNames]
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )

    const choices = shuffled.map((x) => x.name)
    const answerIndex = shuffled.findIndex((x) => x.isCorrect)

    return {
      templateId: this.id,
      format,
      prompt: "Which chain matches these clues?",
      clues,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin: null,
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: topic.name,
        tvlRank: topic.tvlRank,
        tvlFormatted: tvlBand,
        tokenSymbol: topic.tokenSymbol ?? "N/A",
        protocolCount: topic.protocolCount,
      },
      buildNotes: [`Generated ${clues.length} clues for chain fingerprint`],
    }
  }
}

export const c1ChainFingerprint = new C1ChainFingerprint()
