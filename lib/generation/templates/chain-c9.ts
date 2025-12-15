/**
 * C9: Distance from ATH
 *
 * How close is a chain to its all-time high TVL?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { findAthFromChainHistory, formatMonth } from "../metrics"
import { formatNumber } from "../distractors"
import type { ChainPoolEntry } from "@/lib/types/pools"

// ATH distance buckets as specified in question-templates.md
const ATH_DISTANCE_BUCKETS = [
  { label: "At ATH", min: 0, max: 0.02 },
  { label: "Within 10%", min: 0.02, max: 0.10 },
  { label: "10-30% below", min: 0.10, max: 0.30 },
  { label: "30-60% below", min: 0.30, max: 0.60 },
  { label: ">60% below", min: 0.60, max: 1 },
]

/**
 * Get ATH distance bucket index
 */
function getAthDistanceBucketIndex(distance: number): number {
  for (let i = 0; i < ATH_DISTANCE_BUCKETS.length; i++) {
    if (distance < ATH_DISTANCE_BUCKETS[i].max) {
      return i
    }
  }
  return ATH_DISTANCE_BUCKETS.length - 1
}

/**
 * Calculate distance to nearest bucket boundary
 */
function distanceToBucketBoundary(athDistance: number): number {
  const boundaries = [0.02, 0.10, 0.30, 0.60]
  let minDist = Infinity
  
  for (const boundary of boundaries) {
    const dist = Math.abs(athDistance - boundary)
    if (dist < minDist) {
      minDist = dist
    }
  }
  
  return minDist
}

export class C9DistanceFromATH extends ChainTemplate {
  id = "C9_DISTANCE_FROM_ATH"
  name = "Distance from ATH"
  // Reveals current TVL and ATH value in the explanation
  semanticTopics = ["ath_history", "tvl_absolute"]

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need at least 90 days of history
    if (!this.hasMinHistoryDays(ctx, 90)) return false

    const history = ctx.data.chainHistory
    if (!history || history.length < 30) return false

    // Need to be able to find ATH
    const ath = findAthFromChainHistory(history)
    if (!ath) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const history = ctx.data.chainHistory!
    const ath = findAthFromChainHistory(history)!
    const currentTvl = history[history.length - 1]?.tvl ?? 0

    if (currentTvl <= 0) return []

    const athDistance = (ath.value - currentTvl) / ath.value

    // If at or very near ATH, use TF
    if (athDistance < 0.05) {
      return ["tf"]
    }

    // If clearly in a bucket, mc4 works well
    const distToBoundary = distanceToBucketBoundary(athDistance)
    if (distToBoundary < 0.03) {
      return ["tf", "mc4"]
    }

    return ["tf", "mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    _seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const history = ctx.data.chainHistory!
    
    const ath = findAthFromChainHistory(history)
    if (!ath) return null

    const currentTvl = history[history.length - 1]?.tvl ?? 0
    if (currentTvl <= 0) return null

    // Calculate distance from ATH (as decimal, e.g., 0.30 = 30% below ATH)
    const athDistance = Math.max(0, (ath.value - currentTvl) / ath.value)
    const isWithin10Pct = athDistance <= 0.10
    const isAtAth = athDistance <= 0.02

    const athMonthDisplay = formatMonth(ath.ts)

    if (format === "tf") {
      // Ask if chain is within 10% of ATH
      const statement = `${topic.name} is currently within 10% of its all-time high TVL.`

      return {
        templateId: this.id,
        format,
        prompt: statement,
        answerValue: isWithin10Pct,
        choices: ["True", "False"],
        answerIndex: isWithin10Pct ? 0 : 1,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin: Math.abs(athDistance - 0.10), // Distance from the 10% threshold
          volatility: ctx.derived.tvlVolatility ?? null,
        },
        explainData: {
          name: topic.name,
          currentTvl: formatNumber(currentTvl),
          athValue: formatNumber(ath.value),
          athMonth: athMonthDisplay,
          distancePercent: Math.round(athDistance * 100),
          isWithin10Pct,
          isAtAth,
        },
        buildNotes: [
          `TF: "${statement}" -> ${isWithin10Pct}`,
          `ATH: ${formatNumber(ath.value)} in ${athMonthDisplay}`,
          `Current: ${formatNumber(currentTvl)} (${(athDistance * 100).toFixed(1)}% below ATH)`,
        ],
      }
    }

    // MC4 format with distance buckets
    const bucketIndex = getAthDistanceBucketIndex(athDistance)
    const choices = ATH_DISTANCE_BUCKETS.map((b) => b.label)
    const answerIndex = bucketIndex

    // Calculate margin based on distance to bucket boundary
    const distToBoundary = distanceToBucketBoundary(athDistance)
    const margin = Math.min(1, distToBoundary * 5)

    return {
      templateId: this.id,
      format,
      prompt: `How far is ${topic.name} from its all-time high TVL?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(topic.tvlRank),
        margin,
        volatility: ctx.derived.tvlVolatility ?? null,
      },
      explainData: {
        name: topic.name,
        currentTvl: formatNumber(currentTvl),
        athValue: formatNumber(ath.value),
        athMonth: athMonthDisplay,
        distancePercent: Math.round(athDistance * 100),
        bucket: ATH_DISTANCE_BUCKETS[bucketIndex].label,
      },
      buildNotes: [
        `ATH: ${formatNumber(ath.value)} in ${athMonthDisplay}`,
        `Current: ${formatNumber(currentTvl)}`,
        `Distance: ${(athDistance * 100).toFixed(1)}% below ATH -> ${ATH_DISTANCE_BUCKETS[bucketIndex].label}`,
      ],
    }
  }
}

export const c9DistanceFromATH = new C9DistanceFromATH()
