#!/usr/bin/env bun
/**
 * Test script for the quantitative fallback system
 *
 * This script tests that:
 * 1. Fallbacks can be selected for both protocol and chain episodes
 * 2. Each fallback produces both True and False answers depending on context
 * 3. Fallbacks are properly deduplicated
 * 4. Difficulty targeting works
 * 5. A/B format fallbacks work correctly
 */

import {
  QUANTITATIVE_PROTOCOL_FALLBACKS,
  QUANTITATIVE_CHAIN_FALLBACKS,
  selectQuantitativeFallback,
} from "../lib/generation/quantitative-fallbacks"
import type { TemplateContext, DerivedMetrics } from "../lib/types/episode"
import type { ProtocolPoolEntry, ChainPoolEntry } from "../lib/types/pools"

// =============================================================================
// Test Helpers
// =============================================================================

function createMockProtocolContext(
  overrides: Partial<{
    name: string
    tvl: number
    rank: number
    change7d: number
    chainCount: number
    nearbyProtocols: { slug: string; name: string; tvl: number; rank: number }[]
    categoryProtocols: { slug: string; name: string; tvl: number; rank: number; category: string }[]
  }> = {}
): TemplateContext {
  const topic: ProtocolPoolEntry = {
    slug: "test-protocol",
    name: overrides.name ?? "Test Protocol",
    category: "Lending",
    tvlRank: overrides.rank ?? 50,
    tvl: overrides.tvl ?? 500_000_000,
    chains: ["Ethereum", "Arbitrum", "Polygon"],
    hasFeesData: true,
    hasRevenueData: true,
    hasVolumeData: false,
    historyDays: 365,
    lastUpdated: "2025-12-15",
  }

  const derived: DerivedMetrics = {
    tvlRank: overrides.rank ?? 50,
    tvlRankBucket: "top_100",
    currentTvl: overrides.tvl ?? 500_000_000,
    change7d: overrides.change7d ?? 0.03,
    chainCount: overrides.chainCount ?? 3,
    nearbyProtocols: overrides.nearbyProtocols ?? [
      { slug: "nearby-1", name: "Nearby Protocol 1", tvl: 450_000_000, rank: 51 },
      { slug: "nearby-2", name: "Nearby Protocol 2", tvl: 550_000_000, rank: 49 },
    ],
    categoryProtocols: overrides.categoryProtocols ?? [
      { slug: "cat-1", name: "Category Protocol 1", tvl: 600_000_000, rank: 1, category: "Lending" },
    ],
  }

  return {
    date: "2025-12-15",
    episodeType: "protocol",
    topic,
    data: {},
    derived,
  }
}

function createMockChainContext(
  overrides: Partial<{
    name: string
    tvl: number
    rank: number
    change30d: number
    nearbyChains: { slug: string; name: string; tvl: number; rank: number }[]
  }> = {}
): TemplateContext {
  const topic: ChainPoolEntry = {
    slug: overrides.name ?? "Test Chain",
    name: overrides.name ?? "Test Chain",
    tvlRank: overrides.rank ?? 15,
    tvl: overrides.tvl ?? 2_000_000_000,
    protocolCount: 150,
    historyDays: 500,
    change30d: overrides.change30d ?? 0.05,
    lastUpdated: "2025-12-15",
  }

  const derived: DerivedMetrics = {
    chainTvlRank: overrides.rank ?? 15,
    tvlRank: overrides.rank ?? 15,
    tvlRankBucket: "top_25",
    currentTvl: overrides.tvl ?? 2_000_000_000,
    chainChange30d: overrides.change30d ?? 0.05,
    nearbyChains: overrides.nearbyChains ?? [
      { slug: "nearby-chain-1", name: "Nearby Chain 1", tvl: 1_800_000_000, rank: 16 },
      { slug: "nearby-chain-2", name: "Nearby Chain 2", tvl: 2_200_000_000, rank: 14 },
    ],
  }

  return {
    date: "2025-12-15",
    episodeType: "chain",
    topic,
    data: {},
    derived,
  }
}

// =============================================================================
// Tests
// =============================================================================

console.log("=== Testing Quantitative Fallback System ===\n")

// Test 1: Check fallback counts
console.log("Test 1: Fallback pool sizes")
console.log(`  Protocol fallbacks: ${QUANTITATIVE_PROTOCOL_FALLBACKS.length}`)
console.log(`  Chain fallbacks: ${QUANTITATIVE_CHAIN_FALLBACKS.length}`)
console.log()

// Test 2: Check that TVL threshold fallbacks produce True AND False answers
console.log("Test 2: TVL threshold fallbacks produce variable answers")

