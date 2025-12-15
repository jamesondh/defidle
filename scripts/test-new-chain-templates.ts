/**
 * Test script for new chain templates C10, C11, C12
 *
 * Tests that the new templates can be instantiated with mock data
 */

import {
  CHAIN_TEMPLATES,
} from "../lib/generation/templates"
import { computeDifficulty } from "../lib/generation/difficulty"
import type { TemplateContext } from "../lib/types/episode"
import type { ChainPoolEntry } from "../lib/types/pools"
import type { ProtocolListEntry, ChainListEntry, ChainTVLHistoryPoint } from "../lib/types/defillama"

console.log("=== Testing New Chain Templates (C10, C11, C12) ===\n")

// Create mock data
const mockChainTopic: ChainPoolEntry = {
  slug: "Ethereum",
  name: "Ethereum",
  tvlRank: 1,
  tvl: 60_000_000_000,
  protocolCount: 850,
  historyDays: 1500,
  change30d: 0.05,
  lastUpdated: "2024-12-13",
}

// Mock protocol list with chains and chainTvls
const mockProtocolList: ProtocolListEntry[] = [
  { 
    id: "1", name: "Lido", slug: "lido", category: "Liquid Staking", 
    chains: ["Ethereum", "Polygon"], tvl: 20_000_000_000,
    chainTvls: { Ethereum: 19_000_000_000, Polygon: 1_000_000_000 }
  },
  { 
    id: "2", name: "Aave", slug: "aave", category: "Lending", 
    chains: ["Ethereum", "Polygon", "Arbitrum"], tvl: 10_000_000_000,
    chainTvls: { Ethereum: 6_000_000_000, Polygon: 2_000_000_000, Arbitrum: 2_000_000_000 }
  },
  { 
    id: "3", name: "MakerDAO", slug: "maker", category: "CDP", 
    chains: ["Ethereum"], tvl: 8_000_000_000,
    chainTvls: { Ethereum: 8_000_000_000 }
  },
  { 
    id: "4", name: "Uniswap", slug: "uniswap", category: "Dexes", 
    chains: ["Ethereum", "Arbitrum", "Polygon", "Base"], tvl: 5_000_000_000,
    chainTvls: { Ethereum: 3_000_000_000, Arbitrum: 1_000_000_000, Polygon: 500_000_000, Base: 500_000_000 }
  },
  { 
    id: "5", name: "Curve", slug: "curve", category: "Dexes", 
    chains: ["Ethereum", "Arbitrum"], tvl: 3_000_000_000,
    chainTvls: { Ethereum: 2_500_000_000, Arbitrum: 500_000_000 }
  },
  { 
    id: "6", name: "Compound", slug: "compound", category: "Lending", 
    chains: ["Ethereum", "Arbitrum"], tvl: 2_000_000_000,
    chainTvls: { Ethereum: 1_800_000_000, Arbitrum: 200_000_000 }
  },
  { 
    id: "7", name: "Rocket Pool", slug: "rocket-pool", category: "Liquid Staking", 
    chains: ["Ethereum"], tvl: 3_000_000_000,
    chainTvls: { Ethereum: 3_000_000_000 }
  },
  { 
    id: "8", name: "Morpho", slug: "morpho", category: "Lending", 
    chains: ["Ethereum", "Base"], tvl: 2_500_000_000,
    chainTvls: { Ethereum: 2_000_000_000, Base: 500_000_000 }
  },
  { 
    id: "9", name: "Instadapp", slug: "instadapp", category: "Lending", 
    chains: ["Ethereum", "Polygon", "Arbitrum"], tvl: 1_500_000_000,
    chainTvls: { Ethereum: 1_000_000_000, Polygon: 300_000_000, Arbitrum: 200_000_000 }
  },
  { 
    id: "10", name: "Yearn", slug: "yearn", category: "Yield", 
    chains: ["Ethereum", "Fantom"], tvl: 1_000_000_000,
    chainTvls: { Ethereum: 900_000_000, Fantom: 100_000_000 }
  },
  // Add more for protocol count
  { id: "11", name: "Convex", slug: "convex", category: "Yield", chains: ["Ethereum"], tvl: 800_000_000, chainTvls: { Ethereum: 800_000_000 } },
  { id: "12", name: "Spark", slug: "spark", category: "Lending", chains: ["Ethereum"], tvl: 700_000_000, chainTvls: { Ethereum: 700_000_000 } },
  { id: "13", name: "Balancer", slug: "balancer", category: "Dexes", chains: ["Ethereum", "Arbitrum"], tvl: 600_000_000, chainTvls: { Ethereum: 500_000_000, Arbitrum: 100_000_000 } },
  { id: "14", name: "Pendle", slug: "pendle", category: "Yield", chains: ["Ethereum", "Arbitrum"], tvl: 500_000_000, chainTvls: { Ethereum: 400_000_000, Arbitrum: 100_000_000 } },
  { id: "15", name: "Liquity", slug: "liquity", category: "CDP", chains: ["Ethereum"], tvl: 400_000_000, chainTvls: { Ethereum: 400_000_000 } },
]

