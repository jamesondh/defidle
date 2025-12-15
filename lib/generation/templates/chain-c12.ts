/**
 * C12: Category Dominance
 *
 * What category has the most TVL on a given chain?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { top2Margin } from "../metrics"
import { formatNumber } from "../distractors"
import { deterministicShuffle } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

/**
 * Minimum share of chain TVL for a category to be shown as a choice (2%)
 * Categories below this threshold are grouped into "Other"
 */
const MIN_CATEGORY_SHARE = 0.02

interface CategoryTvl {
  category: string
  tvl: number
  protocolCount: number
}

export class C12CategoryDominance extends ChainTemplate {
  id = "C12_CATEGORY_DOMINANCE"
  name = "Category Dominance"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need protocol list to aggregate by category
    const protocolList = ctx.data.protocolList
    if (!protocolList || protocolList.length === 0) return false

    const topic = ctx.topic as ChainPoolEntry
    const chainName = topic.name

    // Get category breakdown
    const categories = this.getCategoryBreakdown(protocolList, chainName)

    // Need at least 4 distinct significant categories for a good MC4 question
    return categories.length >= 4
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    // MC4 is the only format for this template
    return ["mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const protocolList = ctx.data.protocolList!
    const chainName = topic.name

    const categories = this.getCategoryBreakdown(protocolList, chainName)
    if (categories.length < 4) return null

    // Sort by TVL
    const sorted = categories.sort((a, b) => b.tvl - a.tvl)

    const topCategory = sorted[0]
    const totalTvl = sorted.reduce((sum, c) => sum + c.tvl, 0)
    const sharePercent = totalTvl > 0 ? Math.round((topCategory.tvl / totalTvl) * 100) : 0

    const margin = top2Margin([sorted[0].tvl, sorted[1].tvl]) ?? 0.1

    if (format === "mc4") {
      // Get 3 distractors from remaining categories
      const distractors = sorted.slice(1, 10)
      const shuffledDistractors = deterministicShuffle(distractors, `${seed}:distractors`)
      const selectedDistractors = shuffledDistractors.slice(0, 3)

      if (selectedDistractors.length < 3) return null

      const allChoices = [topCategory, ...selectedDistractors]
      const shuffled = deterministicShuffle(
        allChoices.map((c, i) => ({
          category: c.category,
          isCorrect: i === 0,
        })),
        `${seed}:shuffle`
      )

      const choices = shuffled.map((x) => x.category)
      const answerIndex = shuffled.findIndex((x) => x.isCorrect)

      // Build comparison data for distractors
      const distractorData = selectedDistractors.map((d) => ({
        category: d.category,
        tvl: formatNumber(d.tvl),
        share: totalTvl > 0 ? Math.round((d.tvl / totalTvl) * 100) : 0,
      }))

      return {
        templateId: this.id,
        format,
        prompt: `What category has the most TVL on ${chainName}?`,
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
          topCategory: topCategory.category,
          topCategoryTvl: formatNumber(topCategory.tvl),
          sharePercent,
          protocolCount: topCategory.protocolCount,
          // Include comparison data for wrong choices
          otherCategories: distractorData,
          comparison: distractorData
            .map((d) => `${d.category} (${d.tvl}, ${d.share}%)`)
            .join(", "),
        },
        buildNotes: [
          `Top category: ${topCategory.category} with ${formatNumber(topCategory.tvl)} (${sharePercent}%)`,
          `Margin over #2: ${(margin * 100).toFixed(1)}%`,
          `Other choices: ${distractorData.map((d) => `${d.category}: ${d.tvl}`).join(", ")}`,
        ],
      }
    }

    return null
  }

  /**
   * Get category breakdown for protocols on a chain
   * Groups minor categories (< 2% share) into "Other"
   */
  private getCategoryBreakdown(
    protocolList: import("@/lib/types/defillama").ProtocolListEntry[],
    chainName: string
  ): CategoryTvl[] {
    const categoryMap = new Map<string, { tvl: number; count: number }>()

    for (const protocol of protocolList) {
      // Check if protocol is on this chain
      if (!protocol.chains?.some((c) => c.toLowerCase() === chainName.toLowerCase())) {
        continue
      }

      // Get TVL on this chain
      let tvlOnChain = 0
      if (protocol.chainTvls) {
        for (const [key, value] of Object.entries(protocol.chainTvls)) {
          if (key.toLowerCase() === chainName.toLowerCase()) {
            tvlOnChain = typeof value === "number" ? value : 0
            break
          }
        }
      }

      if (tvlOnChain <= 0) continue

      const category = protocol.category || "Other"
      const existing = categoryMap.get(category) || { tvl: 0, count: 0 }
      categoryMap.set(category, {
        tvl: existing.tvl + tvlOnChain,
        count: existing.count + 1,
      })
    }

    // Calculate total TVL
    let totalTvl = 0
    for (const { tvl } of categoryMap.values()) {
      totalTvl += tvl
    }

    // Group minor categories into "Other"
    const result: CategoryTvl[] = []
    let otherTvl = 0
    let otherCount = 0

    for (const [category, { tvl, count }] of categoryMap.entries()) {
      const share = totalTvl > 0 ? tvl / totalTvl : 0
      
      if (share < MIN_CATEGORY_SHARE && category !== "Other") {
        otherTvl += tvl
        otherCount += count
      } else {
        result.push({
          category,
          tvl,
          protocolCount: count,
        })
      }
    }

    // Add "Other" category if it has any TVL
    if (otherTvl > 0) {
      // Check if there's already an "Other" category
      const existingOther = result.find((c) => c.category === "Other")
      if (existingOther) {
        existingOther.tvl += otherTvl
        existingOther.protocolCount += otherCount
      } else {
        result.push({
          category: "Other",
          tvl: otherTvl,
          protocolCount: otherCount,
        })
      }
    }

    return result
  }
}

export const c12CategoryDominance = new C12CategoryDominance()
