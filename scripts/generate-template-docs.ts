#!/usr/bin/env bun
/**
 * Generate Template Documentation
 *
 * Auto-generates docs/question-templates.md from the declarative template configs.
 * This ensures documentation stays in sync with the actual implementation.
 *
 * Usage:
 *   bun run scripts/generate-template-docs.ts
 */

import { writeFile } from "fs/promises"
import { PROTOCOL_TEMPLATE_CONFIGS } from "../lib/generation/templates/protocols"
import { CHAIN_TEMPLATE_CONFIGS } from "../lib/generation/templates/chains"
import {
  PROTOCOL_MATRIX,
  CHAIN_MATRIX,
  PROTOCOL_FALLBACKS,
  CHAIN_FALLBACKS,
} from "../lib/generation/templates/index"
import type { FallbackConfig } from "../lib/generation/templates/config"

// =============================================================================
// Helper Functions
// =============================================================================

function formatSemanticTopics(topics: string[]): string {
  if (topics.length === 0) return "None"
  return topics.map((t) => `\`${t}\``).join(", ")
}

function getSlotAssignments(
  templateId: string,
  matrix: Record<string, unknown[]>
): string[] {
  const slots: string[] = []
  for (const [slot, templates] of Object.entries(matrix)) {
    if ((templates as { id: string }[]).some((t) => t.id === templateId)) {
      slots.push(slot)
    }
  }
  return slots
}

function formatFallbackFormat(format: string): string {
  switch (format) {
    case "tf":
      return "True/False"
    case "ab":
      return "A/B Choice"
    default:
      return format
  }
}

function formatFallbackDifficulty(difficulty: string): string {
  switch (difficulty) {
    case "easy":
      return "Easy"
    case "medium":
      return "Medium"
    default:
      return difficulty
  }
}

// =============================================================================
// Fallback Categories
// =============================================================================

interface FallbackCategory {
  name: string
  description: string
  fallbacks: FallbackConfig[]
}

function categorizeFallbacks(fallbacks: FallbackConfig[]): FallbackCategory[] {
  const categories: FallbackCategory[] = []

  // TVL Threshold
  const tvlThreshold = fallbacks.filter((f) => f.id.includes("tvl_above"))
  if (tvlThreshold.length > 0) {
    categories.push({
      name: "TVL Threshold",
      description: "Questions about whether TVL exceeds certain thresholds",
      fallbacks: tvlThreshold,
    })
  }

  // Trend Direction
  const trendDirection = fallbacks.filter(
    (f) => f.id.includes("increased") || f.id.includes("decreased")
  )
  if (trendDirection.length > 0) {
    categories.push({
      name: "Trend Direction",
      description: "Questions about TVL movement over time periods",
      fallbacks: trendDirection,
    })
  }

  // Trend Threshold
  const trendThreshold = fallbacks.filter(
    (f) => f.id.includes("_up_") || f.id.includes("_down_")
  )
  if (trendThreshold.length > 0) {
    categories.push({
      name: "Trend Threshold",
      description: "Questions about whether TVL changed by more than a threshold",
      fallbacks: trendThreshold,
    })
  }

  // Rank
  const rank = fallbacks.filter((f) => f.id.includes("rank_top"))
  if (rank.length > 0) {
    categories.push({
      name: "Rank Position",
      description: "Questions about ranking position by TVL",
      fallbacks: rank,
    })
  }

  // Chain Count
  const chainCount = fallbacks.filter((f) => f.id.includes("chains_above"))
  if (chainCount.length > 0) {
    categories.push({
      name: "Chain Count",
      description: "Questions about multi-chain deployment",
      fallbacks: chainCount,
    })
  }

  // A/B Comparisons
  const comparisons = fallbacks.filter((f) => f.id.includes("compare"))
  if (comparisons.length > 0) {
    categories.push({
      name: "A/B Comparisons",
      description: "Questions comparing TVL between two entities",
      fallbacks: comparisons,
    })
  }

  return categories
}

// =============================================================================
// Documentation Generation
// =============================================================================