const mockChainList: ChainListEntry[] = [
  { name: "Ethereum", tvl: 60_000_000_000, tokenSymbol: "ETH" },
  { name: "Solana", tvl: 8_000_000_000, tokenSymbol: "SOL" },
  { name: "BSC", tvl: 5_000_000_000, tokenSymbol: "BNB" },
]

const mockChainHistory: ChainTVLHistoryPoint[] = [
  { date: 1600000000, tvl: 40_000_000_000 },
  { date: 1650000000, tvl: 100_000_000_000 }, // ATH
  { date: 1700000000, tvl: 60_000_000_000 },
]

const mockChainContext: TemplateContext = {
  date: "2024-12-13",
  episodeType: "chain",
  topic: mockChainTopic,
  data: {
    protocolList: mockProtocolList,
    chainList: mockChainList,
    chainHistory: mockChainHistory,
  },
  derived: {
    chainTvlRank: 1,
    chainChange30d: 0.05,
  },
}

// Test C10: Protocol Count
console.log("=== C10: Protocol Count ===\n")
const c10 = CHAIN_TEMPLATES["C10_PROTOCOL_COUNT"]
console.log(`Template ID: ${c10.id}`)
console.log(`Template Name: ${c10.name}`)
console.log(`checkPrereqs: ${c10.checkPrereqs(mockChainContext)}`)
console.log(`proposeFormats: ${c10.proposeFormats(mockChainContext).join(", ")}`)

const c10Draft = c10.instantiate(mockChainContext, "mc4", 12345)
if (c10Draft) {
  console.log(`\nGenerated Question:`)
  console.log(`  Prompt: "${c10Draft.prompt}"`)
  console.log(`  Choices: ${c10Draft.choices?.join(", ")}`)
  console.log(`  Answer Index: ${c10Draft.answerIndex}`)
  console.log(`  Correct Answer: ${c10Draft.choices?.[c10Draft.answerIndex!]}`)
  console.log(`  Difficulty Score: ${computeDifficulty(c10Draft.signals).toFixed(3)}`)
  console.log(`  ExplainData:`, JSON.stringify(c10Draft.explainData, null, 2))
} else {
  console.log("  Failed to generate question")
}

// Test C11: Top Protocol by TVL
console.log("\n=== C11: Top Protocol by TVL ===\n")
const c11 = CHAIN_TEMPLATES["C11_TOP_PROTOCOL_TVL"]
console.log(`Template ID: ${c11.id}`)
console.log(`Template Name: ${c11.name}`)
console.log(`checkPrereqs: ${c11.checkPrereqs(mockChainContext)}`)
console.log(`proposeFormats: ${c11.proposeFormats(mockChainContext).join(", ")}`)

const c11Draft = c11.instantiate(mockChainContext, "mc4", 12345)
if (c11Draft) {
  console.log(`\nGenerated Question (MC4):`)
  console.log(`  Prompt: "${c11Draft.prompt}"`)
  console.log(`  Choices: ${c11Draft.choices?.join(", ")}`)
  console.log(`  Answer Index: ${c11Draft.answerIndex}`)
  console.log(`  Correct Answer: ${c11Draft.choices?.[c11Draft.answerIndex!]}`)
  console.log(`  Difficulty Score: ${computeDifficulty(c11Draft.signals).toFixed(3)}`)
  console.log(`  ExplainData:`, JSON.stringify(c11Draft.explainData, null, 2))
} else {
  console.log("  Failed to generate question")
}

