#!/usr/bin/env bun
/**
 * Pool Refresh Script
 * 
 * Fetches top protocols and chains from DefiLlama API
 * and generates pool JSON files for quiz topic selection.
 * 
 * Usage: bun run scripts/refresh-pools.ts
 */

import { writeFile, readFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import {
  getProtocols,
  getProtocol,
  getChains,
  getChainTVLHistory,
  getAllFees,
  getAllDEXVolume,
  getProtocolHistoryDays,
  getChainHistoryDays,
} from "@/lib/api/defillama"
import type {
  ProtocolPoolEntry,
  ChainPoolEntry,
  PoolOverrides,
  ProtocolPool,
  ChainPool,
} from "@/lib/types/pools"
import {
  isExcludedCategory,
  EXCLUDED_PROTOCOL_CATEGORIES,
} from "@/lib/generation/constants"

const POOLS_DIR = "./data/pools"
const OVERRIDES_PATH = "./data/overrides.json"

// Configuration
const TOP_PROTOCOLS_TO_FETCH = 150
const TOP_CHAINS_TO_FETCH = 50
const FINAL_PROTOCOL_COUNT = 100
const FINAL_CHAIN_COUNT = 30
const MIN_HISTORY_DAYS = 30
const MIN_CHAIN_PROTOCOLS = 10
const RATE_LIMIT_DELAY_MS = 50 // Reduced delay for faster processing

/**
 * Load overrides configuration
 */
async function loadOverrides(): Promise<PoolOverrides> {
  try {
    const content = await readFile(OVERRIDES_PATH, "utf-8")
    return JSON.parse(content) as PoolOverrides
  } catch {
    console.log("No overrides file found, using defaults")
    return {
      protocols: { blocklist: [], forceInclude: [] },
      chains: { blocklist: [], forceInclude: [] },
    }
  }
}

/**
 * Format ISO date string
 */
function formatDate(): string {
  return new Date().toISOString().split("T")[0]
}

/**
 * Refresh protocol pool
 */
async function refreshProtocolPool(
  overrides: PoolOverrides
): Promise<ProtocolPool> {
  console.log("Fetching protocols list...")
  const allProtocols = await getProtocols()

  // Filter out excluded categories (CEXs) and sort by TVL descending
  const excludedProtocols = allProtocols.filter((p) =>
    isExcludedCategory(p.category)
  )
  if (excludedProtocols.length > 0) {
    console.log(
      `\nExcluding ${excludedProtocols.length} protocols with non-DeFi categories (${EXCLUDED_PROTOCOL_CATEGORIES.join(", ")}):`
    )
    // Log first 10 excluded for visibility
    excludedProtocols
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 10)
      .forEach((p) => {
        console.log(`  - ${p.name} (${p.category}, $${(p.tvl / 1e9).toFixed(1)}B TVL)`)
      })
    if (excludedProtocols.length > 10) {
      console.log(`  ... and ${excludedProtocols.length - 10} more`)
    }
    console.log()
  }

  const sortedProtocols = allProtocols
    .filter((p) => p.tvl > 0)
    .filter((p) => !isExcludedCategory(p.category))
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, TOP_PROTOCOLS_TO_FETCH)

  console.log(`Processing top ${sortedProtocols.length} protocols...`)

  // Get fees and volume data for enrichment
  let feesData: Map<string, boolean> = new Map()
  let volumeData: Map<string, boolean> = new Map()

  try {
    console.log("Fetching fees overview...")
    const allFees = await getAllFees()
    for (const p of allFees.protocols || []) {
      if (p.slug && (p.total24h ?? 0) > 0) {
        feesData.set(p.slug, true)
      }
    }
  } catch (error) {
    console.warn("Failed to fetch fees overview:", error)
  }

  try {
    console.log("Fetching DEX volumes overview...")
    const allVolume = await getAllDEXVolume()
    for (const p of allVolume.protocols || []) {
      if (p.slug && (p.total24h ?? 0) > 0) {
        volumeData.set(p.slug, true)
      }
    }
  } catch (error) {
    console.warn("Failed to fetch DEX volumes overview:", error)
  }

  // Process each protocol
  const poolEntries: ProtocolPoolEntry[] = []
  let rank = 0

  for (const protocol of sortedProtocols) {
    rank++

    // Skip blocklisted protocols
    if (overrides.protocols.blocklist.includes(protocol.slug)) {
      console.log(`  Skipping ${protocol.name} (blocklisted)`)
      continue
    }

    // Fetch detailed protocol data to get history
    let historyDays = 0
    try {
      const detail = await getProtocol(protocol.slug)
      historyDays = getProtocolHistoryDays(detail)
    } catch (error) {
      console.warn(`  Failed to fetch detail for ${protocol.name}:`, error)
    }

    // Apply quality thresholds
    if (historyDays < MIN_HISTORY_DAYS) {
      console.log(
        `  Skipping ${protocol.name} (only ${historyDays} days history)`
      )
      continue
    }

    const hasFeesData = feesData.has(protocol.slug)
    const hasVolumeData = volumeData.has(protocol.slug)

    const entry: ProtocolPoolEntry = {
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      tvlRank: rank,
      tvl: protocol.tvl,
      chains: protocol.chains || [],
      hasFeesData,
      hasRevenueData: hasFeesData, // Revenue data comes with fees
      hasVolumeData,
      historyDays,
      lastUpdated: formatDate(),
    }

    poolEntries.push(entry)
    console.log(
      `  Added ${protocol.name} (rank ${rank}, ${historyDays} days history)`
    )

    // Stop if we have enough
    if (poolEntries.length >= FINAL_PROTOCOL_COUNT) {
      break
    }

    // Rate limiting - small delay between detail fetches
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
  }

  // Add force-included protocols
  for (const slug of overrides.protocols.forceInclude) {
    if (!poolEntries.find((p) => p.slug === slug)) {
      try {
        const detail = await getProtocol(slug)
        const historyDays = getProtocolHistoryDays(detail)
        
        poolEntries.push({
          slug,
          name: detail.name,
          category: detail.category,
          tvlRank: 999, // Mark as force-included
          tvl: detail.currentChainTvls
            ? Object.values(detail.currentChainTvls).reduce((a, b) => a + b, 0)
            : 0,
          chains: detail.chains || [],
          hasFeesData: feesData.has(slug),
          hasRevenueData: feesData.has(slug),
          hasVolumeData: volumeData.has(slug),
          historyDays,
          lastUpdated: formatDate(),
        })
        console.log(`  Force-included ${detail.name}`)
      } catch (error) {
        console.warn(`  Failed to force-include ${slug}:`, error)
      }
    }
  }

  return {
    protocols: poolEntries,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Refresh chain pool
 */
async function refreshChainPool(
  overrides: PoolOverrides
): Promise<ChainPool> {
  console.log("\nFetching chains list...")
  const allChains = await getChains()

  // Sort by TVL descending
  const sortedChains = allChains
    .filter((c) => c.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, TOP_CHAINS_TO_FETCH)

  console.log(`Processing top ${sortedChains.length} chains...`)

  // Get protocol counts per chain from protocols list
  const protocols = await getProtocols()
  const chainProtocolCounts: Map<string, number> = new Map()
  
  for (const protocol of protocols) {
    for (const chain of protocol.chains || []) {
      const current = chainProtocolCounts.get(chain) || 0
      chainProtocolCounts.set(chain, current + 1)
    }
  }

  // Process each chain
  const poolEntries: ChainPoolEntry[] = []
  let rank = 0

  for (const chain of sortedChains) {
    rank++

    // Skip blocklisted chains
    if (overrides.chains.blocklist.includes(chain.name)) {
      console.log(`  Skipping ${chain.name} (blocklisted)`)
      continue
    }

    // Fetch historical data
    let historyDays = 0
    let change30d: number | undefined
    try {
      const history = await getChainTVLHistory(chain.name)
      historyDays = getChainHistoryDays(history)
      
      // Calculate 30-day change
      if (history.length >= 30) {
        const currentTvl = history[history.length - 1].tvl
        // Find TVL from ~30 days ago
        const thirtyDaysAgo = Date.now() / 1000 - 30 * 86400
        let pastTvl = history[0].tvl
        for (const entry of history) {
          if (entry.date <= thirtyDaysAgo) {
            pastTvl = entry.tvl
          } else {
            break
          }
        }
        if (pastTvl > 0) {
          change30d = (currentTvl - pastTvl) / pastTvl
        }
      }
    } catch (error) {
      console.warn(`  Failed to fetch history for ${chain.name}:`, error)
    }

    // Apply quality thresholds
    if (historyDays < MIN_HISTORY_DAYS) {
      console.log(
        `  Skipping ${chain.name} (only ${historyDays} days history)`
      )
      continue
    }

    const protocolCount = chainProtocolCounts.get(chain.name) || 0
    if (protocolCount < MIN_CHAIN_PROTOCOLS) {
      console.log(
        `  Skipping ${chain.name} (only ${protocolCount} protocols)`
      )
      continue
    }

    const entry: ChainPoolEntry = {
      slug: chain.name,
      name: chain.name,
      tvlRank: rank,
      tvl: chain.tvl,
      protocolCount,
      tokenSymbol: chain.tokenSymbol,
      historyDays,
      change30d,
      lastUpdated: formatDate(),
    }

    poolEntries.push(entry)
    console.log(
      `  Added ${chain.name} (rank ${rank}, ${protocolCount} protocols, ${historyDays} days history)`
    )

    // Stop if we have enough
    if (poolEntries.length >= FINAL_CHAIN_COUNT) {
      break
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
  }

  // Add force-included chains
  for (const chainName of overrides.chains.forceInclude) {
    if (!poolEntries.find((c) => c.slug === chainName)) {
      try {
        const history = await getChainTVLHistory(chainName)
        const historyDays = getChainHistoryDays(history)
        const tvl = history.length > 0 ? history[history.length - 1].tvl : 0

        poolEntries.push({
          slug: chainName,
          name: chainName,
          tvlRank: 999,
          tvl,
          protocolCount: chainProtocolCounts.get(chainName) || 0,
          historyDays,
          lastUpdated: formatDate(),
        })
        console.log(`  Force-included ${chainName}`)
      } catch (error) {
        console.warn(`  Failed to force-include ${chainName}:`, error)
      }
    }
  }

  return {
    chains: poolEntries,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log("=== DeFidle Pool Refresh ===")
  console.log(`Date: ${formatDate()}\n`)

  // Ensure pools directory exists
  if (!existsSync(POOLS_DIR)) {
    await mkdir(POOLS_DIR, { recursive: true })
  }

  // Load overrides
  const overrides = await loadOverrides()
  console.log(
    `Overrides: ${overrides.protocols.blocklist.length} protocol blocklist, ${overrides.chains.blocklist.length} chain blocklist\n`
  )

  // Refresh protocol pool
  const protocolPool = await refreshProtocolPool(overrides)
  await writeFile(
    `${POOLS_DIR}/protocols.json`,
    JSON.stringify(protocolPool, null, 2)
  )
  console.log(
    `\nProtocol pool written: ${protocolPool.protocols.length} protocols`
  )

  // Refresh chain pool
  const chainPool = await refreshChainPool(overrides)
  await writeFile(
    `${POOLS_DIR}/chains.json`,
    JSON.stringify(chainPool, null, 2)
  )
  console.log(`\nChain pool written: ${chainPool.chains.length} chains`)

  console.log("\n=== Pool Refresh Complete ===")
}

main().catch((error) => {
  console.error("Pool refresh failed:", error)
  process.exit(1)
})
