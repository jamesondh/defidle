/**
 * Question Templates Index
 *
 * Exports all template implementations for question generation.
 * Templates are now defined declaratively in protocols.ts and chains.ts.
 */

import type { Template } from "@/lib/types/template"

// =============================================================================
// Protocol Templates (P1-P15)
// =============================================================================

export {
  // Template instances
  p1ProtocolFingerprint,
  p2CrossChainDominance,
  p3TopChainConcentration,
  p4ATHTiming,
  p5FeesVsRevenue,
  p6TVLTrend,
  p7CategoryIdentification,
  p8ChainMembership,
  p9TopChainName,
  p10TVLBand,
  p11FeesTrend,
  p12DEXVolumeTrend,
  p13TVLRankComparison,
  p14CategoryLeaderComparison,
  p15RecentTVLDirection,
  // Config objects for documentation generation
  PROTOCOL_TEMPLATE_CONFIGS,
} from "./protocols"

// =============================================================================
// Chain Templates (C1-C12)
// =============================================================================

export {
  // Template instances
  c1ChainFingerprint,
  c2ChainTVLComparison,
  c3ChainATHTiming,
  c4ChainGrowthRanking,
  c5TopProtocolByFees,
  c6TopDEXByVolume,
  c7ChainTVLBand,
  c8_30DayDirection,
  c9DistanceFromATH,
  c10ProtocolCount,
  c11TopProtocolByTVL,
  c12CategoryDominance,
  // Config objects for documentation generation
  CHAIN_TEMPLATE_CONFIGS,
} from "./chains"

// Re-export config types and utilities
export {
  type TemplateConfig,
  type TemplateType,
  type PrereqResult,
  type FallbackConfig,
  type FallbackDifficulty,
  createTemplate,
  isProtocolContext,
  isChainContext,
  hasMinChains,
  hasFeesData,
  hasRevenueData,
  hasMinChainHistory,
  hasMinProtocolHistory,
  hasChainFeesData,
  hasChainDexData,
  hasChainPool,
  hasProtocolList,
  standardFormats,
  abFormats,
  // Fallback builder helpers
  createTvlThresholdFallback,
  createRankThresholdFallback,
  createTrendFallback,
  createTrendThresholdFallback,
  createChainCountFallback,
  // Formatting helpers
  formatTvlValue,
  formatChangeValue,
  getTvlThresholdMargin,
} from "./config"

// Re-export fallback configurations
export {
  PROTOCOL_FALLBACKS,
  CHAIN_FALLBACKS,
  getFallbacksForType,
} from "./fallbacks"

// Import for internal use
import {
  p1ProtocolFingerprint,
  p2CrossChainDominance,
  p3TopChainConcentration,
  p4ATHTiming,
  p5FeesVsRevenue,
  p6TVLTrend,
  p7CategoryIdentification,
  p8ChainMembership,
  p9TopChainName,
  p10TVLBand,
  p11FeesTrend,
  p12DEXVolumeTrend,
  p13TVLRankComparison,
  p14CategoryLeaderComparison,
  p15RecentTVLDirection,
} from "./protocols"

import {
  c1ChainFingerprint,
  c2ChainTVLComparison,
  c3ChainATHTiming,
  c4ChainGrowthRanking,
  c5TopProtocolByFees,
  c6TopDEXByVolume,
  c7ChainTVLBand,
  c8_30DayDirection,
  c9DistanceFromATH,
  c10ProtocolCount,
  c11TopProtocolByTVL,
  c12CategoryDominance,
} from "./chains"

import type { TemplateMatrix } from "@/lib/types/template"

// =============================================================================
// Template Registries
// =============================================================================

/**
 * All protocol templates indexed by ID
 */
export const PROTOCOL_TEMPLATES: Record<string, Template> = {
  P1_FINGERPRINT: p1ProtocolFingerprint,
  P2_CROSSCHAIN: p2CrossChainDominance,
  P3_CONCENTRATION: p3TopChainConcentration,
  P4_ATH_TIMING: p4ATHTiming,
  P5_FEES_REVENUE: p5FeesVsRevenue,
  P6_TVL_TREND: p6TVLTrend,
  P7_CATEGORY: p7CategoryIdentification,
  P8_CHAIN_MEMBERSHIP: p8ChainMembership,
  P9_TOP_CHAIN: p9TopChainName,
  P10_TVL_BAND: p10TVLBand,
  P11_FEES_TREND: p11FeesTrend,
  P12_DEX_VOLUME_TREND: p12DEXVolumeTrend,
  P13_TVL_RANK_COMPARISON: p13TVLRankComparison,
  P14_CATEGORY_LEADER: p14CategoryLeaderComparison,
  P15_RECENT_TVL_DIRECTION: p15RecentTVLDirection,
}

