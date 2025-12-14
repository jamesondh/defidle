#!/usr/bin/env bun
/**
 * Test Topic Selection
 * 
 * Validates that topic selection is deterministic and working correctly.
 * 
 * Usage: bun run scripts/test-topic-selection.ts
 */

import {
  getEpisodeType,
  selectTopic,
  getTopicForDate,
  isProtocolTopic,
  isChainTopic,
} from "@/lib/generation/topic-selection"
import {
  seedFromParts,
  createRng,
  deterministicShuffle,
} from "@/lib/generation/rng"

async function main() {
  console.log("=== DeFidle Topic Selection Test ===\n")

  // Test 1: RNG Determinism
  console.log("Test 1: RNG Determinism")
  const seed1 = seedFromParts("2025-12-14", "protocol")
  const seed2 = seedFromParts("2025-12-14", "protocol")
  console.log(`  Seed consistency: ${seed1 === seed2 ? "PASS" : "FAIL"}`)

  const rng1 = createRng(seed1)
  const rng2 = createRng(seed2)
  const values1 = [rng1(), rng1(), rng1()]
  const values2 = [rng2(), rng2(), rng2()]
  const rngConsistent =
    values1[0] === values2[0] &&
    values1[1] === values2[1] &&
    values1[2] === values2[2]
  console.log(`  RNG consistency: ${rngConsistent ? "PASS" : "FAIL"}`)

  // Test 2: Shuffle Determinism
  console.log("\nTest 2: Shuffle Determinism")
  const items = ["A", "B", "C", "D", "E"]
  const shuffled1 = deterministicShuffle(items, "test-seed")
  const shuffled2 = deterministicShuffle(items, "test-seed")
  const shuffleConsistent = JSON.stringify(shuffled1) === JSON.stringify(shuffled2)
  console.log(`  Shuffle consistency: ${shuffleConsistent ? "PASS" : "FAIL"}`)
  console.log(`  Shuffled result: ${shuffled1.join(", ")}`)

  // Test 3: Episode Type Mapping
  console.log("\nTest 3: Episode Type Mapping")
  const testDates = [
    { date: "2025-12-14", expected: "protocol" }, // Sunday
    { date: "2025-12-15", expected: "protocol" }, // Monday
    { date: "2025-12-16", expected: "chain" }, // Tuesday
    { date: "2025-12-17", expected: "protocol" }, // Wednesday
    { date: "2025-12-18", expected: "chain" }, // Thursday
    { date: "2025-12-19", expected: "protocol" }, // Friday
    { date: "2025-12-20", expected: "chain" }, // Saturday
  ]

  for (const { date, expected } of testDates) {
    const actual = getEpisodeType(date)
    const dayName = new Date(date).toLocaleDateString("en-US", {
      weekday: "long",
    })
    const passed = actual === expected
    console.log(
      `  ${date} (${dayName}): ${actual} - ${passed ? "PASS" : "FAIL"}`
    )
  }

  // Test 4: Topic Selection
  console.log("\nTest 4: Topic Selection (may take a moment...)")
  try {
    // Test today's topic
    const today = "2025-12-14"
    const topic1 = await getTopicForDate(today)
    const topic2 = await getTopicForDate(today)

    console.log(`  Today (${today}): ${topic1.name}`)
    console.log(
      `  Type: ${isProtocolTopic(topic1) ? "Protocol" : "Chain"}`
    )
    console.log(`  Determinism: ${topic1.slug === topic2.slug ? "PASS" : "FAIL"}`)

    // Test a few more dates
    console.log("\n  Upcoming week topics:")
    for (const { date } of testDates) {
      const topic = await getTopicForDate(date)
      const type = getEpisodeType(date)
      const dayName = new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
      })
      console.log(`    ${dayName} ${date}: ${topic.name} (${type})`)
    }
  } catch (error) {
    console.log(`  Error: ${error}`)
    console.log("  (Make sure pool files exist - run bun run refresh-pools first)")
  }

  console.log("\n=== Test Complete ===")
}

main().catch(console.error)
