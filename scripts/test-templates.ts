/**
 * Test script for question templates
 *
 * Tests that templates can be instantiated with mock data
 */

import { computeDifficulty, matchesTarget, SLOT_TARGETS } from "../lib/generation/difficulty"
import { abMargin, top2Margin, getTvlBand, getChangeBucket } from "../lib/generation/metrics"
import { pickEntityDistractors, makeTimingDistractors, type ProtocolEntity } from "../lib/generation/distractors"
import {
  PROTOCOL_TEMPLATES,
  CHAIN_TEMPLATES,
  PROTOCOL_MATRIX,
  CHAIN_MATRIX,
} from "../lib/generation/templates"
import type { TemplateContext, DifficultySignals } from "../lib/types/episode"
import type { ProtocolPoolEntry } from "../lib/types/pools"
import type { ProtocolDetail, ProtocolListEntry } from "../lib/types/defillama"

console.log("=== Testing Difficulty System ===\n")

// Test difficulty calculation
const testSignals: DifficultySignals[] = [
  { format: "tf", familiarityRankBucket: "top_10", margin: 0.5, volatility: 0.1 },
  { format: "mc4", familiarityRankBucket: "top_25", margin: 0.15, volatility: 0.3 },
  { format: "mc6", familiarityRankBucket: "top_100", margin: 0.08, volatility: 0.5 },
  { format: "rank4", familiarityRankBucket: "long_tail", margin: 0.05, volatility: 0.8 },
]

for (const signals of testSignals) {
  const score = computeDifficulty(signals)
  console.log(`Format: ${signals.format}, Rank: ${signals.familiarityRankBucket}, Margin: ${signals.margin}, Vol: ${signals.volatility}`)
  console.log(`  Score: ${score.toFixed(3)}`)
  console.log(`  Easy: ${matchesTarget(score, "easy")}, Medium: ${matchesTarget(score, "medium")}, Hard: ${matchesTarget(score, "hard")}`)
}

console.log("\n=== Testing Metrics ===\n")

// Test margin calculations
console.log(`abMargin(100, 80) = ${abMargin(100, 80)?.toFixed(3)} (expected: 0.200)`)
console.log(`abMargin(50, 50) = ${abMargin(50, 50)?.toFixed(3)} (expected: 0.000)`)
console.log(`top2Margin([100, 80, 60]) = ${top2Margin([100, 80, 60])?.toFixed(3)} (expected: 0.200)`)

// Test TVL bands
console.log(`\nTVL Bands:`)
console.log(`  $15B -> ${getTvlBand(15_000_000_000)}`)
console.log(`  $2B -> ${getTvlBand(2_000_000_000)}`)
console.log(`  $200M -> ${getTvlBand(200_000_000)}`)
console.log(`  $20M -> ${getTvlBand(20_000_000)}`)

// Test change buckets
console.log(`\nChange Buckets:`)
console.log(`  +15% -> ${getChangeBucket(0.15)}`)
console.log(`  +5% -> ${getChangeBucket(0.05)}`)
console.log(`  -2% -> ${getChangeBucket(-0.02)}`)
console.log(`  -20% -> ${getChangeBucket(-0.20)}`)

console.log("\n=== Testing Distractors ===\n")

// Test entity distractors
const mockPool: ProtocolEntity[] = [
  { id: "aave", slug: "aave", name: "Aave", category: "Lending", tvl: 10_000_000_000 },
  { id: "compound", slug: "compound", name: "Compound", category: "Lending", tvl: 2_000_000_000 },
  { id: "uniswap", slug: "uniswap", name: "Uniswap", category: "Dexes", tvl: 5_000_000_000 },
  { id: "curve", slug: "curve", name: "Curve", category: "Dexes", tvl: 3_000_000_000 },
  { id: "maker", slug: "maker", name: "MakerDAO", category: "CDP", tvl: 8_000_000_000 },
  { id: "lido", slug: "lido", name: "Lido", category: "Liquid Staking", tvl: 20_000_000_000 },
]

const distractors = pickEntityDistractors("aave", mockPool, { count: 3 }, 12345)
console.log(`Distractors for "aave": ${distractors?.map(d => d.name).join(", ")}`)

// Test timing distractors
const { choices: monthChoices, answerIndex: monthAnswer } = makeTimingDistractors("2024-06", 3, 12345)
console.log(`Month choices: ${monthChoices.join(", ")} (answer index: ${monthAnswer})`)

console.log("\n=== Testing Template Registration ===\n")

// Verify all templates are registered
console.log(`Protocol Templates: ${Object.keys(PROTOCOL_TEMPLATES).join(", ")}`)
console.log(`Chain Templates: ${Object.keys(CHAIN_TEMPLATES).join(", ")}`)

// Verify matrices
console.log(`\nProtocol Matrix Slots:`)
for (const [slot, templates] of Object.entries(PROTOCOL_MATRIX)) {
  console.log(`  ${slot}: ${templates.map(t => t.id).join(", ")}`)
}

console.log(`\nChain Matrix Slots:`)
for (const [slot, templates] of Object.entries(CHAIN_MATRIX)) {
  console.log(`  ${slot}: ${templates.map(t => t.id).join(", ")}`)
}

