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
 * 
 * Templates now support comparison data for MC questions to show how
 * wrong choices compare to the correct answer.
 */
export const EXPLANATION_TEMPLATES: Record<string, string> = {
  // Protocol templates
  P1_FINGERPRINT:
    "{name} is a {category} protocol deployed on {chainCount} chains with {tvl} TVL.",
  P2_CROSSCHAIN:
    "{name} has {marginPercent}% more TVL on {winnerChain} ({winnerTvl}) compared to {loserChain} ({loserTvl}).",
  P3_CONCENTRATION:
    "{topChain} holds {sharePercent}% of {name}'s total TVL ({topChainTvl} of {totalTvl}).",
  P4_ATH_TIMING:
    "{name} reached its all-time high TVL of {athTvl} in {athMonth}.",
  P5_FEES_REVENUE:
    "{name} generated {fees7d} in fees over the past 7 days, with {revPercent} going to protocol revenue.",
  P6_TVL_TREND:
    "{name}'s TVL {trendDirection} by {changePercent}% over the past {period}, from {startTvl} to {endTvl}.",
  P7_CATEGORY:
    "{name} is a {category} protocol, ranked #{tvlRank} by TVL.",
  P8_CHAIN_MEMBERSHIP:
    "{name} is deployed on {chainCount} chains including {chains}.",
  P9_TOP_CHAIN:
    "{topChain} holds the most TVL for {name} with {topChainTvl} ({sharePercent}% of total).",
  P10_TVL_BAND:
    "{name} has {tvl} in TVL, placing it in the {tvlBand} range.",
  P11_FEES_TREND:
    "{name}'s fees {trendDirection} by {changePercent}% over the past month, from {pastFees} to {recentFees} weekly.",
  P12_DEX_VOLUME_TREND:
    "{name}'s trading volume {trendDirection} by {changePercent}% over the past 7 days, from {pastVolume} to {recentVolume}.",

  // Chain templates
  C1_FINGERPRINT:
    "{name} is ranked #{tvlRank} by TVL with {tvlFormatted} locked across {protocolCount} protocols.",
  C2_CHAIN_COMPARISON:
    "{winnerChain} has {marginPercent}% more TVL than {loserChain} ({winnerTvl} vs {loserTvl}).",
  C3_ATH_TIMING:
    "{name} reached its all-time high TVL of {athTvl} in {athMonth}.",
  C4_GROWTH_RANKING:
    "{topChain} had the highest 30-day TVL growth at {topGrowth}%, outpacing {comparison}.",
  C5_TOP_BY_FEES:
    "{topProtocol} leads {chain} in 24h fees with {feesAmount}, ahead of {comparison}.",
  C6_TOP_DEX:
    "{topDex} is the top DEX on {chain} with {volumeAmount} in 24h volume, ahead of {comparison}.",
  C7_CHAIN_TVL_BAND:
    "{name} has {tvl} in TVL, placing it in the {tvlBand} range among chains.",
  C8_30D_DIRECTION:
    "{name}'s TVL {direction} by {changePercent}% over the past 30 days, from {pastTvl} to {currentTvl}.",
  C9_DISTANCE_FROM_ATH:
    "{name} is currently {distancePercent}% below its all-time high TVL of {athValue} reached in {athMonth}.",
  C10_PROTOCOL_COUNT:
    "{chain} has {protocolCount} protocols deployed, placing it in the {countBucket} protocols range.",
  C11_TOP_PROTOCOL_TVL:
    "{topProtocol} leads {chain} in TVL with {topTvl}, capturing {sharePercent}% of chain TVL. Other top protocols include {comparison}.",
  C12_CATEGORY_DOMINANCE:
    "{topCategory} dominates {chain} with {topCategoryTvl} in TVL ({sharePercent}%), across {protocolCount} protocols. Other categories include {comparison}.",

  // Generic fallback - now more specific based on available data
  FALLBACK:
    "{name} is a {type} tracked on DefiLlama.",
  FALLBACK_GENERIC:
    "{name} is a {type} tracked on DefiLlama.",

  // ==========================================================================
  // Quantitative Fallback Templates
  // ==========================================================================
  // These provide explanations for the new data-driven fallback questions
  // that use actual TVL thresholds, trends, ranks, and comparisons.

  // TVL Threshold Questions
  FALLBACK_PROTOCOL_TVL_ABOVE_100M:
    "{name} has {tvl} in TVL, which is {comparison} the $100M threshold.",
  FALLBACK_PROTOCOL_TVL_ABOVE_500M:
    "{name} has {tvl} in TVL, which is {comparison} the $500M threshold.",
  FALLBACK_PROTOCOL_TVL_ABOVE_1B:
    "{name} has {tvl} in TVL, which is {comparison} the $1B threshold.",
  FALLBACK_PROTOCOL_TVL_ABOVE_5B:
    "{name} has {tvl} in TVL, which is {comparison} the $5B threshold.",

  // Trend Questions (Protocol)
  FALLBACK_PROTOCOL_TVL_INCREASED_7D:
    "{name}'s TVL {direction} by {change} over the past 7 days, reaching {tvl}.",
  FALLBACK_PROTOCOL_TVL_DECREASED_7D:
    "{name}'s TVL {direction} by {change} over the past 7 days, reaching {tvl}.",
  FALLBACK_PROTOCOL_TVL_UP_5PCT:
    "{name}'s TVL changed by {change} over the past week, which {comparison} the 5% threshold.",
  FALLBACK_PROTOCOL_TVL_DOWN_5PCT:
    "{name}'s TVL changed by {change} over the past week, which {comparison} the 5% decline threshold.",

  // Rank Questions (Protocol)
  FALLBACK_PROTOCOL_RANK_TOP_10:
    "{name} is ranked #{rank} by TVL, which is {comparison} the top 10.",
  FALLBACK_PROTOCOL_RANK_TOP_25:
    "{name} is ranked #{rank} by TVL, which is {comparison} the top 25.",
  FALLBACK_PROTOCOL_RANK_TOP_50:
    "{name} is ranked #{rank} by TVL, which is {comparison} the top 50.",

  // Chain Count Questions
  FALLBACK_PROTOCOL_CHAINS_ABOVE_3:
    "{name} is deployed on {chainCount} chains, which is {comparison} the 3-chain threshold.",
  FALLBACK_PROTOCOL_CHAINS_ABOVE_5:
    "{name} is deployed on {chainCount} chains, which is {comparison} the 5-chain threshold.",
  FALLBACK_PROTOCOL_CHAINS_ABOVE_10:
    "{name} is deployed on {chainCount} chains, which is {comparison} the 10-chain threshold.",

  // A/B Comparison Questions (Protocol)
  FALLBACK_PROTOCOL_COMPARE_NEARBY:
    "{winner} has {winnerTvl} in TVL compared to {loser}'s {loserTvl}, a {marginPercent}% difference.",
  FALLBACK_PROTOCOL_COMPARE_CATEGORY:
    "In the {category} category, {winner} has {winnerTvl} in TVL compared to {loser}'s {loserTvl}.",

  // Chain TVL Threshold Questions
  FALLBACK_CHAIN_TVL_ABOVE_100M:
    "{name} has {tvl} in total TVL, which is {comparison} the $100M threshold.",
  FALLBACK_CHAIN_TVL_ABOVE_500M:
    "{name} has {tvl} in total TVL, which is {comparison} the $500M threshold.",
  FALLBACK_CHAIN_TVL_ABOVE_1B:
    "{name} has {tvl} in total TVL, which is {comparison} the $1B threshold.",
  FALLBACK_CHAIN_TVL_ABOVE_5B:
    "{name} has {tvl} in total TVL, which is {comparison} the $5B threshold.",
  FALLBACK_CHAIN_TVL_ABOVE_10B:
    "{name} has {tvl} in total TVL, which is {comparison} the $10B threshold.",

  // Trend Questions (Chain)
  FALLBACK_CHAIN_TVL_INCREASED_30D:
    "{name}'s TVL {direction} by {change} over the past 30 days, reaching {tvl}.",
  FALLBACK_CHAIN_TVL_DECREASED_30D:
    "{name}'s TVL {direction} by {change} over the past 30 days, reaching {tvl}.",
  FALLBACK_CHAIN_TVL_UP_10PCT:
    "{name}'s TVL changed by {change} over the past month, which {comparison} the 10% threshold.",
  FALLBACK_CHAIN_TVL_DOWN_10PCT:
    "{name}'s TVL changed by {change} over the past month, which {comparison} the 10% decline threshold.",

  // Rank Questions (Chain)
  FALLBACK_CHAIN_RANK_TOP_5:
    "{name} is ranked #{rank} by TVL, which is {comparison} the top 5 chains.",
  FALLBACK_CHAIN_RANK_TOP_10:
    "{name} is ranked #{rank} by TVL, which is {comparison} the top 10 chains.",
  FALLBACK_CHAIN_RANK_TOP_20:
    "{name} is ranked #{rank} by TVL, which is {comparison} the top 20 chains.",

  // A/B Comparison Questions (Chain)
  FALLBACK_CHAIN_COMPARE_NEARBY:
    "{winner} has {winnerTvl} in TVL compared to {loser}'s {loserTvl}, a {marginPercent}% difference.",
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
    P7_CATEGORY: "protocol category",
    P8_CHAIN_MEMBERSHIP: "chain deployment",
    P9_TOP_CHAIN: "top chain by TVL",
    P10_TVL_BAND: "TVL size category",
    P11_FEES_TREND: "fees trend",
    P12_DEX_VOLUME_TREND: "trading volume trend",
    C1_FINGERPRINT: "chain characteristics",
    C2_CHAIN_COMPARISON: "chain TVL comparison",
    C3_ATH_TIMING: "historical TVL peak",
    C4_GROWTH_RANKING: "chain growth ranking",
    C5_TOP_BY_FEES: "fee leaderboard",
    C6_TOP_DEX: "DEX volume leaderboard",
    C7_CHAIN_TVL_BAND: "chain TVL size category",
    C8_30D_DIRECTION: "30-day TVL direction",
    C9_DISTANCE_FROM_ATH: "distance from all-time high",
    C10_PROTOCOL_COUNT: "protocol deployment count",
    C11_TOP_PROTOCOL_TVL: "top protocol by TVL",
    C12_CATEGORY_DOMINANCE: "category TVL breakdown",
    // Quantitative fallback descriptions
    FALLBACK_PROTOCOL_TVL_ABOVE_100M: "TVL threshold check",
    FALLBACK_PROTOCOL_TVL_ABOVE_500M: "TVL threshold check",
    FALLBACK_PROTOCOL_TVL_ABOVE_1B: "TVL threshold check",
    FALLBACK_PROTOCOL_TVL_ABOVE_5B: "TVL threshold check",
    FALLBACK_PROTOCOL_TVL_INCREASED_7D: "weekly TVL trend",
    FALLBACK_PROTOCOL_TVL_DECREASED_7D: "weekly TVL trend",
    FALLBACK_PROTOCOL_TVL_UP_5PCT: "weekly TVL change",
    FALLBACK_PROTOCOL_TVL_DOWN_5PCT: "weekly TVL change",
    FALLBACK_PROTOCOL_RANK_TOP_10: "TVL ranking",
    FALLBACK_PROTOCOL_RANK_TOP_25: "TVL ranking",
    FALLBACK_PROTOCOL_RANK_TOP_50: "TVL ranking",
    FALLBACK_PROTOCOL_CHAINS_ABOVE_3: "chain deployment count",
    FALLBACK_PROTOCOL_CHAINS_ABOVE_5: "chain deployment count",
    FALLBACK_PROTOCOL_CHAINS_ABOVE_10: "chain deployment count",
    FALLBACK_PROTOCOL_COMPARE_NEARBY: "TVL comparison",
    FALLBACK_PROTOCOL_COMPARE_CATEGORY: "category TVL comparison",
    FALLBACK_CHAIN_TVL_ABOVE_100M: "chain TVL threshold",
    FALLBACK_CHAIN_TVL_ABOVE_500M: "chain TVL threshold",
    FALLBACK_CHAIN_TVL_ABOVE_1B: "chain TVL threshold",
    FALLBACK_CHAIN_TVL_ABOVE_5B: "chain TVL threshold",
    FALLBACK_CHAIN_TVL_ABOVE_10B: "chain TVL threshold",
    FALLBACK_CHAIN_TVL_INCREASED_30D: "monthly TVL trend",
    FALLBACK_CHAIN_TVL_DECREASED_30D: "monthly TVL trend",
    FALLBACK_CHAIN_TVL_UP_10PCT: "monthly TVL change",
    FALLBACK_CHAIN_TVL_DOWN_10PCT: "monthly TVL change",
    FALLBACK_CHAIN_RANK_TOP_5: "chain TVL ranking",
    FALLBACK_CHAIN_RANK_TOP_10: "chain TVL ranking",
    FALLBACK_CHAIN_RANK_TOP_20: "chain TVL ranking",
    FALLBACK_CHAIN_COMPARE_NEARBY: "chain TVL comparison",
    FALLBACK_GENERIC: "DeFi metrics",
  }

  const description = templateDescriptions[templateId] || "DeFi metrics"
  return `${topicName}'s ${description} is based on DefiLlama data as of ${date}.`
}
