/**
 * Test script for episode generation
 *
 * Run with: bun scripts/test-episode-generation.ts
 */

import { generateEpisode } from "../lib/generation/generate-episode"
import { getEpisodeType } from "../lib/generation/schedule"

async function main() {
  console.log("=== Episode Generation Test ===\n")

  // Test dates covering different episode types
  const testDates = [
    "2025-12-14", // Sunday - protocol
    "2025-12-15", // Monday - protocol
    "2025-12-16", // Tuesday - chain
    "2025-12-17", // Wednesday - protocol
    "2025-12-18", // Thursday - chain
    "2025-12-19", // Friday - protocol
    "2025-12-20", // Saturday - chain
  ]

  // Show schedule
  console.log("Episode Schedule:")
  for (const date of testDates) {
    const d = new Date(date + "T00:00:00Z")
    const day = d.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    })
    const type = getEpisodeType(date)
    console.log(`  ${date} (${day}): ${type}`)
  }
  console.log()

  // Generate episode for today (or first test date)
  const targetDate = process.argv[2] || testDates[0]
  console.log(`\nGenerating episode for: ${targetDate}\n`)

  try {
    const episode = await generateEpisode(targetDate)

    if (!episode) {
      console.error("Failed to generate episode")
      process.exit(1)
    }

    console.log("\n=== Generated Episode ===\n")
    console.log(`Episode ID: ${episode.episodeId}`)
    console.log(`Date: ${episode.dateUtc}`)
    console.log(`Type: ${episode.episodeType}`)
    console.log(`Topic: ${episode.topic.name} (${episode.topic.slug})`)
    console.log(`Generated at: ${episode.generatedAt}`)
    console.log(`\nQuestions (${episode.questions.length}):`)

    for (const q of episode.questions) {
      console.log(`\n--- Question ${q.qid} (Slot ${q.slot}) ---`)
      console.log(`Template: ${q.templateId}`)
      console.log(`Format: ${q.format}`)
      console.log(`Difficulty: ${q.difficulty} (score: ${q.difficultyScore?.toFixed(2)})`)
      console.log(`Prompt: ${q.prompt}`)

      if (q.clues && q.clues.length > 0) {
        console.log(`Clues:`)
        for (const clue of q.clues) {
          console.log(`  - ${clue}`)
        }
      }

      if (q.choices && q.choices.length > 0) {
        console.log(`Choices:`)
        for (let i = 0; i < q.choices.length; i++) {
          const marker = i === q.answerIndex ? "* " : "  "
          console.log(`  ${marker}${i + 1}. ${q.choices[i]}`)
        }
      }

      if (q.answerValue !== undefined) {
        console.log(`Answer: ${q.answerValue ? "True" : "False"}`)
      }

      console.log(`Explanation: ${q.explanation}`)
    }

    // Build log summary
    if (episode.buildLog && episode.buildLog.length > 0) {
      console.log(`\n=== Build Log Summary ===`)
      const decisions: Record<string, number> = {}
      for (const entry of episode.buildLog) {
        decisions[entry.decision] = (decisions[entry.decision] || 0) + 1
      }
      for (const [decision, count] of Object.entries(decisions)) {
        console.log(`  ${decision}: ${count}`)
      }
    }

    // Save episode to file for inspection
    const outputPath = `./test-episode-${targetDate}.json`
    const fs = await import("fs/promises")
    await fs.writeFile(outputPath, JSON.stringify(episode, null, 2))
    console.log(`\nSaved episode to: ${outputPath}`)

    console.log("\n=== Test Passed ===")
  } catch (error) {
    console.error("\nTest failed with error:", error)
    process.exit(1)
  }
}

main()
