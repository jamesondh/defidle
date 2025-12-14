#!/usr/bin/env bun
/**
 * Episode Generation Script
 *
 * Generates an episode for a given date and saves it to storage.
 *
 * Usage:
 *   bun scripts/generate-episode.ts [date]
 *   bun scripts/generate-episode.ts 2025-12-14
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
  date: string
  verbose: boolean
  skipLLM: boolean
  skipCache: boolean
  force: boolean
  stripBuildLog: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {
    date: getTodayDate(),
    verbose: false,
    skipLLM: false,
    skipCache: false,
    force: false,
    stripBuildLog: false,
  }

  for (const arg of args) {
    if (arg === "--today") {
      options.date = getTodayDate()
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
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
      options.date = arg
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

function printHelp(): void {
  console.log(`
DeFidle Episode Generator

Usage:
  bun scripts/generate-episode.ts [date] [options]

Arguments:
  date              Date in YYYY-MM-DD format (default: today)

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
  bun scripts/generate-episode.ts                    # Generate for today
  bun scripts/generate-episode.ts 2025-12-14        # Generate for specific date
  bun scripts/generate-episode.ts --verbose         # With detailed logging
  bun scripts/generate-episode.ts --skip-llm        # Without LLM calls
  bun scripts/generate-episode.ts --force           # Overwrite existing
`)
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const options = parseArgs()

  console.log("=".repeat(60))
  console.log("DeFidle Episode Generator")
  console.log("=".repeat(60))
  console.log()
  console.log(`Date: ${options.date}`)
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

  // Check if episode already exists
  const exists = await episodeExists(options.date)
  if (exists && !options.force) {
    console.log(`Episode already exists for ${options.date}`)
    console.log(`Path: ${getPublicEpisodePath(options.date)}`)
    console.log()
    console.log("Use --force to regenerate")
    process.exit(0)
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
    const episode = await generateEpisode(options.date, {
      skipLLM: options.skipLLM,
      skipCache: options.skipCache,
      verbose: options.verbose,
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    if (!episode) {
      console.error("\nEpisode generation failed!")
      process.exit(1)
    }

    // Save episode
    console.log("\nSaving episode...")
    const filePath = await saveEpisode(episode, options.stripBuildLog)
    console.log(`Saved to: ${filePath}`)

    // Show LLM cache stats
    if (options.verbose) {
      const cacheStats = await getCacheStats(options.date)
      console.log("\nLLM Cache Stats:")
      console.log(`  Entries for this month: ${cacheStats.entryCount}`)
      console.log(`  Cache file: ${cacheStats.filePath}`)
    }

    // Summary
    console.log()
    console.log("=".repeat(60))
    console.log("Generation Complete!")
    console.log("=".repeat(60))
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
    console.log(`Public path: ${getPublicEpisodePath(options.date)}`)
    console.log()

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\nGeneration failed after ${duration}s:`, error)
    process.exit(1)
  }
}

main()
