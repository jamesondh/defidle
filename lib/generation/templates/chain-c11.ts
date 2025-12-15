/**
 * C11: Top Protocol by TVL
 *
 * Which protocol has the most TVL on a given chain?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { top2Margin } from "../metrics"
import { formatNumber } from "../distractors"
import { deterministicShuffle, createRng } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

interface ProtocolOnChain {
  name: string
  slug: string
  tvlOnChain: number
  category?: string
}

export class C11TopProtocolByTVL extends ChainTemplate {
  id = "C11_TOP_PROTOCOL_TVL"
  name = "Top Protocol by TVL"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need protocol list with chain TVL data
    const protocolList = ctx.data.protocolList
    if (!protocolList || protocolList.length === 0) return false

    const topic = ctx.topic as ChainPoolEntry
    const chainName = topic.name

    // Get protocols on this chain with TVL data
    const protocolsOnChain = this.getProtocolsOnChain(protocolList, chainName)

    // Need at least 4 protocols for MC4, at least 2 for AB
    return protocolsOnChain.length >= 2
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const topic = ctx.topic as ChainPoolEntry
    const protocolList = ctx.data.protocolList!
    const chainName = topic.name

    const protocolsOnChain = this.getProtocolsOnChain(protocolList, chainName)

    if (protocolsOnChain.length < 2) return []

    // Calculate margin between top 2
    const sorted = protocolsOnChain.sort((a, b) => b.tvlOnChain - a.tvlOnChain)
    const margin = top2Margin([sorted[0].tvlOnChain, sorted[1].tvlOnChain])

    // If fewer than 4 protocols or tight margin, prefer AB
    if (protocolsOnChain.length < 4 || (margin !== null && margin < 0.15)) {
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
    const protocolList = ctx.data.protocolList!
    const chainName = topic.name

    const protocolsOnChain = this.getProtocolsOnChain(protocolList, chainName)
    if (protocolsOnChain.length < 2) return null

    // Sort by TVL on chain
    const sorted = protocolsOnChain.sort((a, b) => b.tvlOnChain - a.tvlOnChain)

    const topProtocol = sorted[0]
    const topTvl = topProtocol.tvlOnChain
    const totalTvl = sorted.reduce((sum, p) => sum + p.tvlOnChain, 0)
    const sharePercent = totalTvl > 0 ? Math.round((topTvl / totalTvl) * 100) : 0

    const margin = top2Margin([sorted[0].tvlOnChain, sorted[1].tvlOnChain]) ?? 0.1

    const rng = createRng(seed)

    if (format === "mc4") {
      if (sorted.length < 4) return null

      // Get 3 distractors from top 10
      const distractors = sorted.slice(1, 10)
      const shuffledDistractors = deterministicShuffle(distractors, `${seed}:distractors`)
      const selectedDistractors = shuffledDistractors.slice(0, 3)

      if (selectedDistractors.length < 3) return null

      const allChoices = [topProtocol, ...selectedDistractors]
      const shuffled = deterministicShuffle(
        allChoices.map((p, i) => ({
          name: p.name,
          isCorrect: i === 0,
        })),
        `${seed}:shuffle`
      )

      const choices = shuffled.map((x) => x.name)
      const answerIndex = shuffled.findIndex((x) => x.isCorrect)

      // Build comparison data for distractors
      const distractorData = selectedDistractors.map((d) => ({
        name: d.name,
        tvl: formatNumber(d.tvlOnChain),
      }))

      return {
        templateId: this.id,
        format,
        prompt: `Which protocol has the most TVL on ${chainName}?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin,
          volatility: null,
        },
        explainData: {
          chain: chainName,
          topProtocol: topProtocol.name,
          topTvl: formatNumber(topTvl),
          sharePercent,
          // Include comparison data for wrong choices
          otherProtocols: distractorData,
          comparison: distractorData.map((d) => `${d.name} (${d.tvl})`).join(", "),
        },
        buildNotes: [
          `Top protocol: ${topProtocol.name} with ${formatNumber(topTvl)} TVL`,
          `Margin over #2: ${(margin * 100).toFixed(1)}%`,
          `Other choices: ${distractorData.map((d) => `${d.name}: ${d.tvl}`).join(", ")}`,
        ],
      }
    }

    // AB format - compare top 2
    const secondProtocol = sorted[1]

    const swapped = rng() > 0.5
    const choices = swapped
      ? [secondProtocol.name, topProtocol.name]
      : [topProtocol.name, secondProtocol.name]
    const answerIndex = swapped ? 1 : 0

    return {
      templateId: this.id,
      format,
      prompt: `Which protocol has more TVL on ${chainName}?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin,
        volatility: null,
      },
      explainData: {
        chain: chainName,
        topProtocol: topProtocol.name,
        topTvl: formatNumber(topTvl),
        secondProtocol: secondProtocol.name,
        secondTvl: formatNumber(secondProtocol.tvlOnChain),
      },
      buildNotes: [
        `${topProtocol.name}: ${formatNumber(topTvl)}`,
        `${secondProtocol.name}: ${formatNumber(secondProtocol.tvlOnChain)}`,
      ],
    }
  }

  /**
   * Helper to get protocols deployed on a chain with their TVL on that chain
   */
  private getProtocolsOnChain(
    protocolList: import("@/lib/types/defillama").ProtocolListEntry[],
    chainName: string
  ): ProtocolOnChain[] {
    const result: ProtocolOnChain[] = []

    for (const protocol of protocolList) {
      // Check if protocol is on this chain
      if (!protocol.chains?.some((c) => c.toLowerCase() === chainName.toLowerCase())) {
        continue
      }

      // Get TVL on this chain from chainTvls
      // chainTvls keys might be case-sensitive, so try to find the right key
      let tvlOnChain = 0
      if (protocol.chainTvls) {
        for (const [key, value] of Object.entries(protocol.chainTvls)) {
          if (key.toLowerCase() === chainName.toLowerCase()) {
            tvlOnChain = typeof value === "number" ? value : 0
            break
          }
        }
      }

      // Only include if we have TVL data
      if (tvlOnChain > 0) {
        result.push({
          name: protocol.name,
          slug: protocol.slug,
          tvlOnChain,
          category: protocol.category,
        })
      }
    }

    return result
  }
}

export const c11TopProtocolByTVL = new C11TopProtocolByTVL()
