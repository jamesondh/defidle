/**
 * Episode Type Scheduling
 *
 * Maps days of the week to episode types and provides utilities for
 * determining what type of episode to generate for a given date.
 */

import type { EpisodeType } from "@/lib/types/episode"

/**
 * Episode schedule by day of week (0 = Sunday)
 *
 * - 4 protocol episodes: Sunday, Monday, Wednesday, Friday
 * - 3 chain episodes: Tuesday, Thursday, Saturday
 */
const EPISODE_SCHEDULE: Record<number, EpisodeType> = {
  0: "protocol", // Sunday
  1: "protocol", // Monday
  2: "chain", // Tuesday
  3: "protocol", // Wednesday
  4: "chain", // Thursday
  5: "protocol", // Friday
  6: "chain", // Saturday
}

/**
 * Slot difficulty targets for episode structure
 */
export const SLOT_DIFFICULTY_TARGETS = {
  A: "medium", // Hook - identify the topic from clues
  B: "easy", // Confidence builder - high-margin comparison
  C: "medium", // Context - fees, revenue, or historical question
  D: "hard", // Skill test - tight margins or precise timing
  E: "easy", // Wrap-up - insight or trend question
} as const

/**
 * Get the episode type for a given date
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns Episode type ("protocol" or "chain")
 */
export function getEpisodeType(date: string): EpisodeType {
  const d = new Date(date + "T00:00:00Z")
  const dayOfWeek = d.getUTCDay()
  return EPISODE_SCHEDULE[dayOfWeek]
}

/**
 * Get the day name for a given date
 */
export function getDayName(date: string): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]
  const d = new Date(date + "T00:00:00Z")
  return days[d.getUTCDay()]
}

/**
 * Get all slots in order for an episode
 */
export function getSlots(): string[] {
  return ["A", "B", "C", "D", "E"]
}

/**
 * Get the difficulty target for a given slot
 */
export function getSlotDifficultyTarget(
  slot: string
): "easy" | "medium" | "hard" {
  return (
    SLOT_DIFFICULTY_TARGETS[slot as keyof typeof SLOT_DIFFICULTY_TARGETS] ??
    "medium"
  )
}

/**
 * Check if a date string is valid
 */
export function isValidDate(date: string): boolean {
  const d = new Date(date + "T00:00:00Z")
  return !isNaN(d.getTime())
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
export function getTodayDateString(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  const day = String(now.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Get the episode path for a given date
 * Returns the path relative to /public/episodes/
 */
export function getEpisodePath(date: string): string {
  const [year, month, day] = date.split("-")
  return `${year}-${month}/${day}.json`
}

/**
 * Get the full episode path for a given date
 */
export function getFullEpisodePath(date: string): string {
  return `./public/episodes/${getEpisodePath(date)}`
}
