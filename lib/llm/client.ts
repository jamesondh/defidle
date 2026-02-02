/**
 * LLM Client
 *
 * OpenAI client configuration for generating explanations and rephrasing prompts.
 * Uses gpt-4o-mini for cost-effective generation.
 */

import OpenAI from "openai"

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_MODEL = "gpt-4o-mini"
const DEFAULT_TIMEOUT_MS = 10_000 // 10 seconds
const DEFAULT_MAX_RETRIES = 2

// Environment variable configuration
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10)
const LLM_MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10)
const SKIP_LLM = process.env.SKIP_LLM === "true"

// =============================================================================
// System Prompts
// =============================================================================

const EXPLANATION_SYSTEM_PROMPT = `You write 1-2 sentence explanations for a daily DeFi quiz game. The player just answered a question and wants to LEARN something — not hear the answer restated in prose.

CORE PRINCIPLE: Explain WHY or add context the player didn't have. Never just restate the answer.

BAD: "Uniswap has $4.2B TVL across 12 chains, placing it in the $1B-$5B range."
(The player already knows this — they just answered the question.)

GOOD: "Uniswap's $4.2B is spread across 12 chains, with Ethereum and Arbitrum alone accounting for over 80% — a common pattern for early L1-native DEXs."
(This adds insight about WHY the distribution looks this way.)

RULES:
- 1-2 sentences, factual, using the numbers provided
- Explain the "so what" — why is this number interesting, what does it tell us about the protocol/chain?
- Reference specific data points but don't just list them
- Use "TVL" not "total value locked" (the player already knows the acronym)
- For comparisons: explain what drives the difference, not just that a difference exists
- Write in a direct, conversational tone — no corporate-speak

NEVER DO:
- Restate the answer ("X has $Y TVL, placing it in the Z range" — they JUST answered this)
- End with filler ("highlighting its importance in the DeFi ecosystem", "indicating strong user engagement", "within the DeFi space")
- Start with "The correct answer" or "According to data"
- Say "total value locked (TVL)" — just say "TVL", the reader knows
- Use "market cap" when referring to TVL data
- Speculate on future performance
- Use phrases like "This indicates", "This highlights", "This demonstrates"`

const REPHRASE_SYSTEM_PROMPT = `Rephrase the quiz question while keeping the exact same meaning.

Rules:
- Keep it as a question
- Don't change any numbers, names, or the answer
- Add slight variety in word choice only
- Keep the same difficulty level
- Return only the rephrased question, nothing else`

// =============================================================================
// Client Setup
// =============================================================================

let openaiClient: OpenAI | null = null

/**
 * Get or create the OpenAI client
 */
function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set")
    }
    openaiClient = new OpenAI({
      apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: LLM_MAX_RETRIES,
    })
  }
  return openaiClient
}

// =============================================================================
// LLM Generation Functions
// =============================================================================

export interface LLMGenerationResult {
  text: string
  model: string
  success: boolean
  error?: string
}

/**
 * Generate an explanation for a quiz answer
 *
 * @param data - Structured data about the question and answer
 * @param topicName - Name of the topic (protocol or chain)
 * @param templateId - Template ID for context
 * @returns Generated explanation or error
 */
export async function generateExplanation(
  data: Record<string, unknown>,
  topicName: string,
  templateId: string
): Promise<LLMGenerationResult> {
  if (SKIP_LLM) {
    return {
      text: "",
      model: "skip",
      success: false,
      error: "SKIP_LLM is enabled",
    }
  }

  try {
    const client = getClient()

    // Build user prompt from data
    const dataStr = JSON.stringify(data, null, 2)
    
    // Check if comparison data is available for MC questions
    const hasComparison = "comparison" in data && typeof data.comparison === "string"
    const comparisonHint = hasComparison
      ? `\n\nIMPORTANT: Include brief context about the other choices. The "comparison" field shows the alternatives and their values - mention 1-2 of them to help explain why the correct answer stands out.`
      : ""
    
    const userPrompt = `Generate a 1-2 sentence explanation for a DeFi quiz answer.

Topic: ${topicName}
Template: ${templateId}
Data:
${dataStr}

Write a concise explanation using the data above.${comparisonHint}`

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: EXPLANATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 150,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })

    const text = response.choices[0]?.message?.content?.trim() || ""

    if (!text) {
      return {
        text: "",
        model: DEFAULT_MODEL,
        success: false,
        error: "Empty response from LLM",
      }
    }

    // Validate response (sanity checks)
    if (text.length > 500) {
      return {
        text: "",
        model: DEFAULT_MODEL,
        success: false,
        error: "Response too long (>500 chars)",
      }
    }

    // Check for terminology errors
    const lowerText = text.toLowerCase()
    if (lowerText.includes("market cap") || lowerText.includes("market capitalization")) {
      // Only reject if we're dealing with TVL data, not actual market cap
      const dataStr = JSON.stringify(data).toLowerCase()
      if (dataStr.includes("tvl") && !dataStr.includes("marketcap")) {
        return {
          text: "",
          model: DEFAULT_MODEL,
          success: false,
          error: "LLM incorrectly used 'market cap' terminology for TVL data",
        }
      }
    }

    return {
      text,
      model: DEFAULT_MODEL,
      success: true,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error(`LLM explanation generation failed: ${errorMsg}`)
    return {
      text: "",
      model: DEFAULT_MODEL,
      success: false,
      error: errorMsg,
    }
  }
}

/**
 * Rephrase a question prompt for variety (optional)
 *
 * @param basePrompt - Original question prompt
 * @param templateId - Template ID for context
 * @returns Rephrased prompt or original on failure
 */
export async function rephrasePrompt(
  basePrompt: string,
  _templateId: string
): Promise<LLMGenerationResult> {
  if (SKIP_LLM) {
    return {
      text: basePrompt,
      model: "skip",
      success: false,
      error: "SKIP_LLM is enabled",
    }
  }

  try {
    const client = getClient()

    const userPrompt = `Rephrase this quiz question:

"${basePrompt}"

Return only the rephrased question.`

    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: REPHRASE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 100,
      top_p: 1,
      frequency_penalty: 0.3,
      presence_penalty: 0,
    })

    const text = response.choices[0]?.message?.content?.trim() || ""

    if (!text) {
      return {
        text: basePrompt,
        model: DEFAULT_MODEL,
        success: false,
        error: "Empty response from LLM",
      }
    }

    return {
      text,
      model: DEFAULT_MODEL,
      success: true,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error(`LLM rephrase failed: ${errorMsg}`)
    return {
      text: basePrompt,
      model: DEFAULT_MODEL,
      success: false,
      error: errorMsg,
    }
  }
}

/**
 * Check if LLM is available (API key set and not skipped)
 */
export function isLLMAvailable(): boolean {
  if (SKIP_LLM) return false
  return !!process.env.OPENAI_API_KEY
}

/**
 * Get LLM configuration for debugging
 */
export function getLLMConfig(): {
  model: string
  timeoutMs: number
  maxRetries: number
  skipLLM: boolean
  hasApiKey: boolean
} {
  return {
    model: DEFAULT_MODEL,
    timeoutMs: LLM_TIMEOUT_MS,
    maxRetries: LLM_MAX_RETRIES,
    skipLLM: SKIP_LLM,
    hasApiKey: !!process.env.OPENAI_API_KEY,
  }
}
