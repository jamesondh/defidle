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

const EXPLANATION_SYSTEM_PROMPT = `You generate concise, educational explanations for DeFi quiz answers.

Rules:
- 1-2 sentences maximum
- Include the specific numbers/data provided
- Be factual, not promotional
- Use plain language accessible to DeFi beginners
- Format large numbers with appropriate units ($4.2B, not $4,200,000,000)
- Do not include phrases like "The correct answer is..." or "According to data..."
- Just state the fact directly`

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
    const userPrompt = `Generate a 1-2 sentence explanation for a DeFi quiz answer.

Topic: ${topicName}
Template: ${templateId}
Data:
${dataStr}

Write a concise explanation using the data above.`

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

    // Validate response (basic sanity checks)
    if (text.length > 500) {
      return {
        text: "",
        model: DEFAULT_MODEL,
        success: false,
        error: "Response too long (>500 chars)",
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
