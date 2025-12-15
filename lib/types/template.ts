/**
 * Question Template Types
 *
 * Defines the Template interface for question generation
 */

import type {
  QuestionFormat,
  QuestionDraft,
  TemplateContext,
} from "./episode"

/**
 * Template interface for question generation
 *
 * Each template (P1-P6, C1-C6) implements this interface
 */
export interface Template {
  /** Unique template identifier (e.g., "P1_FINGERPRINT") */
  id: string

  /** Template name for logging */
  name: string

  /** Whether this template can be used multiple times in an episode */
  allowReuse?: boolean

  /**
   * Semantic topics this template covers.
   * 
   * Templates with overlapping semantic topics will not both be selected
   * in the same episode, even if they have different template IDs.
   * This prevents semantically duplicate questions like:
   * - P6 "Did TVL increase over 7 days?" (tf)
   * - P15 "Over the past 7 days, did TVL increase or decrease?" (ab)
   * 
   * Common semantic topics:
   * - "tvl_trend_7d" - questions about 7-day TVL direction
   * - "tvl_trend_30d" - questions about 30-day TVL direction  
   * - "category_identification" - what category is the protocol
   * - "chain_tvl_comparison" - comparing TVL across chains
   * - "ath_timing" - when did ATH occur
   */
  semanticTopics?: string[]

  /**
   * Check if template prerequisites are met
   * Returns true if the template can be used with the given context
   */
  checkPrereqs(ctx: TemplateContext): boolean

  /**
   * Return formats to try, in preference order
   * Most specific/harder format first, with fallbacks
   */
  proposeFormats(ctx: TemplateContext): QuestionFormat[]

  /**
   * Generate a question draft for the given format
   * Returns null if generation is not possible for this format
   */
  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null
}

/**
 * Template registry - maps template IDs to template implementations
 */
export type TemplateRegistry = Record<string, Template>

/**
 * Template matrix - maps slots to ordered list of templates to try
 */
export type TemplateMatrix = Record<string, Template[]>

/**
 * Base class for protocol templates
 */
export abstract class ProtocolTemplate implements Template {
  abstract id: string
  abstract name: string
  allowReuse?: boolean
  semanticTopics?: string[]

  abstract checkPrereqs(ctx: TemplateContext): boolean
  abstract proposeFormats(ctx: TemplateContext): QuestionFormat[]
  abstract instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null

  /**
   * Helper to check if context is for a protocol episode
   */
  protected isProtocolContext(ctx: TemplateContext): boolean {
    return ctx.episodeType === "protocol"
  }

  /**
   * Helper to check if protocol has sufficient TVL history
   */
  protected hasMinHistoryDays(ctx: TemplateContext, minDays: number): boolean {
    const protocolDetail = ctx.data.protocolDetail
    if (!protocolDetail?.tvl || protocolDetail.tvl.length < 2) return false

    const firstDate = protocolDetail.tvl[0].date
    const lastDate = protocolDetail.tvl[protocolDetail.tvl.length - 1].date
    const days = Math.floor((lastDate - firstDate) / 86400)
    return days >= minDays
  }
}

/**
 * Base class for chain templates
 */
export abstract class ChainTemplate implements Template {
  abstract id: string
  abstract name: string
  allowReuse?: boolean
  semanticTopics?: string[]

  abstract checkPrereqs(ctx: TemplateContext): boolean
  abstract proposeFormats(ctx: TemplateContext): QuestionFormat[]
  abstract instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null

  /**
   * Helper to check if context is for a chain episode
   */
  protected isChainContext(ctx: TemplateContext): boolean {
    return ctx.episodeType === "chain"
  }

  /**
   * Helper to check if chain has sufficient TVL history
   */
  protected hasMinHistoryDays(ctx: TemplateContext, minDays: number): boolean {
    const history = ctx.data.chainHistory
    if (!history || history.length < 2) return false

    const firstDate = history[0].date
    const lastDate = history[history.length - 1].date
    const days = Math.floor((lastDate - firstDate) / 86400)
    return days >= minDays
  }
}
