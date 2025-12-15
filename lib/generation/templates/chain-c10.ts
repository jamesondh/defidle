/**
 * C10: Protocol Count
 *
 * How many protocols are deployed on a given chain?
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ChainTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { deterministicShuffle } from "../rng"
import type { ChainPoolEntry } from "@/lib/types/pools"

/**
 * Protocol count buckets
 */
const COUNT_BUCKETS = [
  { label: "<50", min: 0, max: 49 },
  { label: "50-100", min: 50, max: 100 },
  { label: "100-250", min: 101, max: 250 },
  { label: ">250", min: 251, max: Infinity },
]

/**
 * Get the bucket for a protocol count
 */
function getCountBucket(count: number): string {
  for (const bucket of COUNT_BUCKETS) {
    if (count >= bucket.min && count <= bucket.max) {
      return bucket.label
    }
  }
  return ">250"
}

/**
 * Calculate how close a count is to a bucket boundary (0-1, higher = closer to boundary)
 */
function getBoundaryProximity(count: number): number {
  const boundaries = [50, 100, 250]
  let minDistance = Infinity
  
  for (const boundary of boundaries) {
    const distance = Math.abs(count - boundary)
    if (distance < minDistance) {
      minDistance = distance
    }
  }
  
  // Normalize: within 10 of boundary = high proximity (0.8-1.0)
  // More than 50 away = low proximity (0-0.2)
  if (minDistance <= 10) return 0.8 + (10 - minDistance) / 50
  if (minDistance <= 25) return 0.5 + (25 - minDistance) / 50
  if (minDistance <= 50) return 0.2 + (50 - minDistance) / 100
  return 0.1
}

export class C10ProtocolCount extends ChainTemplate {
  id = "C10_PROTOCOL_COUNT"
  name = "Protocol Count"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isChainContext(ctx)) return false

    // Need protocol list to count protocols on chain
    const protocolList = ctx.data.protocolList
    if (!protocolList || protocolList.length === 0) return false

    const topic = ctx.topic as ChainPoolEntry
    
    // Count protocols on this chain
    const protocolsOnChain = protocolList.filter(
      (p) => p.chains && p.chains.some(
        (c) => c.toLowerCase() === topic.name.toLowerCase()
      )
    )

    // Need at least 10 protocols for a meaningful question
    return protocolsOnChain.length >= 10
  }

  proposeFormats(_ctx: TemplateContext): QuestionFormat[] {
    // MC4 with buckets is the primary format
    return ["mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const topic = ctx.topic as ChainPoolEntry
    const protocolList = ctx.data.protocolList!

    // Count protocols on this chain
    const protocolsOnChain = protocolList.filter(
      (p) => p.chains && p.chains.some(
        (c) => c.toLowerCase() === topic.name.toLowerCase()
      )
    )

    const count = protocolsOnChain.length
    const correctBucket = getCountBucket(count)
    
    // Calculate difficulty based on proximity to bucket boundaries
    const boundaryProximity = getBoundaryProximity(count)

    if (format === "mc4") {
      // Use all 4 buckets as choices
      const allBuckets = COUNT_BUCKETS.map((b) => b.label)
      
      // Shuffle choices deterministically
      const shuffled = deterministicShuffle(
        allBuckets.map((label) => ({
          label,
          isCorrect: label === correctBucket,
        })),
        `${seed}:shuffle`
      )

      const choices = shuffled.map((x) => x.label)
      const answerIndex = shuffled.findIndex((x) => x.isCorrect)

      // Calculate margin as distance from boundary normalized
      const margin = 1 - boundaryProximity

      return {
        templateId: this.id,
        format,
        prompt: `How many protocols are deployed on ${topic.name}?`,
        choices,
        answerIndex,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(topic.tvlRank),
          margin,
          volatility: null,
        },
        explainData: {
          chain: topic.name,
          protocolCount: count,
          countBucket: correctBucket,
          // Include some example protocols for context
          exampleProtocols: protocolsOnChain
            .slice(0, 5)
            .map((p) => p.name)
            .join(", "),
        },
        buildNotes: [
          `Protocol count: ${count}`,
          `Bucket: ${correctBucket}`,
          `Boundary proximity: ${(boundaryProximity * 100).toFixed(1)}%`,
        ],
      }
    }

    return null
  }
}

export const c10ProtocolCount = new C10ProtocolCount()
