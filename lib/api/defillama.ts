/**
 * DefiLlama API Client
 * 
 * Free endpoints only (no Pro API required)
 * Includes error handling, timeouts, and retry logic
 */

import type {
  ProtocolListEntry,
  ProtocolDetail,
  ChainListEntry,
  ChainTVLHistoryPoint,
  ProtocolFeesData,
  ChainFeesOverview,
  AllFeesOverview,
  AllDEXOverview,
  ChainDEXOverview,
  ProtocolDEXData,
} from "@/lib/types/defillama"

const BASE_URL = "https://api.llama.fi"
const DEFAULT_TIMEOUT_MS = 30000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

interface FetchOptions {
  timeout?: number
  retries?: number
}

class DefiLlamaError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string
  ) {
    super(message)
    this.name = "DefiLlamaError"
  }
}

/**
 * Fetch with timeout and retry logic
 */
async function fetchWithRetry<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, retries = MAX_RETRIES } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new DefiLlamaError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          url
        )
      }

      const data = await response.json()
      return data as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on 4xx errors (client errors)
      if (error instanceof DefiLlamaError && error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        throw error
      }

      // Wait before retrying
      if (attempt < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1))
        )
      }
    }
  }

  throw lastError || new Error("Unknown fetch error")
}

// =============================================================================
// TVL & Protocol Endpoints
// =============================================================================

/**
 * GET /api/protocols - List all protocols with current TVL
 */
export async function getProtocols(
  options?: FetchOptions
): Promise<ProtocolListEntry[]> {
  return fetchWithRetry<ProtocolListEntry[]>(
    `${BASE_URL}/protocols`,
    options
  )
}

/**
 * GET /api/protocol/{slug} - Detailed protocol data including historical TVL
 */
export async function getProtocol(
  slug: string,
  options?: FetchOptions
): Promise<ProtocolDetail> {
  return fetchWithRetry<ProtocolDetail>(
    `${BASE_URL}/protocol/${encodeURIComponent(slug)}`,
    options
  )
}

/**
 * GET /api/tvl/{protocol} - Simple current TVL number
 */
export async function getProtocolTVL(
  slug: string,
  options?: FetchOptions
): Promise<number> {
  return fetchWithRetry<number>(
    `${BASE_URL}/tvl/${encodeURIComponent(slug)}`,
    options
  )
}

// =============================================================================
// Chain Endpoints
// =============================================================================

/**
 * GET /api/v2/chains - Current TVL of all chains
 */
export async function getChains(
  options?: FetchOptions
): Promise<ChainListEntry[]> {
  return fetchWithRetry<ChainListEntry[]>(
    `${BASE_URL}/v2/chains`,
    options
  )
}

/**
 * GET /api/v2/historicalChainTvl/{chain} - Historical TVL for specific chain
 */
export async function getChainTVLHistory(
  chain: string,
  options?: FetchOptions
): Promise<ChainTVLHistoryPoint[]> {
  return fetchWithRetry<ChainTVLHistoryPoint[]>(
    `${BASE_URL}/v2/historicalChainTvl/${encodeURIComponent(chain)}`,
    options
  )
}

// =============================================================================
// Fees & Revenue Endpoints
// =============================================================================

/**
 * Data type for fees/revenue endpoints
 * - dailyFees: Protocol fees (default)
 * - dailyRevenue: Protocol revenue (portion of fees going to protocol)
 * - dailyHoldersRevenue: Revenue going to token holders
 */
export type FeesDataType = "dailyFees" | "dailyRevenue" | "dailyHoldersRevenue"

/**
 * GET /api/overview/fees - All protocols fees overview
 */
export async function getAllFees(
  options?: FetchOptions
): Promise<AllFeesOverview> {
  return fetchWithRetry<AllFeesOverview>(
    `${BASE_URL}/overview/fees`,
    options
  )
}

/**
 * GET /api/overview/fees/{chain} - Fees leaderboard by chain
 */
export async function getChainFees(
  chain: string,
  options?: FetchOptions
): Promise<ChainFeesOverview> {
  return fetchWithRetry<ChainFeesOverview>(
    `${BASE_URL}/overview/fees/${encodeURIComponent(chain)}`,
    options
  )
}

/**
 * GET /api/summary/fees/{protocol} - Protocol fees/revenue data
 * 
 * @param slug - Protocol slug
 * @param dataType - Type of data to fetch: "dailyFees" (default), "dailyRevenue", or "dailyHoldersRevenue"
 * @param options - Fetch options (timeout, retries)
 */
export async function getProtocolFees(
  slug: string,
  dataType?: FeesDataType,
  options?: FetchOptions
): Promise<ProtocolFeesData> {
  const url = dataType
    ? `${BASE_URL}/summary/fees/${encodeURIComponent(slug)}?dataType=${dataType}`
    : `${BASE_URL}/summary/fees/${encodeURIComponent(slug)}`
  return fetchWithRetry<ProtocolFeesData>(url, options)
}

// =============================================================================
// DEX Volume Endpoints
// =============================================================================

/**
 * GET /api/overview/dexs - All DEX volumes overview
 */
export async function getAllDEXVolume(
  options?: FetchOptions
): Promise<AllDEXOverview> {
  return fetchWithRetry<AllDEXOverview>(
    `${BASE_URL}/overview/dexs`,
    options
  )
}

/**
 * GET /api/overview/dexs/{chain} - DEX volume leaderboard by chain
 */
export async function getChainDEXVolume(
  chain: string,
  options?: FetchOptions
): Promise<ChainDEXOverview> {
  return fetchWithRetry<ChainDEXOverview>(
    `${BASE_URL}/overview/dexs/${encodeURIComponent(chain)}`,
    options
  )
}

/**
 * GET /api/summary/dexs/{protocol} - DEX volume time series
 */
export async function getProtocolDEXVolume(
  slug: string,
  options?: FetchOptions
): Promise<ProtocolDEXData> {
  return fetchWithRetry<ProtocolDEXData>(
    `${BASE_URL}/summary/dexs/${encodeURIComponent(slug)}`,
    options
  )
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a protocol has fees data by attempting to fetch it
 */
export async function checkProtocolHasFeesData(slug: string): Promise<boolean> {
  try {
    const data = await getProtocolFees(slug, undefined, { retries: 1 })
    return data.latestFetchIsOk === true && (data.total24h ?? 0) > 0
  } catch {
    return false
  }
}

/**
 * Check if a protocol has DEX volume data
 */
export async function checkProtocolHasVolumeData(slug: string): Promise<boolean> {
  try {
    const data = await getProtocolDEXVolume(slug, { retries: 1 })
    return (data.total24h ?? 0) > 0
  } catch {
    return false
  }
}

/**
 * Get the number of days of TVL history for a protocol
 */
export function getProtocolHistoryDays(protocol: ProtocolDetail): number {
  if (!protocol.tvl || protocol.tvl.length < 2) {
    return 0
  }
  const firstDate = protocol.tvl[0].date
  const lastDate = protocol.tvl[protocol.tvl.length - 1].date
  return Math.floor((lastDate - firstDate) / 86400)
}

/**
 * Get the number of days of TVL history for a chain
 */
export function getChainHistoryDays(history: ChainTVLHistoryPoint[]): number {
  if (history.length < 2) {
    return 0
  }
  const firstDate = history[0].date
  const lastDate = history[history.length - 1].date
  return Math.floor((lastDate - firstDate) / 86400)
}
