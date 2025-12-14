/**
 * LLM Fallbacks
 *
 * Template-based fallback explanations when LLM is unavailable.
 * These provide deterministic, structured explanations based on explainData.
 */

// =============================================================================
// Explanation Templates
// =============================================================================

/**
 * Template strings for each question template type.
 * Placeholders use {key} syntax and are replaced with explainData values.
 */
export const EXPLANATION_TEMPLATES: Record<string, string> = {
  // Protocol templates
  P1_FINGERPRINT:
    "{name} is a {category} protocol deployed on {chainCount} chains with {tvlFormatted} TVL.",
  P2_CROSSCHAIN:
    "{name} has {marginPercent}% more TVL on {winnerChain} ({winnerTvl}) compared to {loserChain} ({loserTvl}).",
  P3_CONCENTRATION:
    "{topChain} holds {sharePercent}% of {name}'s total TVL ({topChainTvl} of {totalTvl}).",
  P4_ATH_TIMING:
    "{name} reached its all-time high TVL of {athValue} in {athMonth}.",
  P5_FEES_REVENUE:
    "{name} generated {fees7d} in fees over the past 7 days, with {revPercent}% going to protocol revenue.",
  P6_TVL_TREND:
    "{name}'s TVL {trendDirection} by {changePercent}% over the past {period}, from {startTvl} to {endTvl}.",

  // Chain templates
  C1_FINGERPRINT:
    "{name} is ranked #{tvlRank} by TVL with {tvlFormatted} locked across {protocolCount} protocols.",
  C2_CHAIN_COMPARISON:
    "{winnerChain} has {marginPercent}% more TVL than {loserChain} ({winnerTvl} vs {loserTvl}).",
  C3_ATH_TIMING:
    "{name} reached its all-time high TVL of {athValue} in {athMonth}.",
  C4_GROWTH_RANKING:
    "{topChain} had the highest 30-day TVL growth at {topGrowth}% among the compared chains.",
  C5_TOP_BY_FEES:
    "{topProtocol} leads {chain} in 24h fees with {feesAmount}, capturing {sharePercent}% of chain fees.",
  C6_TOP_DEX:
    "{topDex} is the top DEX on {chain} with {volumeAmount} in 24h volume ({sharePercent}% of chain DEX volume).",

  // Generic fallback
  FALLBACK:
    "The correct answer is based on data from DefiLlama as of {date}.",
}

// =============================================================================
// Fallback Generation
// =============================================================================

/**
 * Generate a fallback explanation using templates
 *
 * @param templateId - The template ID (e.g., "P1_FINGERPRINT")
 * @param data - The explainData from the question draft
 * @returns Generated explanation string
 */
export function generateFallbackExplanation(
  templateId: string,
  data: Record<string, unknown>
): string {
  // Get template or use fallback
  const template = EXPLANATION_TEMPLATES[templateId] || EXPLANATION_TEMPLATES.FALLBACK

  // Replace all {placeholders} with data values
  return template.replace(/{(\w+)}/g, (_match, key) => {
    const value = data[key]
    if (value === undefined || value === null) {
      // Keep placeholder if value not found (for debugging)
      return `[${key}]`
    }
    return String(value)
  })
}

/**
 * Check if all required placeholders are available in data
 *
 * @param templateId - The template ID
 * @param data - The explainData to check
 * @returns Object with isComplete flag and missing keys
 */
export function checkTemplateData(
  templateId: string,
  data: Record<string, unknown>
): { isComplete: boolean; missingKeys: string[] } {
  const template = EXPLANATION_TEMPLATES[templateId]
  if (!template) {
    return { isComplete: false, missingKeys: ["template not found"] }
  }

  // Extract all placeholder keys
  const placeholderRegex = /{(\w+)}/g
  const requiredKeys: string[] = []
  let regexMatch
  while ((regexMatch = placeholderRegex.exec(template)) !== null) {
    requiredKeys.push(regexMatch[1])
  }

  // Check which keys are missing
  const missingKeys = requiredKeys.filter(
    (key) => data[key] === undefined || data[key] === null
  )

  return {
    isComplete: missingKeys.length === 0,
    missingKeys,
  }
}

/**
 * Get all available template IDs
 */
export function getAvailableTemplateIds(): string[] {
  return Object.keys(EXPLANATION_TEMPLATES)
}

// =============================================================================
// Simple Fallbacks for Edge Cases
// =============================================================================

/**
 * Generate a very simple fallback when even template data is missing
 */
export function generateSimpleFallback(
  topicName: string,
  templateId: string,
  date: string
): string {
  // Map template IDs to simple descriptions
  const templateDescriptions: Record<string, string> = {
    P1_FINGERPRINT: "protocol characteristics",
    P2_CROSSCHAIN: "cross-chain TVL distribution",
    P3_CONCENTRATION: "TVL concentration",
    P4_ATH_TIMING: "historical TVL peak",
    P5_FEES_REVENUE: "fee and revenue data",
    P6_TVL_TREND: "TVL trend",
    C1_FINGERPRINT: "chain characteristics",
    C2_CHAIN_COMPARISON: "chain TVL comparison",
    C3_ATH_TIMING: "historical TVL peak",
    C4_GROWTH_RANKING: "chain growth ranking",
    C5_TOP_BY_FEES: "fee leaderboard",
    C6_TOP_DEX: "DEX volume leaderboard",
  }

  const description = templateDescriptions[templateId] || "DeFi metrics"
  return `${topicName}'s ${description} is based on DefiLlama data as of ${date}.`
}
