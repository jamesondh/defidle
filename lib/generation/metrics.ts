/**
 * Data Metrics Helpers
 *
 * Utility functions for computing metrics from time series data
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Time series data point with timestamp and value
 */
export interface TimeSeriesPoint {
  /** Unix timestamp (seconds) */
  ts: number
  /** Value at this point */
  value: number
}

/**
 * Simple value point (for arrays without timestamp)
 */
export interface ValuePoint {
  value: number
}

// =============================================================================
// Time Window Helpers
// =============================================================================

const SECONDS_PER_DAY = 86400

/**
 * Get the last N items from an array
 */
export function lastN<T>(series: T[], n: number): T[] {
  return series.slice(Math.max(0, series.length - n))
}

/**
 * Sum the values of the last N points in a series
 */
export function sumLastN(series: ValuePoint[], n: number): number {
  return lastN(series, n).reduce((sum, p) => sum + p.value, 0)
}

/**
 * Find the value at or before a given timestamp
 * Returns the closest point at or before the target timestamp
 */
export function findValueAtOrBefore(
  series: TimeSeriesPoint[],
  targetTs: number
): TimeSeriesPoint | null {
  if (series.length === 0) return null

  // Binary search for efficiency
  let lo = 0
  let hi = series.length - 1

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (series[mid].ts <= targetTs) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return series[lo].ts <= targetTs ? series[lo] : null
}

// =============================================================================
// Change Calculations
// =============================================================================

/**
 * Calculate percentage change over a number of days
 *
 * @param series - Time series data with ts and value
 * @param days - Number of days to look back
 * @returns Percentage change (e.g., 0.15 for 15%), or null if insufficient data
 */
export function percentChange(
  series: TimeSeriesPoint[],
  days: number
): number | null {
  if (series.length < 2) return null

  const now = series[series.length - 1]
  const targetTs = now.ts - days * SECONDS_PER_DAY
  const past = findValueAtOrBefore(series, targetTs)

  if (!past || past.value <= 0) return null

  return (now.value - past.value) / past.value
}

/**
 * Calculate percentage change from TVL history array format
 * (date as Unix timestamp, totalLiquidityUSD)
 */
export function percentChangeFromTvlHistory(
  history: Array<{ date: number; totalLiquidityUSD: number }>,
  days: number
): number | null {
  if (history.length < 2) return null

  const series = history.map((p) => ({
    ts: p.date,
    value: p.totalLiquidityUSD,
  }))

  return percentChange(series, days)
}

/**
 * Calculate percentage change from chain TVL history format
 */
export function percentChangeFromChainHistory(
  history: Array<{ date: number; tvl: number }>,
  days: number
): number | null {
  if (history.length < 2) return null

  const series = history.map((p) => ({
    ts: p.date,
    value: p.tvl,
  }))

  return percentChange(series, days)
}

// =============================================================================
// Margin Calculations
// =============================================================================

/**
 * Calculate the A/B margin between two values
 * Margin = abs(a - b) / max(a, b)
 *
 * @returns Margin as decimal (0-1), or null if invalid
 */
export function abMargin(a: number, b: number): number | null {
  const max = Math.max(a, b)
  if (max <= 0) return null
  return Math.abs(a - b) / max
}

/**
 * Calculate the top-2 margin (gap between #1 and #2)
 * Margin = (v1 - v2) / v1
 *
 * @param sortedDesc - Values sorted in descending order
 * @returns Margin as decimal (0-1), or null if invalid
 */
export function top2Margin(sortedDesc: number[]): number | null {
  if (sortedDesc.length < 2 || sortedDesc[0] <= 0) return null
  return (sortedDesc[0] - sortedDesc[1]) / sortedDesc[0]
}

/**
 * Calculate margin between consecutive items in a sorted list
 * Useful for checking if ranking questions have sufficient separation
 */
export function consecutiveMargins(sortedDesc: number[]): number[] {
  const margins: number[] = []

  for (let i = 0; i < sortedDesc.length - 1; i++) {
    const margin = abMargin(sortedDesc[i], sortedDesc[i + 1])
    margins.push(margin ?? 0)
  }

  return margins
}

/**
 * Check if all consecutive margins meet a minimum threshold
 */
export function hasMinSeparation(
  sortedDesc: number[],
  minMargin: number
): boolean {
  const margins = consecutiveMargins(sortedDesc)
  return margins.every((m) => m >= minMargin)
}

// =============================================================================
// Volatility Scoring
// =============================================================================

/**
 * Calculate volatility score for a time series
 *
 * Measures how "noisy" the series is using standard deviation of log returns.
 * Higher volatility means data is more unpredictable and should use bucketed
 * formats rather than precise values.
 *
 * @param series - Array of value points
 * @param windowDays - Number of days to analyze
 * @returns Volatility score (0-1), or null if insufficient data
 */
export function volatilityScore(
  series: ValuePoint[],
  windowDays: number
): number | null {
  const s = lastN(series, windowDays + 1)
  if (s.length < 8) return null

  // Compute log returns
  const returns: number[] = []
  for (let i = 1; i < s.length; i++) {
    const v0 = s[i - 1].value
    const v1 = s[i].value
    if (v0 <= 0 || v1 <= 0) continue
    returns.push(Math.log(v1 / v0))
  }

  if (returns.length < 6) return null

  // Winsorize at p10/p90 to reduce spike impact
  const sorted = [...returns].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.1)]
  const hi = sorted[Math.floor(sorted.length * 0.9)]
  const winsorized = returns.map((r) => Math.max(lo, Math.min(hi, r)))

  // Standard deviation
  const mean = winsorized.reduce((a, b) => a + b, 0) / winsorized.length
  const variance =
    winsorized.reduce((sum, r) => sum + (r - mean) ** 2, 0) / winsorized.length
  const sd = Math.sqrt(variance)

  // Normalize to 0-1 (0.12 is empirical threshold for "high" volatility)
  return Math.min(1, sd / 0.12)
}

