/**
 * P1: Protocol Fingerprint Guess
 *
 * Identify a protocol from a set of clues about its characteristics.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import {
  getTvlBand,
  getChainCountBucket,
  getChangeBucket,
} from "../metrics"
import { pickProtocolDistractors, type ProtocolEntity } from "../distractors"
import { deterministicShuffle } from "../rng"

export class P1ProtocolFingerprint extends ProtocolTemplate {
  id = "P1_FINGERPRINT"
  name = "Protocol Fingerprint Guess"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    // Need protocol detail with category, chains, TVL
    const detail = ctx.data.protocolDetail
    if (!detail) return false
    if (!detail.category) return false
    if (!detail.chains || detail.chains.length === 0) return false
    if (!detail.tvl || detail.tvl.length === 0) return false

    // Need protocol list for distractors
    if (!ctx.data.protocolList || ctx.data.protocolList.length < 6) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    // Prefer mc6 for fingerprint, fall back to mc4 for obscure protocols
    const tvlRank = ctx.topic.tvlRank
    if (tvlRank > 50) {
      return ["mc4"]
    }
    return ["mc6", "mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const list = ctx.data.protocolList!

    // Generate clues
    const clues: string[] = []

    // Category clue
    clues.push(`Category: ${detail.category}`)

    // Chain count bucket
    const chainCount = detail.chains.length
    const chainBucket = getChainCountBucket(chainCount)
    clues.push(`Chains: ${chainBucket}`)

    // TVL band
    const currentTvl =
      detail.tvl[detail.tvl.length - 1]?.totalLiquidityUSD ??
      detail.currentChainTvls
        ? Object.values(detail.currentChainTvls).reduce((a, b) => a + b, 0)
        : 0
    const tvlBand = getTvlBand(currentTvl)
    clues.push(`TVL: ${tvlBand}`)

    // 7d change bucket (if available)
    if (ctx.derived.change7d !== undefined) {
      const changeBucket = getChangeBucket(ctx.derived.change7d)
      clues.push(`7d change: ${changeBucket}`)
    }

    // Get distractors
    const distractorCount = format === "mc6" ? 5 : 3
    const pool: ProtocolEntity[] = list.map((p) => ({
      id: p.slug,
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl: p.tvl,
      chains: p.chains,
    }))

    const distractorNames = pickProtocolDistractors(
      detail.slug,
      pool,
      distractorCount,
      seed,
      {
        mustMatch: { category: detail.category },
        avoid: new Set([detail.slug]),
      }
    )

    let finalDistractors = distractorNames
    if (!finalDistractors) {
      // Try without category constraint
      finalDistractors = pickProtocolDistractors(
        detail.slug,
        pool,
        distractorCount,
        seed
      )
      if (!finalDistractors) return null
    }

    // Build choices with correct answer
    const allChoices = [detail.name, ...finalDistractors]
    const shuffled = deterministicShuffle(
      allChoices.map((name, i) => ({ name, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )

    const choices = shuffled.map((x) => x.name)
    const answerIndex = shuffled.findIndex((x) => x.isCorrect)

    return {
      templateId: this.id,
      format,
      prompt: "Which protocol matches these clues?",
      clues,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
        margin: null, // No numeric margin for fingerprint
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: detail.name,
        category: detail.category,
        chainCount,
        tvlFormatted: tvlBand,
        chains: detail.chains.slice(0, 5).join(", "),
      },
      buildNotes: [`Generated ${clues.length} clues for fingerprint`],
    }
  }
}

export const p1ProtocolFingerprint = new P1ProtocolFingerprint()
