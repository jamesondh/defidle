# Generation Algorithm

This document provides the detailed algorithm for deterministic episode generation, including RNG primitives, difficulty scoring, template selection, and distractor generation.

## Design Principles

1. **Deterministic**: Same date + topic → same episode, always
2. **Graceful degradation**: Missing data triggers fallbacks, not failures
3. **Fair distractors**: Plausible but distinguishable from correct answer
4. **Auditable**: Build log records all decisions for debugging

---

## 1. Deterministic RNG

All randomness is seeded from episode parameters, ensuring reproducibility.

```typescript
function seedFromParts(...parts: string[]): number {
  // Stable hash of joined parts → 64-bit integer
  const input = parts.join("|")
  return stableHash64(input)
}

function createRng(seed: number): () => number {
  // Any deterministic PRNG (e.g., mulberry32, xoshiro)
  // Returns function that produces values in [0, 1)
}

function deterministicShuffle<T>(items: T[], ...seedParts: string[]): T[] {
  const seed = seedFromParts(...seedParts)
  // Sort by hash(item.id + seed) for stability
  return items.slice().sort((a, b) => {
    const hashA = stableHash64(`${getId(a)}:${seed}`)
    const hashB = stableHash64(`${getId(b)}:${seed}`)
    return hashA - hashB
  })
}
```

**Seed structure examples**:
- Episode seed: `"2025-12-13|protocol|uniswap"`
- Question seed: `"2025-12-13|protocol|uniswap|slot-A|P1"`
- Distractor seed: `"2025-12-13|protocol|uniswap|slot-A|P1|distractors"`

---

## 2. Data Helpers

### Time Windows

```typescript
const WINDOW_7D = 7
const WINDOW_30D = 30
const WINDOW_90D = 90

function lastN<T>(series: T[], n: number): T[] {
  return series.slice(Math.max(0, series.length - n))
}

function sumLastN(series: { value: number }[], n: number): number {
  return lastN(series, n).reduce((sum, p) => sum + p.value, 0)
}

function percentChange(series: { ts: number, value: number }[], days: number): number | null {
  const now = series[series.length - 1]
  const past = findValueAtOrBefore(series, now.ts - days * 86400)
  if (!past || past.value <= 0) return null
  return (now.value - past.value) / past.value
}
```

### Margin Calculations

```typescript
function abMargin(a: number, b: number): number | null {
  const max = Math.max(a, b)
  if (max <= 0) return null
  return Math.abs(a - b) / max
}

function top2Margin(sortedDesc: number[]): number | null {
  if (sortedDesc.length < 2 || sortedDesc[0] <= 0) return null
  return (sortedDesc[0] - sortedDesc[1]) / sortedDesc[0]
}
```

---

## 3. Volatility Scoring

Measures how "noisy" a time series is. High volatility → prefer buckets over precise values.

```typescript
function volatilityScore(series: { value: number }[], windowDays: number): number | null {
  const s = lastN(series, windowDays + 1)
  if (s.length < 8) return null

  // Compute log returns
  const returns: number[] = []
  for (let i = 1; i < s.length; i++) {
    const v0 = s[i - 1].value
    const v1 = s[i].value
    if (v0 <= 0 || v1 <= 0) continue
    returns.push(Math.log(v1 / v0))
  }

  if (returns.length < 6) return null

  // Winsorize at p10/p90 to reduce spike impact
  const sorted = [...returns].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.1)]
  const hi = sorted[Math.floor(sorted.length * 0.9)]
  const winsorized = returns.map(r => Math.max(lo, Math.min(hi, r)))

  // Standard deviation
  const mean = winsorized.reduce((a, b) => a + b, 0) / winsorized.length
  const variance = winsorized.reduce((sum, r) => sum + (r - mean) ** 2, 0) / winsorized.length
  const sd = Math.sqrt(variance)

  // Normalize to 0-1 (0.12 is empirical threshold for "high" volatility)
  return Math.min(1, sd / 0.12)
}
```

**Interpretation**:
- 0.0 - 0.3: Low volatility, safe for precise questions
- 0.3 - 0.75: Moderate, prefer buckets for daily metrics
- 0.75 - 1.0: High, avoid for hard questions, use trend buckets only

---

## 4. Difficulty Scoring

