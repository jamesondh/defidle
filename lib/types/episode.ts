/**
 * Episode Types
 *
 * Defines the structure of episodes, questions, and difficulty scoring
 */

import type { ProtocolPoolEntry, ChainPoolEntry } from "./pools"

// =============================================================================
// Question Formats
// =============================================================================

/**
 * Available question formats
 * - tf: True/False
 * - ab: Binary choice (A or B)
 * - mc4: 4-choice multiple choice
 * - mc6: 6-choice multiple choice
 * - rank4: Order 4 items
 */
export type QuestionFormat = "tf" | "ab" | "mc4" | "mc6" | "rank4"

// =============================================================================
// Difficulty System
// =============================================================================

/**
 * Difficulty target for question slots
 */
export type DifficultyTarget = "easy" | "medium" | "hard"

/**
 * TVL rank bucket for familiarity scoring
 */
export type FamiliarityRankBucket = "top_10" | "top_25" | "top_100" | "long_tail"

/**
 * Signals used to compute difficulty score
 */
export interface DifficultySignals {
  format: QuestionFormat
  familiarityRankBucket: FamiliarityRankBucket
  /** Margin between correct answer and alternatives (0-1), null if N/A */
  margin: number | null
  /** Volatility score of underlying data (0-1), null if N/A */
  volatility: number | null
}

// =============================================================================
// Question Structure
// =============================================================================

/**
 * A single question in an episode
 */
export interface Question {
  /** Unique question ID within episode (e.g., "q1") */
  qid: string
  /** Slot assignment (A-E) */
  slot: string
  /** Template ID that generated this question */
  templateId: string
  /** Question format */
  format: QuestionFormat
  /** The question prompt shown to the user */
  prompt: string
  /** Optional clues for fingerprint-style questions */
  clues?: string[]
  /** 
   * Answer choices for all choice-based formats (tf, ab, mc4, mc6).
   * For TF format, this is always ["True", "False"].
   */
  choices?: string[]
  /** 
   * Index of correct answer in choices array.
   * Used for answer evaluation in all choice-based formats (tf, ab, mc4, mc6).
   * For TF format: 0 = True, 1 = False.
   */
  answerIndex?: number
  /** 
   * Boolean value of correct answer (for TF format only).
   * This is informational/for reference - answerIndex is used for evaluation.
   */
  answerValue?: boolean
  /** Correct ranking order (for rank format) */
  answerOrder?: string[]
  /** Explanation shown after answering */
  explanation: string
  /** Difficulty target for this slot */
  difficulty: DifficultyTarget
  /** Computed difficulty score (0-1) */
  difficultyScore?: number
  /** Whether LLM fallback was used for explanation */
  llmFallback: boolean
  /** Difficulty signals used for scoring */
  signals?: DifficultySignals
}

/**
 * Draft question structure during generation (before LLM text)
 */
export interface QuestionDraft {
  templateId: string
  format: QuestionFormat
  prompt: string
  clues?: string[]
  choices?: string[]
  answerIndex?: number
  answerValue?: boolean
  answerOrder?: string[]
  /** Signals for difficulty calculation */
  signals: DifficultySignals
  /** Structured data for generating LLM explanation */
  explainData: Record<string, unknown>
  /** Build notes for debugging */
  buildNotes: string[]
}

// =============================================================================
// Topic Types
// =============================================================================

/**
 * Protocol topic for episode
 */
export interface ProtocolTopic {
  slug: string
  name: string
  category: string
}

/**
 * Chain topic for episode
 */
export interface ChainTopic {
  slug: string
  name: string
}

/**
 * Union type for topics
 */
export type Topic = ProtocolTopic | ChainTopic

// =============================================================================
// Episode Structure
// =============================================================================

/**
 * Episode type (protocol or chain focused)
 */
export type EpisodeType = "protocol" | "chain"

/**
 * A complete episode ready for storage/serving
 */
export interface Episode {
  /** Unique episode ID (format: "YYYY-MM-DD:type:slug") */
  episodeId: string
  /** UTC date of the episode */
  dateUtc: string
  /** Episode type */
  episodeType: EpisodeType
  /** Topic for this episode */
  topic: Topic
  /** Questions in order */
  questions: Question[]
  /** When episode was generated */
  generatedAt: string
  /** Optional build log for debugging */
  buildLog?: BuildLogEntry[]
}

// =============================================================================
// Build Log
// =============================================================================

/**
 * Build log entry for tracking generation decisions
 */
export interface BuildLogEntry {
  slot?: string
  template?: string
  format?: string
  decision:
    | "selected"
    | "skip"
    | "reject"
    | "adjusted"
    | "fallback"
    | "post_balance"
  reason?: string
  score?: number
  target?: DifficultyTarget
  originalFormat?: string
  newFormat?: string
  qid?: string
}

// =============================================================================
// Template Context
// =============================================================================

/**
 * Fetched data from DefiLlama APIs
 */
export interface FetchedData {
  /** Protocol detail if protocol episode */
  protocolDetail?: import("./defillama").ProtocolDetail
  /** Protocol list for distractors */
  protocolList?: import("./defillama").ProtocolListEntry[]
  /** Protocol fees data */
  protocolFees?: import("./defillama").ProtocolFeesData
  /** Protocol revenue data */
  protocolRevenue?: import("./defillama").ProtocolFeesData
  /** Chain list */
  chainList?: import("./defillama").ChainListEntry[]
  /** Chain TVL history */
  chainHistory?: import("./defillama").ChainTVLHistoryPoint[]
  /** Chain fees overview */
  chainFees?: import("./defillama").ChainFeesOverview
  /** Chain DEX volume overview */
  chainDexVolume?: import("./defillama").ChainDEXOverview
  /** Chain pool with pre-computed metrics (for C4 growth ranking) */
  chainPool?: import("./pools").ChainPoolEntry[]
}

/**
 * Simplified protocol/chain entry for comparison fallbacks
 */
export interface ComparisonEntry {
  slug: string
  name: string
  tvl: number
  rank: number
  category?: string
}

/**
 * Derived metrics computed from fetched data
 */
export interface DerivedMetrics {
  // Protocol metrics
  tvlRank?: number
  tvlRankBucket?: FamiliarityRankBucket
  tvlBand?: string
  chainCount?: number
  chainCountBucket?: string
  change7d?: number
  change30d?: number
  changeBucket?: string
  topChain?: string
  topChainTvl?: number
  topChainShare?: number
  athValue?: number
  athDate?: number
  athMonth?: string
  fees7d?: number
  revenue7d?: number
  revToFeesRatio?: number
  tvlVolatility?: number

  // Chain metrics
  chainTvlRank?: number
  chainTvlBand?: string
  chainChange30d?: number
  chainAthValue?: number
  chainAthDate?: number
  chainAthMonth?: string

  // Comparison data for quantitative fallbacks
  /** Protocols within ±5 rank positions for TVL comparisons */
  nearbyProtocols?: ComparisonEntry[]
  /** Other protocols in the same category */
  categoryProtocols?: ComparisonEntry[]
  /** Chains within ±5 rank positions for TVL comparisons */
  nearbyChains?: ComparisonEntry[]
  /** Current TVL value (for threshold questions) */
  currentTvl?: number
}

/**
 * Context passed to templates during question generation
 */
export interface TemplateContext {
  /** Episode date */
  date: string
  /** Episode type */
  episodeType: EpisodeType
  /** Selected topic */
  topic: ProtocolPoolEntry | ChainPoolEntry
  /** Fetched API data */
  data: FetchedData
  /** Computed metrics */
  derived: DerivedMetrics
}
