/**
 * Question Templates Index
 *
 * Exports all template implementations for question generation
 */

// Protocol Templates (P1-P6)
export { p1ProtocolFingerprint, P1ProtocolFingerprint } from "./protocol-p1"
export { p2CrossChainDominance, P2CrossChainDominance } from "./protocol-p2"
export { p3TopChainConcentration, P3TopChainConcentration } from "./protocol-p3"
export { p4ATHTiming, P4ATHTiming } from "./protocol-p4"
export { p5FeesVsRevenue, P5FeesVsRevenue } from "./protocol-p5"
export { p6TVLTrend, P6TVLTrend } from "./protocol-p6"

// Chain Templates (C1-C6)
export { c1ChainFingerprint, C1ChainFingerprint } from "./chain-c1"
export { c2ChainTVLComparison, C2ChainTVLComparison } from "./chain-c2"
export { c3ChainATHTiming, C3ChainATHTiming } from "./chain-c3"
export { c4ChainGrowthRanking, C4ChainGrowthRanking } from "./chain-c4"
export { c5TopProtocolByFees, C5TopProtocolByFees } from "./chain-c5"
export { c6TopDEXByVolume, C6TopDEXByVolume } from "./chain-c6"

import type { Template, TemplateMatrix } from "@/lib/types/template"

import { p1ProtocolFingerprint } from "./protocol-p1"
import { p2CrossChainDominance } from "./protocol-p2"
import { p3TopChainConcentration } from "./protocol-p3"
import { p4ATHTiming } from "./protocol-p4"
import { p5FeesVsRevenue } from "./protocol-p5"
import { p6TVLTrend } from "./protocol-p6"

import { c1ChainFingerprint } from "./chain-c1"
import { c2ChainTVLComparison } from "./chain-c2"
import { c3ChainATHTiming } from "./chain-c3"
import { c4ChainGrowthRanking } from "./chain-c4"
import { c5TopProtocolByFees } from "./chain-c5"
import { c6TopDEXByVolume } from "./chain-c6"

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
 */
export const PROTOCOL_MATRIX: TemplateMatrix = {
  A: [p1ProtocolFingerprint],
  B: [p2CrossChainDominance, p3TopChainConcentration],
  C: [p5FeesVsRevenue, p4ATHTiming],
  D: [p4ATHTiming, p5FeesVsRevenue, p2CrossChainDominance],
  E: [p6TVLTrend, p3TopChainConcentration, p5FeesVsRevenue],
}

/**
 * Chain template matrix - maps slots to ordered list of templates to try
 * 
 * Note: Slots C and E have expanded template lists to reduce fallback frequency.
 * When fees/DEX data is unavailable, the algorithm can fall back to comparison
 * and growth templates which only require basic chain data.
 */
export const CHAIN_MATRIX: TemplateMatrix = {
  A: [c1ChainFingerprint],
  B: [c2ChainTVLComparison],
  C: [c5TopProtocolByFees, c6TopDEXByVolume, c3ChainATHTiming, c4ChainGrowthRanking],
  D: [c3ChainATHTiming, c4ChainGrowthRanking],
  E: [c6TopDEXByVolume, c5TopProtocolByFees, c4ChainGrowthRanking, c2ChainTVLComparison],
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