```typescript
type DifficultyTarget = "easy" | "medium" | "hard"

interface DifficultySignals {
  format: QuestionFormat
  familiarityRankBucket: "top_10" | "top_25" | "top_100" | "long_tail"
  margin: number | null
  volatility: number | null
}

// Note: write_in format is deferred to v2+ (see SPEC.md)
const FORMAT_FACTORS: Record<QuestionFormat, number> = {
  tf: 0.15,
  ab: 0.30,
  mc4: 0.45,
  mc6: 0.55,
  rank4: 0.70,
}

const FAMILIARITY_FACTORS: Record<string, number> = {
  top_10: 0.10,
  top_25: 0.18,
  top_100: 0.30,
  long_tail: 0.45,
}

function computeDifficulty(signals: DifficultySignals): number {
  const f = FORMAT_FACTORS[signals.format]
  const fam = FAMILIARITY_FACTORS[signals.familiarityRankBucket]
  const mar = signals.margin !== null 
    ? Math.max(0, Math.min(1, 1 - signals.margin / 0.30))
    : 0.25
  const vol = signals.volatility ?? 0.25

  // Weighted sum
  const score = 0.35 * f + 0.25 * fam + 0.25 * mar + 0.15 * vol
  return Math.max(0, Math.min(1, score))
}

const TARGET_BANDS: Record<DifficultyTarget, [number, number]> = {
  easy: [0.00, 0.38],
  medium: [0.30, 0.68],
  hard: [0.60, 1.00],
}

function matchesTarget(score: number, target: DifficultyTarget): boolean {
  const [lo, hi] = TARGET_BANDS[target]
  return score >= lo && score <= hi
}
```

---

## 5. Template Interface

```typescript
interface TemplateContext {
  date: string
  episodeType: "protocol" | "chain"
  topic: ProtocolTopic | ChainTopic
  data: FetchedData  // All API responses
  derived: DerivedMetrics  // Computed values
}

interface Template {
  id: string
  slot: string
  
  // Check if template can be used
  checkPrereqs(ctx: TemplateContext): boolean
  
  // Return formats to try, in preference order
  proposeFormats(ctx: TemplateContext): QuestionFormat[]
  
  // Generate question for given format, or null if impossible
  instantiate(
    ctx: TemplateContext, 
    format: QuestionFormat, 
    seed: number
  ): QuestionDraft | null
}

interface QuestionDraft {
  templateId: string
  format: QuestionFormat
  prompt: string
  clues?: string[]
  choices?: string[]
  answerIndex?: number
  answerValue?: string | boolean
  signals: DifficultySignals
  explainData: Record<string, any>  // Structured data for LLM explanation
  buildNotes: string[]  // Decisions made during generation
}
```

---

## 6. Distractor Selection

### Entity Distractors (for MC questions)

Select plausible wrong answers that satisfy constraints.

```typescript
interface DistractorConstraints {
  count: number  // How many distractors needed
  mustMatch?: {
    // Distractors should share some characteristics
    category?: string
    tvlBand?: string
    chainCountBucket?: string
  }
  mustDiffer?: {
    // Distractors must differ in some way
    minTvlRatio?: number  // e.g., 0.5 means distractor TVL must be <50% or >200% of correct
  }
  avoid?: Set<string>  // IDs to exclude
}

function pickEntityDistractors(
  correctId: string,
  pool: Entity[],
  constraints: DistractorConstraints,
  seed: number
): Entity[] | null {
  // Filter candidates
  const candidates = pool.filter(item => {
    if (item.id === correctId) return false
    if (constraints.avoid?.has(item.id)) return false
    if (constraints.mustMatch && !matchesBands(item, constraints.mustMatch)) return false
    if (constraints.mustDiffer && !differsEnough(item, constraints.mustDiffer)) return false
    return true
  })

  // Deterministic shuffle
  const shuffled = deterministicShuffle(candidates, seed.toString())

  // Pick with diversity (avoid all same category, etc.)
  const picked: Entity[] = []
  for (const item of shuffled) {
    if (!violatesDiversity(item, picked)) {
      picked.push(item)
      if (picked.length === constraints.count) break
    }
  }

  return picked.length === constraints.count ? picked : null
}
```

### Numeric Distractors (for value-based MC)

```typescript
function makeNumericChoices(
  correctValue: number,
  nearbyValues: number[],  // e.g., values from top-10 list
  mode: "mc4" | "buckets",
  seed: number
): string[] | null {
  if (mode === "buckets") {
    // Fixed ratio buckets around correct value
    return [
      `< ${formatNumber(correctValue * 0.5)}`,
      `${formatNumber(correctValue * 0.5)} - ${formatNumber(correctValue * 0.8)}`,
      `${formatNumber(correctValue * 0.8)} - ${formatNumber(correctValue * 1.2)}`,
      `> ${formatNumber(correctValue * 1.2)}`,
    ]
  }

  // MC4: pick 3 distractor values with sufficient separation
  const candidates = nearbyValues.filter(v => {
    if (v <= 0) return false
    const margin = abMargin(v, correctValue)
    return margin !== null && margin >= 0.12  // At least 12% different
  })

  const shuffled = deterministicShuffle(candidates, seed.toString())
  const picks = shuffled.slice(0, 3)
  
  if (picks.length < 3) return null  // Not enough separated values

  // Shuffle final order (including correct answer)
  const allChoices = [correctValue, ...picks]
  return deterministicShuffle(allChoices, `${seed}:order`).map(formatNumber)
}
```

