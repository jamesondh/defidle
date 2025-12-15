/**
 * Question Templates Index
 *
 * Exports all template implementations for question generation
 */

// Protocol Templates (P1-P15)
export { p1ProtocolFingerprint, P1ProtocolFingerprint } from "./protocol-p1"
export { p2CrossChainDominance, P2CrossChainDominance } from "./protocol-p2"
export { p3TopChainConcentration, P3TopChainConcentration } from "./protocol-p3"
export { p4ATHTiming, P4ATHTiming } from "./protocol-p4"
export { p5FeesVsRevenue, P5FeesVsRevenue } from "./protocol-p5"
export { p6TVLTrend, P6TVLTrend } from "./protocol-p6"
export { p7CategoryIdentification, P7CategoryIdentification } from "./protocol-p7"
export { p8ChainMembership, P8ChainMembership } from "./protocol-p8"
export { p9TopChainName, P9TopChainName } from "./protocol-p9"
export { p10TVLBand, P10TVLBand } from "./protocol-p10"
export { p11FeesTrend, P11FeesTrend } from "./protocol-p11"
export { p12DEXVolumeTrend, P12DEXVolumeTrend } from "./protocol-p12"
export { p13TVLRankComparison, P13TVLRankComparison } from "./protocol-p13"
export { p14CategoryLeaderComparison, P14CategoryLeaderComparison } from "./protocol-p14"
export { p15RecentTVLDirection, P15RecentTVLDirection } from "./protocol-p15"

// Chain Templates (C1-C9)
export { c1ChainFingerprint, C1ChainFingerprint } from "./chain-c1"
export { c2ChainTVLComparison, C2ChainTVLComparison } from "./chain-c2"
export { c3ChainATHTiming, C3ChainATHTiming } from "./chain-c3"
export { c4ChainGrowthRanking, C4ChainGrowthRanking } from "./chain-c4"
export { c5TopProtocolByFees, C5TopProtocolByFees } from "./chain-c5"
export { c6TopDEXByVolume, C6TopDEXByVolume } from "./chain-c6"
export { c7ChainTVLBand, C7ChainTVLBand } from "./chain-c7"
export { c8_30DayDirection, C8_30DayDirection } from "./chain-c8"
export { c9DistanceFromATH, C9DistanceFromATH } from "./chain-c9"

import type { Template, TemplateMatrix } from "@/lib/types/template"

// Protocol Templates (P1-P15)
import { p1ProtocolFingerprint } from "./protocol-p1"
import { p2CrossChainDominance } from "./protocol-p2"
import { p3TopChainConcentration } from "./protocol-p3"
import { p4ATHTiming } from "./protocol-p4"
import { p5FeesVsRevenue } from "./protocol-p5"
import { p6TVLTrend } from "./protocol-p6"
import { p7CategoryIdentification } from "./protocol-p7"
import { p8ChainMembership } from "./protocol-p8"
import { p9TopChainName } from "./protocol-p9"
import { p10TVLBand } from "./protocol-p10"
import { p11FeesTrend } from "./protocol-p11"
import { p12DEXVolumeTrend } from "./protocol-p12"
import { p13TVLRankComparison } from "./protocol-p13"
import { p14CategoryLeaderComparison } from "./protocol-p14"
import { p15RecentTVLDirection } from "./protocol-p15"

// Chain Templates (C1-C9)
import { c1ChainFingerprint } from "./chain-c1"
import { c2ChainTVLComparison } from "./chain-c2"
import { c3ChainATHTiming } from "./chain-c3"
import { c4ChainGrowthRanking } from "./chain-c4"
import { c5TopProtocolByFees } from "./chain-c5"
import { c6TopDEXByVolume } from "./chain-c6"
import { c7ChainTVLBand } from "./chain-c7"
import { c8_30DayDirection } from "./chain-c8"
import { c9DistanceFromATH } from "./chain-c9"

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
}

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
 * Templates P13-P15 are single-chain friendly (don't require multi-chain data):
 * - P13 (TVL Rank Comparison): Good for slots B, D (compare to similar protocols)
 * - P14 (Category Leader): Good for slots C, D (category context)
 * - P15 (Recent TVL Direction): Good for slots C, E (simple trend)
 *
 * Previous templates:
 * - P7 (Category): Good for slot B (easy, recognizable)
 * - P8 (Chain Membership): Good for slots B, E (easy chain knowledge)
 * - P9 (Top Chain): Good for slots B, D (difficulty varies by margin)
 * - P10 (TVL Band): Good for slot E (wrap-up, general knowledge)
 * - P11 (Fees Trend): Good for slots C, D (medium-hard, requires analysis)
 * - P12 (DEX Volume Trend): Good for slots C, E (DEX-specific)
 */
export const PROTOCOL_MATRIX: TemplateMatrix = {
  A: [p1ProtocolFingerprint],
  B: [p2CrossChainDominance, p3TopChainConcentration, p7CategoryIdentification, p9TopChainName, p13TVLRankComparison],
  C: [p5FeesVsRevenue, p4ATHTiming, p11FeesTrend, p14CategoryLeaderComparison, p15RecentTVLDirection],
  D: [p4ATHTiming, p5FeesVsRevenue, p2CrossChainDominance, p11FeesTrend, p9TopChainName, p13TVLRankComparison, p14CategoryLeaderComparison],
  E: [p6TVLTrend, p3TopChainConcentration, p10TVLBand, p8ChainMembership, p12DEXVolumeTrend, p15RecentTVLDirection],
}

/**
 * Chain template matrix - maps slots to ordered list of templates to try
 *
 * Note: Slots C and E have expanded template lists to reduce fallback frequency.
 * When fees/DEX data is unavailable, the algorithm can fall back to comparison
 * and growth templates which only require basic chain data.
 *
 * New templates integrated:
 * - C7 (Chain TVL Band): Good for slot E (wrap-up, general knowledge)
 * - C8 (30-Day Direction): Good for slots B, E (easy trend question)
 * - C9 (Distance from ATH): Good for slots C, D (medium-hard analysis)
 */
export const CHAIN_MATRIX: TemplateMatrix = {
  A: [c1ChainFingerprint],
  B: [c2ChainTVLComparison, c8_30DayDirection],
  C: [c5TopProtocolByFees, c6TopDEXByVolume, c3ChainATHTiming, c4ChainGrowthRanking, c9DistanceFromATH],
  D: [c3ChainATHTiming, c4ChainGrowthRanking, c9DistanceFromATH],
  E: [c6TopDEXByVolume, c5TopProtocolByFees, c4ChainGrowthRanking, c2ChainTVLComparison, c7ChainTVLBand, c8_30DayDirection],
}

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