async function generateDocs() {
  const lines: string[] = []

  // Header
  lines.push("# Question Templates")
  lines.push("")
  lines.push("> **Auto-generated from template configs.** Do not edit manually.")
  lines.push("> Run `bun run scripts/generate-template-docs.ts` to regenerate.")
  lines.push("")
  lines.push(
    "This document defines the question templates used in DeFidle: " +
      `${Object.keys(PROTOCOL_TEMPLATE_CONFIGS).length} protocol templates (P1-P15), ` +
      `${Object.keys(CHAIN_TEMPLATE_CONFIGS).length} chain templates (C1-C12), and ` +
      `${PROTOCOL_FALLBACKS.length + CHAIN_FALLBACKS.length} fallback templates.`
  )
  lines.push("")
  lines.push("> **Note**: All templates use **free DefiLlama API endpoints only**. No Pro API key required.")
  lines.push("")

  // Table of Contents
  lines.push("## Table of Contents")
  lines.push("")
  lines.push("- [Conventions](#conventions)")
  lines.push("- [Protocol Templates (P1-P15)](#protocol-templates-p1-p15)")
  lines.push("- [Chain Templates (C1-C12)](#chain-templates-c1-c12)")
  lines.push("- [Protocol Fallbacks](#protocol-fallbacks)")
  lines.push("- [Chain Fallbacks](#chain-fallbacks)")
  lines.push("- [Template Summary](#template-summary)")
  lines.push("- [Semantic Topic Reference](#semantic-topic-reference)")
  lines.push("")

  // Conventions
  lines.push("## Conventions")
  lines.push("")
  lines.push("**Margin calculations:**")
  lines.push("- A/B margin: `abs(a - b) / max(a, b)`")
  lines.push("- Top-2 margin: `(v1 - v2) / v1`")
  lines.push("")
  lines.push("**Format degradation order:**")
  lines.push("```")
  lines.push("mc6 -> mc4 -> ab -> tf")
  lines.push("```")
  lines.push("")
  lines.push("**Fallback selection:**")
  lines.push("- Fallbacks are used when regular templates fail prerequisites or difficulty matching")
  lines.push("- For hard slots, A/B comparisons are preferred over T/F threshold questions")
  lines.push("- T/F questions with >25% margin are filtered out for hard slots")
  lines.push("")

  // Protocol Templates
  lines.push("---")
  lines.push("")
  lines.push("## Protocol Templates (P1-P15)")
  lines.push("")

  for (const config of Object.values(PROTOCOL_TEMPLATE_CONFIGS)) {
    const slots = getSlotAssignments(config.id, PROTOCOL_MATRIX)

    lines.push(`### ${config.id}: ${config.name}`)
    lines.push("")
    lines.push(config.description)
    lines.push("")
    lines.push("| Property | Value |")
    lines.push("|----------|-------|")
    lines.push(`| **ID** | \`${config.id}\` |`)
    lines.push(`| **Type** | ${config.type} |`)
    lines.push(`| **Semantic Topics** | ${formatSemanticTopics(config.semanticTopics)} |`)
    lines.push(`| **Slot Assignments** | ${slots.join(", ") || "None"} |`)
    lines.push(`| **Reusable** | ${config.allowReuse ? "Yes" : "No"} |`)
    lines.push("")
    lines.push("---")
    lines.push("")
  }

  // Chain Templates
  lines.push("## Chain Templates (C1-C12)")
  lines.push("")

  for (const config of Object.values(CHAIN_TEMPLATE_CONFIGS)) {
    const slots = getSlotAssignments(config.id, CHAIN_MATRIX)

    lines.push(`### ${config.id}: ${config.name}`)
    lines.push("")
    lines.push(config.description)
    lines.push("")
    lines.push("| Property | Value |")
    lines.push("|----------|-------|")
    lines.push(`| **ID** | \`${config.id}\` |`)
    lines.push(`| **Type** | ${config.type} |`)
    lines.push(`| **Semantic Topics** | ${formatSemanticTopics(config.semanticTopics)} |`)
    lines.push(`| **Slot Assignments** | ${slots.join(", ") || "None"} |`)
    lines.push(`| **Reusable** | ${config.allowReuse ? "Yes" : "No"} |`)
    lines.push("")
    lines.push("---")
    lines.push("")
  }

  // Protocol Fallbacks
  lines.push("## Protocol Fallbacks")
  lines.push("")
  lines.push(
    "Fallback questions provide substantive, data-driven questions when regular templates fail. " +
      "They use real data comparisons instead of trivial questions."
  )
  lines.push("")

  const protocolCategories = categorizeFallbacks(PROTOCOL_FALLBACKS)
  for (const category of protocolCategories) {
    lines.push(`### ${category.name}`)
    lines.push("")
    lines.push(category.description)
    lines.push("")
    lines.push("| ID | Format | Difficulty | Semantic Topics |")
    lines.push("|----|--------|------------|-----------------|")
    for (const fb of category.fallbacks) {
      lines.push(
        `| \`${fb.id}\` | ${formatFallbackFormat(fb.format)} | ${formatFallbackDifficulty(fb.difficulty)} | ${formatSemanticTopics(fb.semanticTopics)} |`
      )
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")

  // Chain Fallbacks
  lines.push("## Chain Fallbacks")
  lines.push("")

  const chainCategories = categorizeFallbacks(CHAIN_FALLBACKS)
  for (const category of chainCategories) {
    lines.push(`### ${category.name}`)
    lines.push("")
    lines.push(category.description)
    lines.push("")
    lines.push("| ID | Format | Difficulty | Semantic Topics |")
    lines.push("|----|--------|------------|-----------------|")
    for (const fb of category.fallbacks) {
      lines.push(
        `| \`${fb.id}\` | ${formatFallbackFormat(fb.format)} | ${formatFallbackDifficulty(fb.difficulty)} | ${formatSemanticTopics(fb.semanticTopics)} |`
      )
    }
    lines.push("")
  }

  lines.push("---")
  lines.push("")

  // Summary Tables
  lines.push("## Template Summary")
  lines.push("")
  lines.push("### Protocol Templates")
  lines.push("")
  lines.push("| ID | Name | Semantic Topics | Slots |")
  lines.push("|----|------|-----------------|-------|")

  for (const config of Object.values(PROTOCOL_TEMPLATE_CONFIGS)) {
    const slots = getSlotAssignments(config.id, PROTOCOL_MATRIX)
    lines.push(
      `| ${config.id} | ${config.name} | ${formatSemanticTopics(config.semanticTopics)} | ${slots.join(", ")} |`
    )
  }

  lines.push("")
  lines.push("### Chain Templates")
  lines.push("")
  lines.push("| ID | Name | Semantic Topics | Slots |")
  lines.push("|----|------|-----------------|-------|")

  for (const config of Object.values(CHAIN_TEMPLATE_CONFIGS)) {
    const slots = getSlotAssignments(config.id, CHAIN_MATRIX)
    lines.push(
      `| ${config.id} | ${config.name} | ${formatSemanticTopics(config.semanticTopics)} | ${slots.join(", ")} |`
    )
  }

  lines.push("")
  lines.push("### Fallback Summary")
  lines.push("")
  lines.push("| Type | Count | Formats | Difficulties |")
  lines.push("|------|-------|---------|--------------|")

  const protocolFormats = new Set(PROTOCOL_FALLBACKS.map((f) => f.format))
  const protocolDifficulties = new Set(PROTOCOL_FALLBACKS.map((f) => f.difficulty))
  const chainFormats = new Set(CHAIN_FALLBACKS.map((f) => f.format))
  const chainDifficulties = new Set(CHAIN_FALLBACKS.map((f) => f.difficulty))

  lines.push(
    `| Protocol | ${PROTOCOL_FALLBACKS.length} | ${[...protocolFormats].join(", ")} | ${[...protocolDifficulties].join(", ")} |`
  )
  lines.push(
    `| Chain | ${CHAIN_FALLBACKS.length} | ${[...chainFormats].join(", ")} | ${[...chainDifficulties].join(", ")} |`
  )

  lines.push("")

  // Semantic Topic Reference
  lines.push("## Semantic Topic Reference")
  lines.push("")
  lines.push(
    "Templates and fallbacks with overlapping semantic topics will not both be selected in the same episode. " +
      "This prevents semantically duplicate questions."
  )
  lines.push("")

  // Collect all semantic topics from templates and fallbacks
  const topicUsage = new Map<string, string[]>()

  for (const config of Object.values(PROTOCOL_TEMPLATE_CONFIGS)) {
    for (const topic of config.semanticTopics) {
      const existing = topicUsage.get(topic) ?? []
      existing.push(config.id)
      topicUsage.set(topic, existing)
    }
  }
  for (const config of Object.values(CHAIN_TEMPLATE_CONFIGS)) {
    for (const topic of config.semanticTopics) {
      const existing = topicUsage.get(topic) ?? []
      existing.push(config.id)
      topicUsage.set(topic, existing)
    }
  }

  // Add fallback topics
  for (const fb of [...PROTOCOL_FALLBACKS, ...CHAIN_FALLBACKS]) {
    for (const topic of fb.semanticTopics) {
      const existing = topicUsage.get(topic) ?? []
      const fallbackId = `FALLBACK_${fb.id.toUpperCase()}`
      if (!existing.includes(fallbackId)) {
        existing.push(fallbackId)
        topicUsage.set(topic, existing)
      }
    }
  }

  lines.push("| Semantic Topic | Templates/Fallbacks |")
  lines.push("|----------------|---------------------|")
  for (const [topic, templates] of topicUsage.entries()) {
    // Truncate if too many templates
    const display =
      templates.length > 8
        ? `${templates.slice(0, 6).join(", ")}, ... (${templates.length} total)`
        : templates.join(", ")
    lines.push(`| \`${topic}\` | ${display} |`)
  }

  lines.push("")

  // Write to file
  const content = lines.join("\n")
  await writeFile("docs/question-templates.md", content)

  console.log("Generated docs/question-templates.md")
  console.log(`  - ${Object.keys(PROTOCOL_TEMPLATE_CONFIGS).length} protocol templates`)
  console.log(`  - ${Object.keys(CHAIN_TEMPLATE_CONFIGS).length} chain templates`)
  console.log(`  - ${PROTOCOL_FALLBACKS.length} protocol fallbacks`)
  console.log(`  - ${CHAIN_FALLBACKS.length} chain fallbacks`)
  console.log(`  - ${topicUsage.size} semantic topics`)
}

// Run
generateDocs().catch((error) => {
  console.error("Error generating docs:", error)
  process.exit(1)
})