/**
 * Calculate volatility from TVL history format
 */
export function volatilityFromTvlHistory(
  history: Array<{ date: number; totalLiquidityUSD: number }>,
  windowDays: number
): number | null {
  const series = history.map((p) => ({ value: p.totalLiquidityUSD }))
  return volatilityScore(series, windowDays)
}

/**
 * Calculate volatility from chain TVL history format
 */
export function volatilityFromChainHistory(
  history: Array<{ date: number; tvl: number }>,
  windowDays: number
): number | null {
  const series = history.map((p) => ({ value: p.tvl }))
  return volatilityScore(series, windowDays)
}

/**
 * Interpret volatility score
 */
export function interpretVolatility(
  score: number
): "low" | "moderate" | "high" {
  if (score < 0.3) return "low"
  if (score < 0.75) return "moderate"
  return "high"
}

// =============================================================================
// ATH (All-Time High) Calculations
// =============================================================================

/**
 * Find the all-time high value and date in a series
 */
export function findATH(
  series: TimeSeriesPoint[]
): { value: number; ts: number } | null {
  if (series.length === 0) return null

  let maxValue = -Infinity
  let maxTs = 0

  for (const point of series) {
    if (point.value > maxValue) {
      maxValue = point.value
      maxTs = point.ts
    }
  }

  return maxValue > 0 ? { value: maxValue, ts: maxTs } : null
}

/**
 * Find ATH from TVL history format
 */
export function findAthFromTvlHistory(
  history: Array<{ date: number; totalLiquidityUSD: number }>
): { value: number; ts: number } | null {
  const series = history.map((p) => ({
    ts: p.date,
    value: p.totalLiquidityUSD,
  }))
  return findATH(series)
}

/**
 * Find ATH from chain TVL history format
 */
export function findAthFromChainHistory(
  history: Array<{ date: number; tvl: number }>
): { value: number; ts: number } | null {
  const series = history.map((p) => ({
    ts: p.date,
    value: p.tvl,
  }))
  return findATH(series)
}

/**
 * Format timestamp as month string (e.g., "Mar 2024")
 */
export function formatMonth(ts: number): string {
  const date = new Date(ts * 1000)
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * Format timestamp as YYYY-MM string
 */
export function formatYYYYMM(ts: number): string {
  const date = new Date(ts * 1000)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Check if ATH was in the current month
 */
export function isAthCurrentMonth(athTs: number): boolean {
  const now = new Date()
  const athDate = new Date(athTs * 1000)
  return (
    athDate.getUTCFullYear() === now.getUTCFullYear() &&
    athDate.getUTCMonth() === now.getUTCMonth()
  )
}

/**
 * Check if there was a new high in the last N days
 */
export function hasNewHighInDays(
  series: TimeSeriesPoint[],
  days: number
): boolean {
  if (series.length === 0) return false

  const now = series[series.length - 1]
  const cutoffTs = now.ts - days * SECONDS_PER_DAY

  // Find max before cutoff
  let maxBefore = -Infinity
  for (const point of series) {
    if (point.ts < cutoffTs && point.value > maxBefore) {
      maxBefore = point.value
    }
  }

  // Find max in recent period
  let maxRecent = -Infinity
  for (const point of series) {
    if (point.ts >= cutoffTs && point.value > maxRecent) {
      maxRecent = point.value
    }
  }

  return maxRecent > maxBefore
}

// =============================================================================
// Bucketing Helpers
// =============================================================================

/**
 * Get TVL band string for a TVL value
 */
export function getTvlBand(tvl: number): string {
  if (tvl >= 10_000_000_000) return "$10B+"
  if (tvl >= 5_000_000_000) return "$5B-$10B"
  if (tvl >= 1_000_000_000) return "$1B-$5B"
  if (tvl >= 500_000_000) return "$500M-$1B"
  if (tvl >= 100_000_000) return "$100M-$500M"
  if (tvl >= 50_000_000) return "$50M-$100M"
  return "<$50M"
}

/**
 * Get chain count bucket string
 */
export function getChainCountBucket(count: number): string {
  if (count === 1) return "single-chain"
  if (count <= 5) return "2-5 chains"
  if (count <= 10) return "6-10 chains"
  return "10+ chains"
}

/**
 * Get percentage change bucket string
 */
export function getChangeBucket(change: number): string {
  if (change > 0.1) return "up >10%"
  if (change > 0.01) return "up 1-10%"
  if (change >= -0.01) return "roughly flat"
  if (change >= -0.1) return "down 1-10%"
  return "down >10%"
}

/**
 * Get concentration bucket string for a share percentage
 */
export function getConcentrationBucket(share: number): string {
  if (share >= 0.75) return ">75%"
  if (share >= 0.5) return "50-75%"
  if (share >= 0.25) return "25-50%"
  return "<25%"
}

/**
 * Get TVL rank bucket string
 */
export function getTvlRankBucket(rank: number): string {
  if (rank <= 5) return "top 5"
  if (rank <= 10) return "top 10"
  if (rank <= 20) return "top 20"
  if (rank <= 50) return "top 50"
  return "top 100"
}
