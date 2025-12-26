#!/usr/bin/env bun
/**
 * Episode Generation Script
 *
 * Generates an episode for a given date and saves it to storage.
 *
 * Usage:
 *   bun scripts/generate-episode.ts [date]
 *   bun scripts/generate-episode.ts 2025-12-14
 *   bun scripts/generate-episode.ts 2025-12-20:2025-12-26  (date range)
 *   bun scripts/generate-episode.ts --today
 *   bun scripts/generate-episode.ts --verbose
 *   bun scripts/generate-episode.ts --skip-llm
 *   bun scripts/generate-episode.ts --force (regenerate even if exists)
 *
 * Environment:
 *   OPENAI_API_KEY - Required for LLM generation
 *   SKIP_LLM - Set to 'true' to skip LLM calls
 *   LLM_TIMEOUT_MS - Timeout for LLM calls (default: 10000)
 *   LLM_MAX_RETRIES - Max retries for LLM calls (default: 2)
 */

import { generateEpisode } from "../lib/generation/generate-episode"
import { saveEpisode, episodeExists, getPublicEpisodePath } from "../lib/storage/episodes"
import { getCacheStats } from "../lib/llm/cache"
import { getLLMConfig } from "../lib/llm/client"

// =============================================================================
// CLI Arguments
// =============================================================================

interface CliOptions {
  dates: string[]
  verbose: boolean
  skipLLM: boolean
  skipCache: boolean
  force: boolean
  stripBuildLog: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {
    dates: [getTodayDate()],
    verbose: false,
    skipLLM: false,
    skipCache: false,
    force: false,
    stripBuildLog: false,
  }

  for (const arg of args) {
    if (arg === "--today") {
      options.dates = [getTodayDate()]
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true
    } else if (arg === "--skip-llm") {
      options.skipLLM = true
    } else if (arg === "--skip-cache") {
      options.skipCache = true
    } else if (arg === "--force" || arg === "-f") {
      options.force = true
    } else if (arg === "--strip-build-log") {
      options.stripBuildLog = true
    } else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (/^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(arg)) {
      // Date range: 2025-12-20:2025-12-26
      const [startDate, endDate] = arg.split(":")
      options.dates = getDateRange(startDate, endDate)
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      options.dates = [arg]
    } else {
      console.error(`Unknown argument: ${arg}`)
      printHelp()
      process.exit(1)
    }
  }

  return options
}

