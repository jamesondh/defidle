/**
 * Client-side Episode Fetching
 *
 * Fetches episode JSON files from static storage.
 * Episodes are served from: /episodes/{YYYY-MM}/{DD}.json
 */

import type { Episode } from "@/lib/types/episode"

// =============================================================================
// Date Utilities
// =============================================================================

/**
 * Get the current UTC date components
 */
export function getUtcDateComponents(): {
  year: number
  month: string
  day: string
} {
  const now = new Date()
  return {
    year: now.getUTCFullYear(),
    month: String(now.getUTCMonth() + 1).padStart(2, "0"),
    day: String(now.getUTCDate()).padStart(2, "0"),
  }
}

/**
 * Get today's date string in YYYY-MM-DD format (UTC)
 */
export function getTodayDateUtc(): string {
  const { year, month, day } = getUtcDateComponents()
  return `${year}-${month}-${day}`
}

/**
 * Parse a date string into its components
 */
export function parseDateString(date: string): {
  yearMonth: string
  day: string
} | null {
  const match = date.match(/^(\d{4}-\d{2})-(\d{2})$/)
  if (!match) return null
  return {
    yearMonth: match[1],
    day: match[2],
  }
}

/**
 * Build the public path for an episode
 */
export function getEpisodePath(date: string): string {
  const parsed = parseDateString(date)
  if (!parsed) {
    // Fallback: assume it's already a valid path format
    const { year, month, day } = getUtcDateComponents()
    return `/episodes/${year}-${month}/${day}.json`
  }
  return `/episodes/${parsed.yearMonth}/${parsed.day}.json`
}

// =============================================================================
// Fetch Types
// =============================================================================

export interface FetchEpisodeResult {
  success: true
  episode: Episode
}

export interface FetchEpisodeError {
  success: false
  error: EpisodeError
}

export type EpisodeError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "NETWORK_ERROR"; message: string }
  | { code: "PARSE_ERROR"; message: string }

export type FetchEpisodeResponse = FetchEpisodeResult | FetchEpisodeError

// =============================================================================
// Episode Fetching
// =============================================================================

/**
 * Fetch an episode for a specific date
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Episode data or error
 */
export async function fetchEpisode(date: string): Promise<FetchEpisodeResponse> {
  const path = getEpisodePath(date)

  try {
    const response = await fetch(path)

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: `No episode found for ${date}`,
          },
        }
      }

      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: `Failed to fetch episode: ${response.status} ${response.statusText}`,
        },
      }
    }

    const data = await response.json()

    // Basic validation
    if (!data.episodeId || !data.questions || !Array.isArray(data.questions)) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: "Invalid episode format",
        },
      }
    }

    return {
      success: true,
      episode: data as Episode,
    }
  } catch (error) {
    // Network or parsing error
    const message =
      error instanceof Error ? error.message : "Unknown error occurred"

    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message,
      },
    }
  }
}

/**
 * Fetch today's episode
 *
 * @returns Episode data or error
 */
export async function fetchTodayEpisode(): Promise<FetchEpisodeResponse> {
  const today = getTodayDateUtc()
  return fetchEpisode(today)
}

/**
 * Check if an episode exists for a given date (without downloading full content)
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Whether the episode exists
 */
export async function checkEpisodeExists(date: string): Promise<boolean> {
  const path = getEpisodePath(date)

  try {
    const response = await fetch(path, { method: "HEAD" })
    return response.ok
  } catch {
    return false
  }
}

// =============================================================================
// Episode Navigation
// =============================================================================

/**
 * Get adjacent dates for navigation
 *
 * @param currentDate - Current date in YYYY-MM-DD format
 * @returns Previous and next dates
 */
export function getAdjacentDates(currentDate: string): {
  previous: string
  next: string
} {
  const date = new Date(currentDate + "T00:00:00Z")

  const previousDate = new Date(date)
  previousDate.setUTCDate(previousDate.getUTCDate() - 1)

  const nextDate = new Date(date)
  nextDate.setUTCDate(nextDate.getUTCDate() + 1)

  const formatDate = (d: Date): string => {
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  return {
    previous: formatDate(previousDate),
    next: formatDate(nextDate),
  }
}

/**
 * Check if a date is today
 *
 * @param date - Date in YYYY-MM-DD format
 */
export function isToday(date: string): boolean {
  return date === getTodayDateUtc()
}

/**
 * Check if a date is in the future
 *
 * @param date - Date in YYYY-MM-DD format
 */
export function isFutureDate(date: string): boolean {
  const today = getTodayDateUtc()
  return date > today
}
