/**
 * Episode Storage
 *
 * Handles saving and loading episode JSON files.
 * Episodes are stored at: /public/episodes/{YYYY-MM}/{DD}.json
 */

import * as fs from "fs/promises"
import * as path from "path"
import type { Episode } from "@/lib/types/episode"

// =============================================================================
// Configuration
// =============================================================================

const EPISODES_DIR = path.join(process.cwd(), "public", "episodes")

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Get the directory path for a given date
 */
function getEpisodeDirPath(date: string): string {
  const [year, month] = date.split("-")
  return path.join(EPISODES_DIR, `${year}-${month}`)
}

/**
 * Get the file path for a given date
 */
function getEpisodeFilePath(date: string): string {
  const [year, month, day] = date.split("-")
  return path.join(EPISODES_DIR, `${year}-${month}`, `${day}.json`)
}

/**
 * Parse a file path to extract the date
 */
export function parseEpisodePath(filePath: string): string | null {
  // Match pattern like /public/episodes/2025-12/14.json
  const match = filePath.match(/(\d{4}-\d{2})\/(\d{2})\.json$/)
  if (!match) return null
  return `${match[1]}-${match[2]}`
}

// =============================================================================
// Save Operations
// =============================================================================

/**
 * Save an episode to the filesystem
 *
 * @param episode - The episode to save
 * @param stripBuildLog - Whether to remove the buildLog from saved file
 * @returns Path where the episode was saved
 */
export async function saveEpisode(
  episode: Episode,
  stripBuildLog: boolean = false
): Promise<string> {
  const dirPath = getEpisodeDirPath(episode.dateUtc)
  const filePath = getEpisodeFilePath(episode.dateUtc)

  // Ensure directory exists
  await fs.mkdir(dirPath, { recursive: true })

  // Prepare episode for saving
  let episodeToSave: Episode = episode
  if (stripBuildLog) {
    // Create a copy without buildLog
    const { buildLog: _, ...rest } = episode
    episodeToSave = rest as Episode
  }

  // Write file with pretty formatting
  await fs.writeFile(filePath, JSON.stringify(episodeToSave, null, 2), "utf-8")

  return filePath
}

/**
 * Check if an episode exists for a given date
 */
export async function episodeExists(date: string): Promise<boolean> {
  const filePath = getEpisodeFilePath(date)
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Load Operations
// =============================================================================

/**
 * Load an episode for a given date
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Episode or null if not found
 */
export async function loadEpisode(date: string): Promise<Episode | null> {
  const filePath = getEpisodeFilePath(date)

  try {
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content) as Episode
  } catch {
    return null
  }
}

/**
 * Load all episodes for a given month
 *
 * @param yearMonth - Year and month in YYYY-MM format
 * @returns Array of episodes
 */
export async function loadEpisodesForMonth(
  yearMonth: string
): Promise<Episode[]> {
  const dirPath = path.join(EPISODES_DIR, yearMonth)

  try {
    const files = await fs.readdir(dirPath)
    const episodes: Episode[] = []

    for (const file of files) {
      if (!file.endsWith(".json")) continue

      const filePath = path.join(dirPath, file)
      try {
        const content = await fs.readFile(filePath, "utf-8")
        const episode = JSON.parse(content) as Episode
        episodes.push(episode)
      } catch {
        // Skip invalid files
        console.warn(`Could not parse episode file: ${filePath}`)
      }
    }

    // Sort by date
    episodes.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))

    return episodes
  } catch {
    // Directory doesn't exist
    return []
  }
}

// =============================================================================
// List Operations
// =============================================================================

/**
 * List all available episode dates
 *
 * @returns Array of dates in YYYY-MM-DD format
 */
export async function listAllEpisodeDates(): Promise<string[]> {
  const dates: string[] = []

  try {
    // List all month directories
    const monthDirs = await fs.readdir(EPISODES_DIR)

    for (const monthDir of monthDirs) {
      if (!/^\d{4}-\d{2}$/.test(monthDir)) continue

      const monthPath = path.join(EPISODES_DIR, monthDir)
      const stat = await fs.stat(monthPath)
      if (!stat.isDirectory()) continue

      // List files in month directory
      const files = await fs.readdir(monthPath)
      for (const file of files) {
        if (!/^\d{2}\.json$/.test(file)) continue
        const day = file.replace(".json", "")
        dates.push(`${monthDir}-${day}`)
      }
    }

    // Sort chronologically
    dates.sort()

    return dates
  } catch {
    // Episodes directory doesn't exist
    return []
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  totalEpisodes: number
  monthsWithData: string[]
  totalSizeBytes: number
}> {
  const dates = await listAllEpisodeDates()
  const months = new Set<string>()

  let totalSize = 0

  for (const date of dates) {
    const [year, month] = date.split("-")
    months.add(`${year}-${month}`)

    const filePath = getEpisodeFilePath(date)
    try {
      const stat = await fs.stat(filePath)
      totalSize += stat.size
    } catch {
      // File might have been deleted
    }
  }

  return {
    totalEpisodes: dates.length,
    monthsWithData: Array.from(months).sort(),
    totalSizeBytes: totalSize,
  }
}

// =============================================================================
// Delete Operations (for maintenance)
// =============================================================================

/**
 * Delete an episode (for testing or maintenance)
 */
export async function deleteEpisode(date: string): Promise<boolean> {
  const filePath = getEpisodeFilePath(date)

  try {
    await fs.unlink(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Get the public URL path for an episode
 */
export function getPublicEpisodePath(date: string): string {
  const [year, month, day] = date.split("-")
  return `/episodes/${year}-${month}/${day}.json`
}