function getTodayDate(): string {
  const today = new Date()
  const year = today.getUTCFullYear()
  const month = String(today.getUTCMonth() + 1).padStart(2, "0")
  const day = String(today.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const start = new Date(startDate + "T00:00:00Z")
  const end = new Date(endDate + "T00:00:00Z")

  if (start > end) {
    console.error(`Invalid date range: ${startDate} is after ${endDate}`)
    process.exit(1)
  }

  const current = new Date(start)
  while (current <= end) {
    const year = current.getUTCFullYear()
    const month = String(current.getUTCMonth() + 1).padStart(2, "0")
    const day = String(current.getUTCDate()).padStart(2, "0")
    dates.push(`${year}-${month}-${day}`)
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

function printHelp(): void {
  console.log(`
DeFidle Episode Generator

Usage:
  bun scripts/generate-episode.ts [date] [options]
  bun scripts/generate-episode.ts [start:end] [options]

Arguments:
  date              Date in YYYY-MM-DD format (default: today)
  start:end         Date range in YYYY-MM-DD:YYYY-MM-DD format

Options:
  --today           Generate for today (default)
  --verbose, -v     Enable verbose logging
  --skip-llm        Skip LLM calls, use fallback explanations
  --skip-cache      Skip LLM cache, force regeneration
  --force, -f       Regenerate even if episode already exists
  --strip-build-log Remove build log from saved episode
  --help, -h        Show this help message

Environment Variables:
  OPENAI_API_KEY    OpenAI API key (required for LLM)
  SKIP_LLM          Set to 'true' to skip LLM globally
  LLM_TIMEOUT_MS    LLM call timeout in ms (default: 10000)
  LLM_MAX_RETRIES   Max LLM retry attempts (default: 2)

Examples:
  bun scripts/generate-episode.ts                          # Generate for today
  bun scripts/generate-episode.ts 2025-12-14              # Generate for specific date
  bun scripts/generate-episode.ts 2025-12-20:2025-12-26   # Generate date range
  bun scripts/generate-episode.ts --verbose               # With detailed logging
  bun scripts/generate-episode.ts --skip-llm              # Without LLM calls
  bun scripts/generate-episode.ts --force                 # Overwrite existing
`)
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// Main
// =============================================================================

async function generateForDate(
  date: string,
  options: CliOptions
): Promise<boolean> {
  console.log("=".repeat(60))
  console.log(`Generating episode for: ${date}`)
  console.log("=".repeat(60))
  console.log()

  // Check if episode already exists
  const exists = await episodeExists(date)
  if (exists && !options.force) {
    console.log(`Episode already exists for ${date}`)
    console.log(`Path: ${getPublicEpisodePath(date)}`)
    console.log()
    console.log("Use --force to regenerate")
    return true // Not an error, just skipped
  }

  if (exists && options.force) {
    console.log(`Episode exists, will overwrite (--force)`)
    console.log()
  }

  // Generate episode
  console.log("Starting episode generation...")
  console.log()

  const startTime = Date.now()

  try {
    const episode = await generateEpisode(date, {
      skipLLM: options.skipLLM,
      skipCache: options.skipCache,
      verbose: options.verbose,
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    if (!episode) {
      console.error("\nEpisode generation failed!")
      return false
    }

    // Save episode
    console.log("\nSaving episode...")
    const filePath = await saveEpisode(episode, options.stripBuildLog)
    console.log(`Saved to: ${filePath}`)

    // Show LLM cache stats
    if (options.verbose) {
      const cacheStats = await getCacheStats(date)
      console.log("\nLLM Cache Stats:")
      console.log(`  Entries for this month: ${cacheStats.entryCount}`)
      console.log(`  Cache file: ${cacheStats.filePath}`)
    }

    // Summary
    console.log()
    console.log(`Episode ID: ${episode.episodeId}`)
    console.log(`Topic: ${episode.topic.name}`)
    console.log(`Questions: ${episode.questions.length}`)

    const llmCount = episode.questions.filter((q) => !q.llmFallback).length
    const fallbackCount = episode.questions.length - llmCount
    console.log(`LLM explanations: ${llmCount}`)
    console.log(`Fallback explanations: ${fallbackCount}`)
    console.log(`Duration: ${duration}s`)
    console.log()
    console.log(`Public path: ${getPublicEpisodePath(date)}`)
    console.log()

    return true
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\nGeneration failed after ${duration}s:`, error)
    return false
  }
}

async function main(): Promise<void> {
  const options = parseArgs()

  console.log("=".repeat(60))
  console.log("DeFidle Episode Generator")
  console.log("=".repeat(60))
  console.log()
  console.log(`Dates: ${options.dates.length === 1 ? options.dates[0] : `${options.dates[0]} to ${options.dates[options.dates.length - 1]} (${options.dates.length} days)`}`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log()

  // Show LLM configuration
  if (options.verbose) {
    const llmConfig = getLLMConfig()
    console.log("LLM Configuration:")
    console.log(`  Model: ${llmConfig.model}`)
    console.log(`  Timeout: ${llmConfig.timeoutMs}ms`)
    console.log(`  Max retries: ${llmConfig.maxRetries}`)
    console.log(`  Skip LLM: ${llmConfig.skipLLM || options.skipLLM}`)
    console.log(`  Has API key: ${llmConfig.hasApiKey}`)
    console.log()
  }

  const results: { date: string; success: boolean }[] = []

  for (let i = 0; i < options.dates.length; i++) {
    const date = options.dates[i]
    const success = await generateForDate(date, options)
    results.push({ date, success })

    // Add delay between dates to avoid rate limits (except for last date)
    if (i < options.dates.length - 1) {
      console.log("Waiting 2 seconds before next date...")
      console.log()
      await sleep(2000)
    }
  }

  // Final summary for multiple dates
  if (options.dates.length > 1) {
    console.log("=".repeat(60))
    console.log("Batch Generation Complete!")
    console.log("=".repeat(60))
    console.log()

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    console.log(`Total: ${results.length} dates`)
    console.log(`Success: ${successCount}`)
    console.log(`Failed: ${failCount}`)

    if (failCount > 0) {
      console.log()
      console.log("Failed dates:")
      results
        .filter((r) => !r.success)
        .forEach((r) => console.log(`  - ${r.date}`))
    }

    console.log()

    if (failCount > 0) {
      process.exit(1)
    }
  } else {
    // Single date - exit with error if failed
    if (!results[0].success) {
      process.exit(1)
    }

    console.log("=".repeat(60))
    console.log("Generation Complete!")
    console.log("=".repeat(60))
    console.log()
  }
}

main()