// Also test AB format
const c11AbDraft = c11.instantiate(mockChainContext, "ab", 12345)
if (c11AbDraft) {
  console.log(`\nGenerated Question (AB):`)
  console.log(`  Prompt: "${c11AbDraft.prompt}"`)
  console.log(`  Choices: ${c11AbDraft.choices?.join(", ")}`)
  console.log(`  Answer Index: ${c11AbDraft.answerIndex}`)
  console.log(`  Correct Answer: ${c11AbDraft.choices?.[c11AbDraft.answerIndex!]}`)
}

// Test C12: Category Dominance
console.log("\n=== C12: Category Dominance ===\n")
const c12 = CHAIN_TEMPLATES["C12_CATEGORY_DOMINANCE"]
console.log(`Template ID: ${c12.id}`)
console.log(`Template Name: ${c12.name}`)
console.log(`checkPrereqs: ${c12.checkPrereqs(mockChainContext)}`)
console.log(`proposeFormats: ${c12.proposeFormats(mockChainContext).join(", ")}`)

const c12Draft = c12.instantiate(mockChainContext, "mc4", 12345)
if (c12Draft) {
  console.log(`\nGenerated Question:`)
  console.log(`  Prompt: "${c12Draft.prompt}"`)
  console.log(`  Choices: ${c12Draft.choices?.join(", ")}`)
  console.log(`  Answer Index: ${c12Draft.answerIndex}`)
  console.log(`  Correct Answer: ${c12Draft.choices?.[c12Draft.answerIndex!]}`)
  console.log(`  Difficulty Score: ${computeDifficulty(c12Draft.signals).toFixed(3)}`)
  console.log(`  ExplainData:`, JSON.stringify(c12Draft.explainData, null, 2))
} else {
  console.log("  Failed to generate question")
}

// Test with a smaller chain (Arbitrum)
console.log("\n=== Testing with Arbitrum (smaller chain) ===\n")

const arbitrumTopic: ChainPoolEntry = {
  slug: "Arbitrum",
  name: "Arbitrum",
  tvlRank: 5,
  tvl: 3_000_000_000,
  protocolCount: 150,
  historyDays: 800,
  change30d: 0.08,
  lastUpdated: "2024-12-13",
}

const arbitrumContext: TemplateContext = {
  ...mockChainContext,
  topic: arbitrumTopic,
}

console.log("C10 (Protocol Count) for Arbitrum:")
console.log(`  checkPrereqs: ${c10.checkPrereqs(arbitrumContext)}`)
const c10ArbitrumDraft = c10.instantiate(arbitrumContext, "mc4", 12345)
if (c10ArbitrumDraft) {
  console.log(`  Prompt: "${c10ArbitrumDraft.prompt}"`)
  console.log(`  Correct Answer: ${c10ArbitrumDraft.choices?.[c10ArbitrumDraft.answerIndex!]}`)
  console.log(`  Protocol Count: ${c10ArbitrumDraft.explainData?.protocolCount}`)
}

console.log("\nC11 (Top Protocol by TVL) for Arbitrum:")
console.log(`  checkPrereqs: ${c11.checkPrereqs(arbitrumContext)}`)
const c11ArbitrumDraft = c11.instantiate(arbitrumContext, "mc4", 12345)
if (c11ArbitrumDraft) {
  console.log(`  Prompt: "${c11ArbitrumDraft.prompt}"`)
  console.log(`  Correct Answer: ${c11ArbitrumDraft.choices?.[c11ArbitrumDraft.answerIndex!]}`)
}

console.log("\nC12 (Category Dominance) for Arbitrum:")
console.log(`  checkPrereqs: ${c12.checkPrereqs(arbitrumContext)}`)
const c12ArbitrumDraft = c12.instantiate(arbitrumContext, "mc4", 12345)
if (c12ArbitrumDraft) {
  console.log(`  Prompt: "${c12ArbitrumDraft.prompt}"`)
  console.log(`  Correct Answer: ${c12ArbitrumDraft.choices?.[c12ArbitrumDraft.answerIndex!]}`)
}

console.log("\n=== All Tests Complete ===")