### Month/Quarter Distractors (for ATH questions)

```typescript
function makeTimingDistractors(
  correctMonth: string,  // "2024-03"
  count: number,
  seed: number
): string[] {
  // Generate adjacent months (±1-3 from correct)
  const candidates: string[] = []
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue
    candidates.push(addMonths(correctMonth, offset))
  }
  
  const shuffled = deterministicShuffle(candidates, seed.toString())
  return shuffled.slice(0, count)
}
```

---

## 7. Episode Generation

### Main Entry Point

```typescript
async function generateEpisode(date: string): Promise<Episode | null> {
  const dayOfWeek = getDayOfWeek(date)
  const episodeType = getEpisodeType(dayOfWeek)
  
  // Select topic
  const topic = selectTopic(date, episodeType)
  if (!topic) return null  // No valid topic available
  
  // Fetch data
  const data = await fetchDataForTopic(topic, episodeType)
  if (!data) return null  // API failure
  
  // Compute derived metrics
  const derived = computeDerivedMetrics(data, episodeType)
  
  // Build context
  const ctx: TemplateContext = { date, episodeType, topic, data, derived }
  
  // Assemble questions
  const slots = ["A", "B", "C", "D", "E"]
  const targets: DifficultyTarget[] = ["medium", "easy", "medium", "hard", "easy"]
  const matrix = episodeType === "protocol" ? PROTOCOL_MATRIX : CHAIN_MATRIX
  
  const questions: Question[] = []
  const usedTemplates = new Set<string>()
  const buildLog: BuildLogEntry[] = []
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const target = targets[i]
    const qSeed = seedFromParts(date, episodeType, topic.slug, `slot-${slot}`)
    
    const question = selectQuestionForSlot(
      slot, matrix[slot], ctx, target, qSeed, usedTemplates, buildLog
    )
    
    if (question) {
      questions.push(finalizeQuestion(question, slot, target))
      usedTemplates.add(question.templateId)
    }
  }
  
  // Validate and adjust
  const finalQuestions = postBalancePass(questions, ctx, buildLog)
  
  // Generate text via LLM
  const questionsWithText = await generateQuestionText(finalQuestions, ctx)
  
  return {
    episodeId: `${date}:${episodeType}:${topic.slug}`,
    dateUtc: date,
    episodeType,
    topic,
    questions: questionsWithText,
    generatedAt: new Date().toISOString(),
    buildLog,
  }
}
```

### Slot Selection

```typescript
function selectQuestionForSlot(
  slot: string,
  templates: Template[],
  ctx: TemplateContext,
  target: DifficultyTarget,
  seed: number,
  usedTemplates: Set<string>,
  buildLog: BuildLogEntry[]
): QuestionDraft | null {
  for (const template of templates) {
    // Skip if already used (except for some templates that allow reuse)
    if (usedTemplates.has(template.id) && !template.allowReuse) {
      buildLog.push({ slot, template: template.id, decision: "skip", reason: "already_used" })
      continue
    }
    
    // Check prerequisites
    if (!template.checkPrereqs(ctx)) {
      buildLog.push({ slot, template: template.id, decision: "skip", reason: "prereq_failed" })
      continue
    }
    
    // Try each format in preference order
    const formats = template.proposeFormats(ctx)
    for (const format of formats) {
      const draft = template.instantiate(ctx, format, seed)
      
      if (!draft) {
        buildLog.push({ slot, template: template.id, format, decision: "skip", reason: "instantiate_failed" })
        continue
      }
      
      const score = computeDifficulty(draft.signals)
      
      if (matchesTarget(score, target)) {
        buildLog.push({ slot, template: template.id, format, decision: "selected", score })
        return { ...draft, difficultyScore: score }
      }
      
      // Try adjusting format to match target
      const adjusted = tryAdjustDifficulty(template, ctx, draft, target, seed)
      if (adjusted) {
        const adjScore = computeDifficulty(adjusted.signals)
        if (matchesTarget(adjScore, target)) {
          buildLog.push({ slot, template: template.id, decision: "adjusted", originalFormat: format, newFormat: adjusted.format, score: adjScore })
          return { ...adjusted, difficultyScore: adjScore }
        }
      }
      
      buildLog.push({ slot, template: template.id, format, decision: "reject", reason: "difficulty_mismatch", score, target })
    }
  }
  
  // No template worked - use safe fallback
  buildLog.push({ slot, decision: "fallback", reason: "no_template_matched" })
  return safeFallback(slot, ctx, seed)
}
```