const tvlThresholdFallbacks = QUANTITATIVE_PROTOCOL_FALLBACKS.filter((fb) =>
  fb.id.includes("tvl_above")
)

for (const fb of tvlThresholdFallbacks) {
  // Test with high TVL (should be True for most thresholds)
  const highTvlCtx = createMockProtocolContext({ tvl: 10_000_000_000 })
  const highAnswer = fb.getAnswerValue?.(highTvlCtx) ?? fb.getAnswerIndex(highTvlCtx) === 0

  // Test with low TVL (should be False for most thresholds)
  const lowTvlCtx = createMockProtocolContext({ tvl: 50_000_000 })
  const lowAnswer = fb.getAnswerValue?.(lowTvlCtx) ?? fb.getAnswerIndex(lowTvlCtx) === 0

  console.log(`  ${fb.id}:`)
  console.log(`    $10B TVL → ${highAnswer ? "True" : "False"}`)
  console.log(`    $50M TVL → ${lowAnswer ? "True" : "False"}`)
}
console.log()

// Test 3: Check trend-based fallbacks
console.log("Test 3: Trend-based fallbacks produce variable answers")

const trendFallbacks = QUANTITATIVE_PROTOCOL_FALLBACKS.filter(
  (fb) => fb.id.includes("increased") || fb.id.includes("decreased") || fb.id.includes("_up_") || fb.id.includes("_down_")
)

for (const fb of trendFallbacks) {
  // Test with positive change
  const positiveCtx = createMockProtocolContext({ change7d: 0.08 })
  const positiveAnswer = fb.getAnswerValue?.(positiveCtx) ?? fb.getAnswerIndex(positiveCtx) === 0

  // Test with negative change
  const negativeCtx = createMockProtocolContext({ change7d: -0.08 })
  const negativeAnswer = fb.getAnswerValue?.(negativeCtx) ?? fb.getAnswerIndex(negativeCtx) === 0

  console.log(`  ${fb.id}:`)
  console.log(`    +8% change → ${positiveAnswer ? "True" : "False"}`)
  console.log(`    -8% change → ${negativeAnswer ? "True" : "False"}`)
}
console.log()

// Test 4: Check rank-based fallbacks
console.log("Test 4: Rank-based fallbacks produce variable answers")

const rankFallbacks = QUANTITATIVE_PROTOCOL_FALLBACKS.filter((fb) => fb.id.includes("rank_top"))

for (const fb of rankFallbacks) {
  // Test with high rank (top 5)
  const highRankCtx = createMockProtocolContext({ rank: 5 })
  const highAnswer = fb.getAnswerValue?.(highRankCtx) ?? fb.getAnswerIndex(highRankCtx) === 0

  // Test with low rank (rank 60)
  const lowRankCtx = createMockProtocolContext({ rank: 60 })
  const lowAnswer = fb.getAnswerValue?.(lowRankCtx) ?? fb.getAnswerIndex(lowRankCtx) === 0

  console.log(`  ${fb.id}:`)
  console.log(`    Rank #5 → ${highAnswer ? "True" : "False"}`)
  console.log(`    Rank #60 → ${lowAnswer ? "True" : "False"}`)
}
console.log()

// Test 5: Check A/B comparison fallbacks
console.log("Test 5: A/B comparison fallbacks")

const abFallbacks = QUANTITATIVE_PROTOCOL_FALLBACKS.filter((fb) => fb.format === "ab")

for (const fb of abFallbacks) {
  // Test where topic has higher TVL
  const higherCtx = createMockProtocolContext({
    tvl: 1_000_000_000,
    nearbyProtocols: [{ slug: "nearby", name: "Smaller Protocol", tvl: 500_000_000, rank: 51 }],
    categoryProtocols: [
      { slug: "cat", name: "Smaller Cat Protocol", tvl: 500_000_000, rank: 2, category: "Lending" },
    ],
  })
  const higherChoices = fb.getChoices?.(higherCtx) ?? []
  const higherAnswer = fb.getAnswerIndex(higherCtx)

  // Test where topic has lower TVL
  const lowerCtx = createMockProtocolContext({
    tvl: 300_000_000,
    nearbyProtocols: [{ slug: "nearby", name: "Bigger Protocol", tvl: 800_000_000, rank: 49 }],
    categoryProtocols: [
      { slug: "cat", name: "Bigger Cat Protocol", tvl: 800_000_000, rank: 1, category: "Lending" },
    ],
  })
  const lowerChoices = fb.getChoices?.(lowerCtx) ?? []
  const lowerAnswer = fb.getAnswerIndex(lowerCtx)

  console.log(`  ${fb.id}:`)
  console.log(`    Topic higher: choices=[${higherChoices.join(", ")}], answer=${higherAnswer}`)
  console.log(`    Topic lower:  choices=[${lowerChoices.join(", ")}], answer=${lowerAnswer}`)
}
console.log()

