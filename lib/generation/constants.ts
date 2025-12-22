/**
 * Shared constants for episode generation
 *
 * Central location for configuration values used across the generation system.
 */

/**
 * Protocol categories to exclude from DeFi quizzes.
 *
 * CEXs (Centralized Exchanges) are custodial, centralized services that represent
 * the opposite of DeFi principles. While DefiLlama tracks them for completeness,
 * they shouldn't appear in a DeFi quiz because:
 * - They're not decentralized
 * - Their "TVL" is just customer deposits, not smart contract liquidity
 * - They have no on-chain protocol mechanics to learn about
 * - They typically lack fees/revenue data in DefiLlama
 */
export const EXCLUDED_PROTOCOL_CATEGORIES = ["CEX"] as const

export type ExcludedCategory = (typeof EXCLUDED_PROTOCOL_CATEGORIES)[number]

/**
 * Check if a category should be excluded from DeFi quizzes
 */
export function isExcludedCategory(category: string | undefined): boolean {
  if (!category) return false
  return EXCLUDED_PROTOCOL_CATEGORIES.includes(category as ExcludedCategory)
}