### Post-Balance Pass

```typescript
function postBalancePass(
  questions: Question[],
  ctx: TemplateContext,
  buildLog: BuildLogEntry[]
): Question[] {
  const result = [...questions]
  
  // Constraint: max 1 high-volatility question
  const highVolQuestions = result.filter(q => 
    q.signals.volatility !== null && q.signals.volatility > 0.75
  )
  
  if (highVolQuestions.length > 1) {
    // Convert extra high-vol questions to bucket format
    for (const q of highVolQuestions.slice(1)) {
      const converted = convertToBucketFormat(q, ctx)
      if (converted) {
        const idx = result.indexOf(q)
        result[idx] = converted
        buildLog.push({ qid: q.qid, decision: "post_balance", reason: "reduce_volatility" })
      }
    }
  }
  
  // Constraint: ensure difficulty mix is roughly correct
  // (optional fine-tuning pass)
  
  return result
}
```

---

## 8. LLM Integration

LLM is used at generation time for:

1. **Prompt phrasing**: Add variety to template prompts
2. **Explanations**: Generate 1-2 sentence explanations from structured data

```typescript
async function generateQuestionText(
  questions: QuestionDraft[],
  ctx: TemplateContext
): Promise<Question[]> {
  return Promise.all(questions.map(async (draft) => {
    // Rephrase prompt (optional, for variety)
    const prompt = await llmRephrase(draft.prompt, draft.templateId)
    
    // Generate explanation from structured data
    const explanation = await llmExplain(draft.explainData, ctx.topic)
    
    return {
      ...draft,
      prompt,
      explanation,
    }
  }))
}

async function llmRephrase(basePrompt: string, templateId: string): Promise<string> {
  // Light rephrasing for variety, keeping meaning identical
  // Could be skipped in v1 - just return basePrompt
  return basePrompt
}

async function llmExplain(data: Record<string, any>, topic: Topic): Promise<string> {
  // Generate natural language explanation from structured data
  // Example input: { correctChain: "Ethereum", tvl: 2500000000, margin: 0.65 }
  // Example output: "Ethereum holds $2.5B of Uniswap's TVL, about 65% more than any other chain."
  
  const prompt = `Generate a 1-2 sentence explanation for a DeFi quiz answer.
Topic: ${topic.name}
Data: ${JSON.stringify(data)}
Keep it educational and concise.`
  
  return await callLLM(prompt)
}
```

---

## 9. Template Matrices

### Protocol Matrix

```typescript
const PROTOCOL_MATRIX: Record<string, Template[]> = {
  "A": [P1_Fingerprint],
  "B": [P2_CrossChain, P3_Concentration],
  "C": [P5_FeesRevenue, P4_ATHTiming],
  "D": [P4_ATHTiming, P5_FeesRevenue, P2_CrossChain],
  "E": [P6_TVLTrend, P3_Concentration, P5_Trend],
}
```

### Chain Matrix

```typescript
const CHAIN_MATRIX: Record<string, Template[]> = {
  "A": [C1_Fingerprint],
  "B": [C2_TVLComparison],
  "C": [C5_TopByFees, C6_TopDEX],
  "D": [C3_ATHTiming, C4_GrowthRanking],
  "E": [C6_TopDEX, C5_TopByFees, C2_GrowthComparison],
}
```

---

## 10. Build Log Schema

Every decision is logged for debugging and auditing.

```typescript
interface BuildLogEntry {
  slot?: string
  template?: string
  format?: string
  decision: "selected" | "skip" | "reject" | "adjusted" | "fallback" | "post_balance"
  reason?: string
  score?: number
  target?: DifficultyTarget
  originalFormat?: string
  newFormat?: string
  qid?: string
}
```

Example log:
```json
[
  { "slot": "A", "template": "P1", "format": "mc6", "decision": "selected", "score": 0.52 },
  { "slot": "B", "template": "P2", "decision": "skip", "reason": "prereq_failed" },
  { "slot": "B", "template": "P3", "format": "mc4", "decision": "selected", "score": 0.31 },
  { "slot": "C", "template": "P5", "format": "ab", "decision": "reject", "reason": "difficulty_mismatch", "score": 0.28, "target": "medium" },
  { "slot": "C", "template": "P5", "decision": "adjusted", "originalFormat": "ab", "newFormat": "mc4", "score": 0.45 }
]
```