/**
 * All chain templates indexed by ID
 */
export const CHAIN_TEMPLATES: Record<string, Template> = {
  C1_FINGERPRINT: c1ChainFingerprint,
  C2_CHAIN_COMPARISON: c2ChainTVLComparison,
  C3_ATH_TIMING: c3ChainATHTiming,
  C4_GROWTH_RANKING: c4ChainGrowthRanking,
  C5_TOP_BY_FEES: c5TopProtocolByFees,
  C6_TOP_DEX: c6TopDEXByVolume,
  C7_CHAIN_TVL_BAND: c7ChainTVLBand,
  C8_30D_DIRECTION: c8_30DayDirection,
  C9_DISTANCE_FROM_ATH: c9DistanceFromATH,
  C10_PROTOCOL_COUNT: c10ProtocolCount,
  C11_TOP_PROTOCOL_TVL: c11TopProtocolByTVL,
  C12_CATEGORY_DOMINANCE: c12CategoryDominance,
}

// =============================================================================
// Template Matrices (Slot -> Template Priority List)
// =============================================================================

/**
 * Protocol template matrix - maps slots to ordered list of templates to try
 *
 * Slot assignments:
 * - A (Hook/Medium): Fingerprint guess to identify the topic
 * - B (Easy): High-margin comparison for confidence building
 * - C (Medium): Context questions about fees, revenue, or history
 * - D (Hard): Skill test with tight margins or precise timing
 * - E (Easy/Wrap-up): Trend or insight question
 *
 * Templates P13-P15 are single-chain friendly (don't require multi-chain data)
 */
export const PROTOCOL_MATRIX: TemplateMatrix = {
  A: [p1ProtocolFingerprint],
  B: [
    p2CrossChainDominance,
    p3TopChainConcentration,
    p7CategoryIdentification,
    p9TopChainName,
    p13TVLRankComparison,
  ],
  C: [
    p5FeesVsRevenue,
    p4ATHTiming,
    p11FeesTrend,
    p14CategoryLeaderComparison,
    p15RecentTVLDirection,
  ],
  D: [
    p4ATHTiming,
    p5FeesVsRevenue,
    p2CrossChainDominance,
    p11FeesTrend,
    p9TopChainName,
    p13TVLRankComparison,
    p14CategoryLeaderComparison,
  ],
  E: [
    p6TVLTrend,
    p3TopChainConcentration,
    p10TVLBand,
    p8ChainMembership,
    p12DEXVolumeTrend,
    p15RecentTVLDirection,
  ],
}

/**
 * Chain template matrix - maps slots to ordered list of templates to try
 */
export const CHAIN_MATRIX: TemplateMatrix = {
  A: [c1ChainFingerprint],
  B: [
    c2ChainTVLComparison,
    c8_30DayDirection,
    c10ProtocolCount,
    c11TopProtocolByTVL,
  ],
  C: [
    c5TopProtocolByFees,
    c6TopDEXByVolume,
    c3ChainATHTiming,
    c4ChainGrowthRanking,
    c9DistanceFromATH,
    c11TopProtocolByTVL,
    c12CategoryDominance,
  ],
  D: [
    c3ChainATHTiming,
    c4ChainGrowthRanking,
    c9DistanceFromATH,
    c11TopProtocolByTVL,
    c12CategoryDominance,
  ],
  E: [
    c6TopDEXByVolume,
    c5TopProtocolByFees,
    c4ChainGrowthRanking,
    c2ChainTVLComparison,
    c7ChainTVLBand,
    c8_30DayDirection,
    c10ProtocolCount,
  ],
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the template matrix for a given episode type
 */
export function getTemplateMatrix(episodeType: "protocol" | "chain"): TemplateMatrix {
  return episodeType === "protocol" ? PROTOCOL_MATRIX : CHAIN_MATRIX
}

/**
 * Get all templates for a given episode type
 */
export function getAllTemplates(episodeType: "protocol" | "chain"): Template[] {
  const templates = episodeType === "protocol" ? PROTOCOL_TEMPLATES : CHAIN_TEMPLATES
  return Object.values(templates)
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): Template | undefined {
  return PROTOCOL_TEMPLATES[id] ?? CHAIN_TEMPLATES[id]
}
