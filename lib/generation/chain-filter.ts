/**
 * Chain Filter Utilities
 *
 * DefiLlama's currentChainTvls object includes non-chain keys for certain protocol types,
 * particularly lending protocols. These keys represent different metrics rather than
 * actual blockchain deployments:
 *
 * - "borrowed" - total borrowed amount across all chains
 * - "{Chain}-borrowed" - borrowed amount on a specific chain (e.g., "Solana-borrowed")
 * - "staking" - staked assets
 * - "pool2" - liquidity pool tokens
 * - "vesting" - vesting tokens
 * - "treasury" - treasury holdings
 * - "offers" - offer-related TVL
 *
 * This module provides utilities to filter these non-chain keys when calculating
 * chain-specific metrics like concentration, cross-chain comparisons, etc.
 */

/**
 * Known metric suffixes that appear as "{Chain}-{metric}" in currentChainTvls
 */
const METRIC_SUFFIXES = [
  "-borrowed",
  "-staking",
  "-pool2",
  "-vesting",
  "-treasury",
]

/**
 * Standalone metric keys that appear directly in currentChainTvls
 */
const STANDALONE_METRICS = [
  "borrowed",
  "staking",
  "pool2",
  "vesting",
  "treasury",
  "offers",
]

/**
 * Check if a key from currentChainTvls represents an actual blockchain chain
 * rather than a metric category.
 *
 * @param key - The key from currentChainTvls object
 * @returns true if this key represents an actual chain, false if it's a metric
 *
 * @example
 * isActualChain("Ethereum") // true
 * isActualChain("Solana") // true
 * isActualChain("borrowed") // false
 * isActualChain("Solana-borrowed") // false
 * isActualChain("staking") // false
 */
export function isActualChain(key: string): boolean {
  const lowerKey = key.toLowerCase()

  // Exclude known metric suffixes (e.g., "Solana-borrowed")
  if (METRIC_SUFFIXES.some((suffix) => lowerKey.endsWith(suffix))) {
    return false
  }

  // Exclude standalone metric keys
  if (STANDALONE_METRICS.includes(lowerKey)) {
    return false
  }

  return true
}

/**
 * Filter currentChainTvls entries to only include actual chains with positive TVL.
 *
 * @param chainTvls - The currentChainTvls object from protocol detail
 * @returns Filtered entries as [chainName, tvl] tuples
 *
 * @example
 * const filtered = filterToActualChains({
 *   "Solana": 1000000000,
 *   "Solana-borrowed": 500000000,
 *   "borrowed": 500000000
 * })
 * // Returns: [["Solana", 1000000000]]
 */
export function filterToActualChains(
  chainTvls: Record<string, number>
): [string, number][] {
  return Object.entries(chainTvls).filter(
    ([key, tvl]) => tvl > 0 && isActualChain(key)
  )
}

/**
 * Get the count of actual chains (excluding metric keys) in currentChainTvls.
 *
 * @param chainTvls - The currentChainTvls object from protocol detail
 * @returns Count of actual chains with positive TVL
 */
export function getActualChainCount(chainTvls: Record<string, number>): number {
  return filterToActualChains(chainTvls).length
}

/**
 * Calculate total TVL across actual chains only (excluding borrowed, staking, etc.).
 *
 * @param chainTvls - The currentChainTvls object from protocol detail
 * @returns Sum of TVL across actual chains
 */
export function sumActualChainTvl(chainTvls: Record<string, number>): number {
  return filterToActualChains(chainTvls).reduce((sum, [, tvl]) => sum + tvl, 0)
}

/**
 * Log a warning when a protocol appears to be single-chain but was expected to be multi-chain.
 * Useful for debugging template prerequisite failures.
 *
 * @param protocolName - Name of the protocol
 * @param chainTvls - The currentChainTvls object
 * @param templateId - ID of the template that checked the prerequisite
 */
export function warnIfSingleChain(
  protocolName: string,
  chainTvls: Record<string, number>,
  templateId: string
): void {
  const actualChains = filterToActualChains(chainTvls)
  if (actualChains.length === 1) {
    console.warn(
      `[${templateId}] ${protocolName} is single-chain (${actualChains[0][0]}) - ` +
        `skipping multi-chain template. Raw keys: ${Object.keys(chainTvls).join(", ")}`
    )
  }
}
