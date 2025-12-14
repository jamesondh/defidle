/**
 * P8: Chain Membership
 *
 * Check if a protocol is deployed on a specific chain.
 */

import type { QuestionFormat, QuestionDraft, TemplateContext } from "@/lib/types/episode"
import { ProtocolTemplate } from "@/lib/types/template"
import { getRankBucket } from "../difficulty"
import { deterministicShuffle, createRng } from "../rng"

// Popular chains for distractors when protocol isn't on them
const POPULAR_CHAINS = [
  "Ethereum",
  "Arbitrum",
  "Polygon",
  "Optimism",
  "Base",
  "BSC",
  "Avalanche",
  "Solana",
  "Fantom",
  "zkSync Era",
  "Linea",
  "Scroll",
  "Blast",
  "Mantle",
  "Gnosis",
]

export class P8ChainMembership extends ProtocolTemplate {
  id = "P8_CHAIN_MEMBERSHIP"
  name = "Chain Membership"

  checkPrereqs(ctx: TemplateContext): boolean {
    if (!this.isProtocolContext(ctx)) return false

    const detail = ctx.data.protocolDetail
    if (!detail) return false

    // Need chains data
    if (!detail.chains || detail.chains.length === 0) return false

    return true
  }

  proposeFormats(ctx: TemplateContext): QuestionFormat[] {
    const detail = ctx.data.protocolDetail!
    const chainCount = detail.chains.length

    // If protocol is on many chains, mc4 works well
    // If on few chains, tf might be better
    if (chainCount >= 3) {
      return ["mc4", "tf"]
    }
    return ["tf", "mc4"]
  }

  instantiate(
    ctx: TemplateContext,
    format: QuestionFormat,
    seed: number
  ): QuestionDraft | null {
    const detail = ctx.data.protocolDetail!
    const protocolChains = new Set(detail.chains.map((c) => c.toLowerCase()))

    // Format chain names for display (capitalize first letter)
    const formatChainName = (name: string) =>
      name.charAt(0).toUpperCase() + name.slice(1)

    const rng = createRng(seed)

    if (format === "tf") {
      // Pick a chain and ask if the protocol is deployed on it
      // Randomly decide whether to pick a chain it IS or IS NOT on
      const askAboutPresent = rng() > 0.4 // 60% chance to ask about a chain it's on

      let targetChain: string
      let isDeployed: boolean

      if (askAboutPresent && detail.chains.length > 0) {
        // Pick a random chain the protocol IS on
        const shuffledPresent = deterministicShuffle(detail.chains, `${seed}:present`)
        targetChain = shuffledPresent[0]
        isDeployed = true
      } else {
        // Pick a popular chain the protocol is NOT on
        const absentChains = POPULAR_CHAINS.filter(
          (c) => !protocolChains.has(c.toLowerCase())
        )
        if (absentChains.length === 0) {
          // Protocol is on all popular chains, switch to asking about one it IS on
          const shuffledPresent = deterministicShuffle(detail.chains, `${seed}:fallback`)
          targetChain = shuffledPresent[0]
          isDeployed = true
        } else {
          const shuffledAbsent = deterministicShuffle(absentChains, `${seed}:absent`)
          targetChain = shuffledAbsent[0]
          isDeployed = false
        }
      }

      const targetChainDisplay = formatChainName(targetChain)
      const statement = `${detail.name} is deployed on ${targetChainDisplay}.`

      return {
        templateId: this.id,
        format,
        prompt: statement,
        answerValue: isDeployed,
        choices: ["True", "False"],
        answerIndex: isDeployed ? 0 : 1,
        signals: {
          format,
          familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
          margin: 0.25, // Binary question
          volatility: null,
        },
        explainData: {
          name: detail.name,
          targetChain: targetChainDisplay,
          isDeployed,
          chainCount: detail.chains.length,
          chains: detail.chains.slice(0, 5).map(formatChainName).join(", "),
        },
        buildNotes: [
          `TF: "${statement}" -> ${isDeployed}`,
          `Protocol chains: ${detail.chains.slice(0, 5).join(", ")}${detail.chains.length > 5 ? "..." : ""}`,
        ],
      }
    }

    // MC4 format - "Which chain is {protocol} deployed on?"
    // Pick 1 correct chain and 3 incorrect chains
    if (detail.chains.length === 0) return null

    // Pick a correct chain
    const shuffledPresent = deterministicShuffle(detail.chains, `${seed}:correct`)
    const correctChain = shuffledPresent[0]

    // Get chains the protocol is NOT on
    const absentChains = POPULAR_CHAINS.filter(
      (c) => !protocolChains.has(c.toLowerCase())
    )

    if (absentChains.length < 3) return null

    const shuffledAbsent = deterministicShuffle(absentChains, `${seed}:distractors`)
    const distractors = shuffledAbsent.slice(0, 3)

    // Build choices
    const allChoices = [formatChainName(correctChain), ...distractors]
    const shuffledChoices = deterministicShuffle(
      allChoices.map((chain, i) => ({ chain, isCorrect: i === 0 })),
      `${seed}:shuffle`
    )

    const choices = shuffledChoices.map((x) => x.chain)
    const answerIndex = shuffledChoices.findIndex((x) => x.isCorrect)

    return {
      templateId: this.id,
      format,
      prompt: `Which of these chains is ${detail.name} deployed on?`,
      choices,
      answerIndex,
      signals: {
        format,
        familiarityRankBucket: getRankBucket(ctx.topic.tvlRank),
        margin: 0.3,
        volatility: null,
      },
      explainData: {
        name: detail.name,
        correctChain: formatChainName(correctChain),
        chainCount: detail.chains.length,
        chains: detail.chains.slice(0, 5).map(formatChainName).join(", "),
      },
      buildNotes: [
        `Correct: ${formatChainName(correctChain)}`,
        `Distractors: ${distractors.join(", ")}`,
        `Protocol is on ${detail.chains.length} chains`,
      ],
    }
  }
}

export const p8ChainMembership = new P8ChainMembership()