console.log("\n=== Testing Template Instantiation ===\n")

// Create mock context for protocol
const mockProtocolTopic: ProtocolPoolEntry = {
  slug: "aave",
  name: "Aave",
  category: "Lending",
  tvlRank: 5,
  tvl: 10_000_000_000,
  chains: ["ethereum", "polygon", "avalanche", "arbitrum", "optimism"],
  hasFeesData: true,
  hasRevenueData: true,
  hasVolumeData: false,
  historyDays: 500,
  lastUpdated: "2024-12-13",
}

const mockProtocolDetail: ProtocolDetail = {
  id: "aave",
  name: "Aave",
  slug: "aave",
  category: "Lending",
  chains: ["ethereum", "polygon", "avalanche", "arbitrum", "optimism"],
  chainTvls: {
    ethereum: { tvl: [{ date: 1700000000, totalLiquidityUSD: 6_000_000_000 }] },
    polygon: { tvl: [{ date: 1700000000, totalLiquidityUSD: 1_500_000_000 }] },
    avalanche: { tvl: [{ date: 1700000000, totalLiquidityUSD: 1_000_000_000 }] },
    arbitrum: { tvl: [{ date: 1700000000, totalLiquidityUSD: 1_000_000_000 }] },
    optimism: { tvl: [{ date: 1700000000, totalLiquidityUSD: 500_000_000 }] },
  },
  currentChainTvls: {
    ethereum: 6_000_000_000,
    polygon: 1_500_000_000,
    avalanche: 1_000_000_000,
    arbitrum: 1_000_000_000,
    optimism: 500_000_000,
  },
  tvl: [
    { date: 1600000000, totalLiquidityUSD: 5_000_000_000 },
    { date: 1650000000, totalLiquidityUSD: 15_000_000_000 }, // ATH
    { date: 1700000000, totalLiquidityUSD: 10_000_000_000 },
  ],
}

const mockProtocolList: ProtocolListEntry[] = [
  { id: "1", name: "Aave", slug: "aave", category: "Lending", chains: ["ethereum"], tvl: 10_000_000_000, chainTvls: {} },
  { id: "2", name: "Compound", slug: "compound", category: "Lending", chains: ["ethereum"], tvl: 2_000_000_000, chainTvls: {} },
  { id: "3", name: "Uniswap", slug: "uniswap", category: "Dexes", chains: ["ethereum"], tvl: 5_000_000_000, chainTvls: {} },
  { id: "4", name: "Curve", slug: "curve", category: "Dexes", chains: ["ethereum"], tvl: 3_000_000_000, chainTvls: {} },
  { id: "5", name: "MakerDAO", slug: "maker", category: "CDP", chains: ["ethereum"], tvl: 8_000_000_000, chainTvls: {} },
  { id: "6", name: "Lido", slug: "lido", category: "Liquid Staking", chains: ["ethereum"], tvl: 20_000_000_000, chainTvls: {} },
  { id: "7", name: "Rocket Pool", slug: "rocket-pool", category: "Liquid Staking", chains: ["ethereum"], tvl: 3_000_000_000, chainTvls: {} },
]

const mockProtocolContext: TemplateContext = {
  date: "2024-12-13",
  episodeType: "protocol",
  topic: mockProtocolTopic,
  data: {
    protocolDetail: mockProtocolDetail,
    protocolList: mockProtocolList,
  },
  derived: {
    tvlRank: 5,
    tvlRankBucket: "top_10",
    change7d: 0.05,
    change30d: -0.02,
    tvlVolatility: 0.3,
  },
}

// Test P2 template (has good test data)
const p2 = PROTOCOL_TEMPLATES["P2_CROSSCHAIN"]
console.log(`\nTesting P2 (Cross-Chain Dominance):`)
console.log(`  checkPrereqs: ${p2.checkPrereqs(mockProtocolContext)}`)
console.log(`  proposeFormats: ${p2.proposeFormats(mockProtocolContext).join(", ")}`)

const p2Draft = p2.instantiate(mockProtocolContext, "ab", 12345)
if (p2Draft) {
  console.log(`  Draft prompt: "${p2Draft.prompt}"`)
  console.log(`  Choices: ${p2Draft.choices?.join(", ")}`)
  console.log(`  Answer index: ${p2Draft.answerIndex}`)
  console.log(`  Difficulty score: ${computeDifficulty(p2Draft.signals).toFixed(3)}`)
}

// Test P3 template
const p3 = PROTOCOL_TEMPLATES["P3_CONCENTRATION"]
console.log(`\nTesting P3 (Top Chain Concentration):`)
console.log(`  checkPrereqs: ${p3.checkPrereqs(mockProtocolContext)}`)

const p3Draft = p3.instantiate(mockProtocolContext, "mc4", 12345)
if (p3Draft) {
  console.log(`  Draft prompt: "${p3Draft.prompt}"`)
  console.log(`  Choices: ${p3Draft.choices?.join(", ")}`)
  console.log(`  Answer index: ${p3Draft.answerIndex}`)
}

console.log("\n=== Testing Slot Targets ===\n")

for (const [slot, target] of Object.entries(SLOT_TARGETS)) {
  console.log(`Slot ${slot}: ${target}`)
}

console.log("\n=== All Tests Complete ===")