// Test 6: Check chain fallbacks
console.log("Test 6: Chain fallbacks")

const chainCtxHigh = createMockChainContext({ tvl: 15_000_000_000, rank: 3, change30d: 0.15 })
const chainCtxLow = createMockChainContext({ tvl: 200_000_000, rank: 35, change30d: -0.05 })

console.log("  High TVL chain ($15B, rank #3, +15%):")
for (const fb of QUANTITATIVE_CHAIN_FALLBACKS.slice(0, 5)) {
  if (!fb.canUse(chainCtxHigh)) continue
  const answer = fb.getAnswerValue?.(chainCtxHigh) ?? fb.getAnswerIndex(chainCtxHigh) === 0
  console.log(`    ${fb.id}: ${answer ? "True" : "False"}`)
}

console.log("  Low TVL chain ($200M, rank #35, -5%):")
for (const fb of QUANTITATIVE_CHAIN_FALLBACKS.slice(0, 5)) {
  if (!fb.canUse(chainCtxLow)) continue
  const answer = fb.getAnswerValue?.(chainCtxLow) ?? fb.getAnswerIndex(chainCtxLow) === 0
  console.log(`    ${fb.id}: ${answer ? "True" : "False"}`)
}
console.log()

// Test 7: Test selectQuantitativeFallback function
console.log("Test 7: selectQuantitativeFallback function")

const protocolCtx = createMockProtocolContext({ tvl: 800_000_000, rank: 35, change7d: 0.04 })
const chainCtx = createMockChainContext({ tvl: 3_000_000_000, rank: 12, change30d: 0.08 })

// Test easy fallback
const easyResult = selectQuantitativeFallback(protocolCtx, "easy", 12345)
const easyFallback = easyResult?.draft
console.log(`  Easy protocol fallback:`)
console.log(`    Template: ${easyFallback?.templateId}`)
console.log(`    Prompt: ${easyFallback?.prompt}`)
console.log(`    Format: ${easyFallback?.format}`)
console.log(`    Answer: ${easyFallback?.answerValue ?? easyFallback?.choices?.[easyFallback?.answerIndex ?? 0]}`)
console.log(`    Semantic Topics: ${easyResult?.semanticTopics?.join(", ")}`)

// Test medium fallback
const mediumResult = selectQuantitativeFallback(protocolCtx, "medium", 67890)
const mediumFallback = mediumResult?.draft
console.log(`  Medium protocol fallback:`)
console.log(`    Template: ${mediumFallback?.templateId}`)
console.log(`    Prompt: ${mediumFallback?.prompt}`)
console.log(`    Format: ${mediumFallback?.format}`)
console.log(`    Answer: ${mediumFallback?.answerValue ?? mediumFallback?.choices?.[mediumFallback?.answerIndex ?? 0]}`)
console.log(`    Semantic Topics: ${mediumResult?.semanticTopics?.join(", ")}`)

// Test chain fallback
const chainResult = selectQuantitativeFallback(chainCtx, "medium", 11111)
const chainFallback = chainResult?.draft
console.log(`  Medium chain fallback:`)
console.log(`    Template: ${chainFallback?.templateId}`)
console.log(`    Prompt: ${chainFallback?.prompt}`)
console.log(`    Format: ${chainFallback?.format}`)
console.log(`    Answer: ${chainFallback?.answerValue ?? chainFallback?.choices?.[chainFallback?.answerIndex ?? 0]}`)
console.log(`    Semantic Topics: ${chainResult?.semanticTopics?.join(", ")}`)

console.log()

// Test 8: Test deduplication (both prompt and semantic topic)
console.log("Test 8: Deduplication (prompt and semantic topic)")

const usedPrompts = new Set<string>()
const usedSemanticTopics = new Set<string>()
const ctx = createMockProtocolContext()

console.log("  Selecting 5 fallbacks with deduplication:")
for (let i = 0; i < 5; i++) {
  const result = selectQuantitativeFallback(ctx, "easy", 10000 + i, usedPrompts, usedSemanticTopics)
  if (result) {
    console.log(`    ${i + 1}. ${result.draft.prompt.substring(0, 50)}... [${result.semanticTopics.join(", ")}]`)
    usedPrompts.add(result.draft.prompt)
    for (const topic of result.semanticTopics) {
      usedSemanticTopics.add(topic)
    }
  }
}

console.log()
console.log("=== All tests completed ===")
