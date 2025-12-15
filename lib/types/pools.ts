/**
 * Topic Pool Entry Types
 * 
 * These schemas define the structure of protocol and chain pools
 * stored in /data/pools/*.json
 */

/**
 * Protocol pool entry - represents a protocol eligible for quiz topics
 */
export interface ProtocolPoolEntry {
  slug: string
  name: string
  category: string
  tvlRank: number
  tvl: number
  chains: string[]
  hasFeesData: boolean
  hasRevenueData: boolean
  hasVolumeData: boolean
  historyDays: number
  lastUpdated: string // ISO date string
}

/**
 * Chain pool entry - represents a chain eligible for quiz topics
 */
export interface ChainPoolEntry {
  slug: string // Chain name used in API (e.g., "Ethereum")
  name: string // Display name
  tvlRank: number
  tvl: number
  protocolCount: number
  tokenSymbol?: string
  historyDays: number
  /** 30-day TVL change as a decimal (e.g., 0.15 = +15%, -0.10 = -10%) */
  change30d?: number
  lastUpdated: string // ISO date string
}

/**
 * Overrides configuration for topic pools
 */
export interface PoolOverrides {
  protocols: {
    blocklist: string[]
    forceInclude: string[]
  }
  chains: {
    blocklist: string[]
    forceInclude: string[]
  }
}

/**
 * Pool file structure
 */
export interface ProtocolPool {
  protocols: ProtocolPoolEntry[]
  generatedAt: string // ISO timestamp
}

export interface ChainPool {
  chains: ChainPoolEntry[]
  generatedAt: string // ISO timestamp
}
