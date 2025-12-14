/**
 * DefiLlama API Response Types
 * 
 * Based on free endpoints only (no Pro API required)
 * See docs/defillama-api.md for full reference
 */

// =============================================================================
// TVL & Protocol Data
// =============================================================================

/**
 * Protocol entry from GET /api/protocols
 */
export interface ProtocolListEntry {
  id: string
  name: string
  symbol?: string
  slug: string
  category: string
  chains: string[]
  tvl: number
  chainTvls: Record<string, number>
  change_1h?: number
  change_1d?: number
  change_7d?: number
  mcap?: number
  logo?: string
  url?: string
}

/**
 * Historical TVL data point
 */
export interface TVLDataPoint {
  date: number // Unix timestamp
  totalLiquidityUSD: number
}

/**
 * Chain TVL data within protocol detail
 */
export interface ChainTVLData {
  tvl: TVLDataPoint[]
}

/**
 * Protocol detail from GET /api/protocol/{slug}
 */
export interface ProtocolDetail {
  id: string
  name: string
  symbol?: string
  slug: string
  category: string
  chains: string[]
  description?: string
  logo?: string
  url?: string
  twitter?: string
  chainTvls: Record<string, ChainTVLData>
  tvl: TVLDataPoint[]
  currentChainTvls: Record<string, number>
  mcap?: number
  raises?: Array<{
    date: string
    amount: number
  }>
}

// =============================================================================
// Chain Data
// =============================================================================

/**
 * Chain entry from GET /api/v2/chains
 */
export interface ChainListEntry {
  gecko_id?: string
  tvl: number
  tokenSymbol?: string
  cmcId?: string
  name: string
  chainId?: number
}

/**
 * Historical chain TVL data point from GET /api/v2/historicalChainTvl/{chain}
 */
export interface ChainTVLHistoryPoint {
  date: number // Unix timestamp
  tvl: number
}

// =============================================================================
// Fees & Revenue Data
// =============================================================================

/**
 * Protocol fees data from GET /api/summary/fees/{protocol}
 */
export interface ProtocolFeesData {
  id: string
  name: string
  displayName: string
  slug: string
  chains: string[]
  total24h?: number
  total48hto24h?: number
  total7d?: number
  totalAllTime?: number
  change_1d?: number
  totalDataChart?: Array<[number, number]> // [timestamp, value]
  totalDataChartBreakdown?: Array<[number, Record<string, Record<string, number>>]>
  latestFetchIsOk?: boolean
}

/**
 * Chain fees overview from GET /api/overview/fees/{chain}
 */
export interface ChainFeesOverview {
  totalFees24h?: number
  totalRevenue24h?: number
  change_1d?: number
  protocols: Array<{
    name: string
    displayName?: string
    slug: string
    fees24h?: number
    revenue24h?: number
    chains: string[]
  }>
}

/**
 * All protocols fees overview from GET /api/overview/fees
 */
export interface AllFeesOverview {
  totalFees24h?: number
  totalRevenue24h?: number
  change_1d?: number
  protocols: Array<{
    name: string
    displayName?: string
    slug: string
    defillamaId?: string
    total24h?: number
    total7d?: number
    change_1d?: number
    chains: string[]
  }>
}

// =============================================================================
// DEX Volume Data
// =============================================================================

/**
 * DEX volume overview from GET /api/overview/dexs
 */
export interface AllDEXOverview {
  totalVolume?: number
  change_1d?: number
  change_7d?: number
  change_30d?: number
  protocols: Array<{
    name: string
    displayName?: string
    slug: string
    defillamaId?: string
    total24h?: number
    total7d?: number
    change_1d?: number
    chains: string[]
  }>
}

/**
 * Chain DEX volume overview from GET /api/overview/dexs/{chain}
 */
export interface ChainDEXOverview {
  totalVolume?: number
  change_1d?: number
  protocols: Array<{
    name: string
    displayName?: string
    slug: string
    total24h?: number
    total7d?: number
    change_1d?: number
    chains: string[]
  }>
}

/**
 * Protocol DEX volume from GET /api/summary/dexs/{protocol}
 */
export interface ProtocolDEXData {
  id: string
  name: string
  displayName: string
  slug: string
  total24h?: number
  total7d?: number
  total30d?: number
  totalAllTime?: number
  change_1d?: number
  change_7d?: number
  chains: string[]
  chainBreakdown?: Record<string, { total24h?: number }>
  totalDataChart?: Array<[number, number]> // [timestamp, volume]
}
