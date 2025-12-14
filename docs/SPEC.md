# DeFidle Specification

DeFidle is a daily DeFi quiz where players answer 4-6 questions about a protocol or chain, using real data from DefiLlama. Episodes are pre-generated daily via cron job, deterministic (same for all users), and designed to be educational rather than punishing. No authentication or persistent user state—just play and see your results.

## Core Principles

- **Data-driven**: All answers derived from DefiLlama API, never fabricated
- **Fair**: Difficulty controlled via margins, buckets, and format selection—no arbitrary trivia
- **Educational**: Post-answer explanations teach DeFi concepts and metrics
- **Deterministic**: Same seed → same episode, reproducible for debugging

## System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  DefiLlama API  │────▶│  Episode Gen     │────▶│  Storage        │
│  (free public)  │     │  (GitHub Action) │     │  (static JSON)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                         │
                               ▼                         ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │  LLM             │     │  Client         │
                        │  (phrasing/      │     │  (Next.js)      │
                        │   explanations)  │     └─────────────────┘
                        └──────────────────┘
```

### Data Flow

1. **GitHub Action** runs daily via cron, determines topic based on day of week
2. **Data fetch** pulls required metrics from DefiLlama public API
3. **Generation** selects questions via template system, uses LLM for phrasing/explanations
4. **Storage** commits episode JSON to `/public/episodes/{YYYY-MM}/{DD}.json`
5. **Vercel deploy** triggered automatically by commit to main
6. **Client** fetches today's episode directly from static path, renders questions, shows results

## Episode Schedule

Episodes are assigned by day of week (hardcoded):

| Day       | Episode Type |
|-----------|--------------|
| Sunday    | Protocol     |
| Monday    | Protocol     |
| Tuesday   | Chain        |
| Wednesday | Protocol     |
| Thursday  | Chain        |
| Friday    | Protocol     |
| Saturday  | Chain        |

**4 protocol episodes + 3 chain episodes per week.**

## Components

### 1. Topic Selection

Each episode type maintains a curated pool of eligible topics:

- **Protocols**: Top ~100 by TVL, filtered for data quality (has fees data, multi-chain, etc.)
- **Chains**: Top ~30 by TVL

#### Topic Pool Storage

Topic pools are stored as static JSON files in the repository, refreshed weekly via automated script:

```
/data/
  pools/
    protocols.json    # ~100 protocols with metadata
    chains.json       # ~30 chains with metadata
  llm-cache/
    2025-12.json      # Cached LLM outputs by month
    2026-01.json
  overrides.json      # Manual blocklist and forced inclusions
```

**Protocol pool entry:**
```json
{
  "slug": "uniswap",
  "name": "Uniswap",
  "category": "Dexes",
  "tvlRank": 3,
  "tvl": 4200000000,
  "chains": ["ethereum", "arbitrum", "polygon", "optimism", "base"],
  "hasFeesData": true,
  "hasRevenueData": true,
  "hasVolumeData": true,
  "historyDays": 1200,
  "lastUpdated": "2025-12-13"
}
```

**Chain pool entry:**
```json
{
  "slug": "Ethereum",
  "name": "Ethereum",
  "tvlRank": 1,
  "tvl": 62000000000,
  "protocolCount": 850,
  "historyDays": 1500,
  "lastUpdated": "2025-12-13"
}
```

**Overrides file:**
```json
{
  "protocols": {
    "blocklist": ["some-scam-protocol", "broken-data-protocol"],
    "forceInclude": ["important-protocol-outside-top-100"]
  },
  "chains": {
    "blocklist": ["testnet-chain"],
    "forceInclude": []
  }
}
```

#### Pool Refresh Process

A weekly GitHub Action refreshes the topic pools:

1. **Fetch** top 150 protocols and top 50 chains from DefiLlama API
2. **Enrich** each entry with quality signals (fees data, history length, etc.)
3. **Filter** by quality thresholds:
   - Protocols: Must have 30+ days TVL history
   - Chains: Must have 30+ days TVL history and 10+ protocols
4. **Apply overrides**: Remove blocklisted entries, add forced inclusions
5. **Rank and trim**: Take top 100 protocols, top 30 chains by TVL
6. **Write** updated JSON files to `/data/pools/`
7. **Commit** changes to main branch (auto-merge if CI passes)

**Schedule**: Runs every Sunday at 00:00 UTC (before the week's episodes generate)

**Manual trigger**: Can also be run manually via `npm run refresh-pools` for immediate updates

#### Why This Approach

- **Fresh data**: Weekly refresh keeps TVL ranks and metadata current
- **Predictable**: Pool is static at episode generation time—no API call needed
- **Auditable**: All pool changes tracked in git history
- **Override escape hatch**: Blocklist handles bad data; forceInclude handles edge cases
- **Low maintenance**: Automatically tracks what's popular in DeFi

#### Selection Algorithm: Weighted Random with Cooldown

Topic selection uses **weighted random sampling** with a **cooldown penalty** to ensure variety while favoring higher-quality topics. The algorithm is deterministic—same date always produces same topic.

```typescript
function selectTopic(date: string, type: "protocol" | "chain"): Topic {
  const pool = type === "protocol" ? PROTOCOL_POOL : CHAIN_POOL
  const seed = seedFromParts(date, type)
  const rng = createRng(seed)
  
  // Compute base weight for each topic
  const weights = pool.map(topic => computeTopicWeight(topic))
  
  // Apply cooldown penalty for recently used topics
  const cooldownDays = type === "protocol" ? 14 : 10
  const recentTopics = getTopicsFromLastNDays(type, cooldownDays)
  const adjustedWeights = weights.map((w, i) => 
    recentTopics.has(pool[i].slug) ? w * 0.1 : w
  )
  
  // Hard constraint: never repeat within same week
  const thisWeekTopics = getTopicsFromCurrentWeek(type)
  const finalWeights = adjustedWeights.map((w, i) =>
    thisWeekTopics.has(pool[i].slug) ? 0 : w
  )
  
  return weightedRandomPick(pool, finalWeights, rng)
}
```

#### Weight Calculation

Each topic's base weight is a composite of three factors:

```typescript
function computeTopicWeight(topic: Topic): number {
  const tvlScore = tvlRankToScore(topic.tvlRank)       // 0.0 - 1.0
  const qualityScore = dataQualityScore(topic)         // 0.0 - 1.0
  const diversityBonus = categoryDiversityBonus(topic) // 0.0 - 0.3
  
  return 0.4 * tvlScore + 0.3 * qualityScore + 0.3 * (1 + diversityBonus)
}
```

| Factor | Weight | Description |
|--------|--------|-------------|
| TVL Rank Score | 40% | Higher TVL → higher weight. Top 10 = 1.0, rank 100 = 0.1 |
| Data Quality Score | 30% | Rewards topics with complete data (fees, history, multi-chain) |
| Diversity Bonus | 30% | Slight boost for underrepresented categories in recent episodes |

**TVL Rank Score:**
```
tvlRankToScore(rank) = max(0.1, 1 - (rank - 1) / 100)
```

**Data Quality Score** (sum of available signals):
| Signal | Points |
|--------|--------|
| Has fees data | 0.25 |
| Has 90+ days TVL history | 0.25 |
| Multi-chain (2+ chains) | 0.25 |
| Has revenue data (not just fees) | 0.15 |
| Has volume data (for DEXes) | 0.10 |

**Diversity Bonus:** +0.1 to +0.3 if the topic's category hasn't appeared in the last 5 episodes of that type.

#### Cooldown Mechanism

- **Protocol cooldown**: 14 days (with ~100 pool, ensures 7+ cycles before repeat)
- **Chain cooldown**: 10 days (with ~30 pool, ensures 3+ cycles before repeat)
- **Same-week constraint**: Topics cannot repeat within the same calendar week (hard block, weight = 0)

Cooldown applies a 90% penalty (multiplier of 0.1) rather than full exclusion, allowing popular topics to still appear if they're heavily weighted.

#### Edge Cases

- **Pool exhaustion**: If all topics have weight 0 (entire pool used this week), fall back to lowest-cooldown topic
- **New topics**: Topics added to pool start with no cooldown history, so they're immediately eligible
- **Removed topics**: Topics removed from pool are simply no longer candidates; cooldown history is retained for 30 days in case of re-addition

### 2. Data Fetching

Uses DefiLlama's **free public API only** (no Pro API key required). Key endpoints:

**TVL & Protocol Data:**
- `GET /api/protocols` — Protocol list with TVL, category, chains, 1d/7d changes
- `GET /api/protocol/{slug}` — Protocol detail, TVL history, per-chain breakdown
- `GET /api/tvl/{protocol}` — Simple current TVL number

**Chain Data:**
- `GET /api/v2/chains` — Chain list with TVL
- `GET /api/v2/historicalChainTvl/{chain}` — Chain TVL history

**Fees & Revenue (free):**
- `GET /api/overview/fees` — All protocols fees overview
- `GET /api/overview/fees/{chain}` — Fees leaderboard by chain
- `GET /api/summary/fees/{protocol}` — Protocol fees/revenue data

**DEX Volume (free):**
- `GET /api/overview/dexs` — All DEX volumes overview
- `GET /api/overview/dexs/{chain}` — DEX volume leaderboard by chain
- `GET /api/summary/dexs/{protocol}` — DEX volume time series

**NOT used (Pro API required):**
- ~~`/api/inflows/{protocol}/{timestamp}`~~ — Requires Pro API
- ~~`/yields/*`~~ — Requires Pro API
- ~~`/api/activeUsers`~~ — Requires Pro API

See `defillama-api.md` for full API reference.

**Caching**: Data fetched at generation time is baked into the episode. No runtime API calls from client.

**Error handling**: If API is unavailable or data is insufficient, skip episode generation for that day.

### 3. Question Generation

Questions are generated from a fixed set of **templates**. Each template:

- Maps to specific API data
- Defines valid question formats (T/F, A/B, MC, etc.)
- Includes fallback rules when data is sparse or margins are tight
- Specifies how to generate distractors

**LLM usage** (at generation time):
- Rephrase template prompts for variety (optional in v1)
- Create 1-2 sentence explanations from structured data

See `question-templates.md` for the template catalog.

**Current templates:** P1-P6 (protocol) and C1-C6 (chain) — 12 templates total.

**Planned templates:** P7-P12 (protocol) and C7-C9 (chain) — 9 additional templates covering:
- Category identification, chain membership, top chain name, TVL bands, fees trends, DEX volume trends (protocols)
- Chain TVL bands, 30d direction, distance from ATH (chains)

### 3a. LLM Configuration

LLM is used **only at generation time** (GitHub Action), never at runtime. The client receives pre-generated text.

#### Model Selection

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Provider** | OpenAI | Best cost/quality ratio, reliable API |
| **Model** | `gpt-4o-mini` | ~95% cheaper than gpt-4o, sufficient for short-form generation |
| **Fallback Model** | `gpt-4o-mini` (retry) → template fallback | Graceful degradation |

#### Generation Parameters

**Explanations** (primary use case):
```typescript
{
  model: "gpt-4o-mini",
  temperature: 0.3,        // Low for factual consistency
  max_tokens: 150,         // 1-2 sentences rarely need more
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
}
```

**Prompt Rephrasing** (optional, can skip in v1):
```typescript
{
  model: "gpt-4o-mini",
  temperature: 0.5,        // Slightly higher for variety
  max_tokens: 100,
  top_p: 1,
  frequency_penalty: 0.3,  // Discourage repetitive phrasing
  presence_penalty: 0,
}
```

#### System Prompts

**Explanation generation:**
```
You generate concise, educational explanations for DeFi quiz answers.

Rules:
- 1-2 sentences maximum
- Include the specific numbers/data provided
- Be factual, not promotional
- Use plain language accessible to DeFi beginners
- Format large numbers with appropriate units ($4.2B, not $4,200,000,000)
```

**Prompt rephrasing:**
```
Rephrase the quiz question while keeping the exact same meaning.

Rules:
- Keep it as a question
- Don't change any numbers, names, or the answer
- Add slight variety in word choice only
- Keep the same difficulty level
```

#### Seed-Based Caching

LLM outputs are cached by deterministic key to ensure reproducibility:

```typescript
function getLLMCacheKey(
  date: string,             // e.g., "2025-12-13"
  episodeType: string,      // e.g., "protocol"
  topicSlug: string,        // e.g., "uniswap"
  questionSlot: string,     // e.g., "A"
  templateId: string,       // e.g., "P1_FINGERPRINT"
  contentType: "explanation" | "rephrase",
  dataHash: string          // SHA-256 of explainData, first 16 chars
): string {
  return `${date}|${episodeType}|${topicSlug}|${questionSlot}|${templateId}|${contentType}|${dataHash}`
}

function hashData(data: Record<string, any>): string {
  const sorted = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash("sha256").update(sorted).digest("hex").slice(0, 16)
}
```

**Cache storage:**
```
/data/llm-cache/
  2025-12.json    # One file per month
  2026-01.json
```

**Cache entry schema:**
```json
{
  "2025-12-13|protocol|uniswap|A|P1_FINGERPRINT|explanation|a1b2c3d4e5f6g7h8": {
    "text": "Uniswap is the largest DEX by TVL, deployed on 12 chains with over $4B TVL.",
    "model": "gpt-4o-mini",
    "generatedAt": "2025-12-13T00:05:12Z"
  }
}
```

**Cache behavior:**
1. Compute cache key from episode seed + question data
2. If cache hit → return cached text (deterministic)
3. If cache miss → call LLM, store result, return text
4. Same episode regeneration always returns identical text

#### Deterministic Fallback (No LLM)

If the LLM API fails (timeout, rate limit, outage), the system falls back to **template-based explanations** that require no external calls:

```typescript
const EXPLANATION_TEMPLATES: Record<string, string> = {
  // Protocol templates
  P1_FINGERPRINT: "{name} is a {category} protocol deployed on {chainCount} chains with {tvlFormatted} TVL.",
  P2_CROSSCHAIN: "{name} has {marginPercent}% more TVL on {winnerChain} ({winnerTvl}) compared to {loserChain} ({loserTvl}).",
  P3_CONCENTRATION: "{topChain} holds {sharePercent}% of {name}'s total TVL ({topChainTvl} of {totalTvl}).",
  P4_ATH_TIMING: "{name} reached its all-time high TVL of {athValue} in {athMonth}.",
  P5_FEES_REVENUE: "{name} generated {fees7d} in fees over the past 7 days, with {revPercent}% going to protocol revenue.",
  P6_TVL_TREND: "{name}'s TVL {trendDirection} by {changePercent}% over the past {period}, from {startTvl} to {endTvl}.",
  
  // Chain templates
  C1_FINGERPRINT: "{name} is ranked #{tvlRank} by TVL with {tvlFormatted} locked across {protocolCount} protocols.",
  C2_COMPARISON: "{winnerChain} has {marginPercent}% more TVL than {loserChain} ({winnerTvl} vs {loserTvl}).",
  C3_ATH_TIMING: "{name} reached its all-time high TVL of {athValue} in {athMonth}.",
  C4_GROWTH: "{name} grew {changePercent}% over the past 30 days, {comparison} other major chains.",
  C5_TOP_FEES: "{topProtocol} leads {chain} in 24h fees with {feesAmount}, capturing {sharePercent}% of chain fees.",
  C6_TOP_DEX: "{topDex} is the top DEX on {chain} with {volumeAmount} in 24h volume ({sharePercent}% of chain DEX volume).",
}

function generateFallbackExplanation(
  templateId: string,
  data: Record<string, any>
): string {
  const template = EXPLANATION_TEMPLATES[templateId]
  if (!template) {
    // Ultimate fallback: generic statement
    return `The correct answer is based on data from DefiLlama as of ${data.date}.`
  }
  
  // Replace all {placeholders} with data values
  return template.replace(/{(\w+)}/g, (_, key) => {
    return data[key] ?? `[${key}]`
  })
}
```

**Fallback trigger conditions:**
- LLM API returns error (4xx, 5xx)
- LLM API timeout (>10 seconds)
- LLM response fails validation (too long, contains prohibited content)
- `SKIP_LLM=true` environment variable set (for testing)

**Fallback behavior:**
1. Log warning with error details
2. Generate explanation using template
3. Mark question with `"llmFallback": true` in episode JSON
4. Continue episode generation (don't fail entire episode)

#### Question Fallback Diversity

When templates fail prerequisite checks (e.g., missing fees data, insufficient chain support), the system falls back to simple true/false questions. To avoid repetition and maintain engagement, the fallback system uses a **diverse pool of fallback questions**:

**Protocol fallbacks:**
- "Is {name} a DeFi protocol?"
- "Does {name} have more than $1M in TVL?"
- "Is {name} ranked in the top 100 protocols by TVL?"
- "Is {name} tracked on DefiLlama?"
- "Is {name} deployed on more than one blockchain?"

**Chain fallbacks:**
- "Is {name} a blockchain network?"
- "Does {name} have DeFi protocols deployed on it?"
- "Is {name} ranked in the top 50 chains by TVL?"
- "Is {name} tracked on DefiLlama?"
- "Does {name} have more than $10M in total TVL?"

**Deduplication:**
- The system tracks used prompts across all questions in an episode
- Fallback selection prioritizes unused prompts to prevent duplicates
- Post-balance pass detects and replaces any duplicate prompts that slip through

#### Explanation Comparison Data

Explanations should include metrics for wrong choices when available, making the learning experience more educational. For multiple-choice questions, the `explainData` includes comparison data:

```typescript
// Example: C4_GROWTH_RANKING explainData
{
  topChain: "Celo",
  topGrowth: "48.8",
  topChange: "+48.8%",
  otherChains: [
    { name: "Stable", change: "+32.1%" },
    { name: "Corn", change: "+18.5%" },
    { name: "Hyperliquid L1", change: "+12.3%" }
  ],
  comparison: "Stable (+32.1%), Corn (+18.5%), Hyperliquid L1 (+12.3%)"
}
```

The LLM uses this comparison data to generate explanations like:
> "Celo leads in growth ranking among chains with a remarkable increase of 48.8%, outpacing Stable (+32.1%), Corn (+18.5%), and Hyperliquid L1 (+12.3%)."

**Templates with comparison data:**
- C4 (Growth Ranking): Shows growth rates of all choices
- C5 (Top by Fees): Shows fees for other protocols in leaderboard
- C6 (Top DEX): Shows volume for other DEXes in leaderboard
- P4/C3 (ATH Timing): Lists the distractor months considered
- A/B comparisons (P2, C2): Already include metrics for both options

#### Cost Estimation

| Item | Estimate |
|------|----------|
| Input tokens per episode | ~2,000 (5 questions × ~400 tokens each) |
| Output tokens per episode | ~500 (5 explanations × ~100 tokens each) |
| Cost per episode | ~$0.01 (at $0.15/1M input, $0.60/1M output) |
| Monthly cost (30 episodes) | ~$0.30 |

#### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional
LLM_TIMEOUT_MS=10000          # Default: 10000 (10 seconds)
LLM_MAX_RETRIES=2             # Default: 2
SKIP_LLM=false                # Default: false (set true for testing)
```

### 4. Episode Assembly

Each episode follows a **slot-based structure** with difficulty targeting:

- **Slot A (Hook)**: Medium — Identify the topic from clues
- **Slot B (Easy)**: Confidence builder — High-margin comparison
- **Slot C (Medium)**: Context — Fees, revenue, or historical question
- **Slot D (Hard)**: Skill test — Tight margins or precise timing
- **Slot E (Wrap-up)**: Easy-Medium — Insight or trend question

Templates are assigned to slots based on prerequisite checks and difficulty scoring.

See `episode-assembly.md` for the slot matrix and difficulty system.

### 5. Generation Algorithm

The generation process is **deterministic**:

- Seed derived from date + episode type + topic
- Same seed always produces same episode
- Fallbacks are deterministic (try templates in order, degrade formats predictably)

Key mechanisms:
- Difficulty scoring based on format, margin, familiarity, volatility
- Format degradation (MC → A/B → T/F) when margins are too tight
- Distractor selection with separation constraints

See `generation-algorithm.md` for pseudo-code and detailed logic.

### 6. Client

Simple consumer with no persistent state:

- Fetches today's episode JSON
- Renders questions sequentially
- Tracks answers locally (session only)
- Shows results summary: "You got 3/5 correct"
- Displays explanations after each answer

No authentication, no leaderboards, no streaks (v1).

## Data Schemas

### Episode Object

```json
{
  "episodeId": "2025-12-13:protocol:uniswap",
  "dateUtc": "2025-12-13",
  "episodeType": "protocol",
  "topic": {
    "slug": "uniswap",
    "name": "Uniswap",
    "category": "Dexes"
  },
  "questions": [
    {
      "qid": "q1",
      "slot": "A",
      "templateId": "P1_FINGERPRINT",
      "format": "mc6",
      "prompt": "Which protocol matches these clues?",
      "clues": ["Category: DEX", "Chains: 10+", "TVL: $1B+"],
      "choices": ["Uniswap", "SushiSwap", "Curve", "Balancer", "PancakeSwap", "Trader Joe"],
      "answerIndex": 0,
      "explanation": "Uniswap is the largest DEX by TVL, deployed on 12 chains with over $4B TVL.",
      "difficulty": "medium",
      "llmFallback": false
    },
    {
      "qid": "q2",
      "slot": "B",
      "templateId": "P3_CONCENTRATION",
      "format": "tf",
      "prompt": "More than 50% of Uniswap's TVL is on Ethereum.",
      "choices": ["True", "False"],
      "answerIndex": 0,
      "answerValue": true,
      "explanation": "Ethereum holds 65% of Uniswap's total TVL.",
      "difficulty": "easy",
      "llmFallback": false
    }
  ],
  "generatedAt": "2025-12-13T00:00:00Z"
}
```

### Question Formats

| Format | Description | Example |
|--------|-------------|---------|
| `tf` | True/False | "Uniswap has >$1B TVL: True or False?" |
| `ab` | Binary choice | "Higher TVL: Arbitrum or Base?" |
| `mc4` | 4-choice multiple choice | "Which chain has the most Uniswap TVL?" |
| `mc6` | 6-choice multiple choice | "Identify the protocol from these clues" |
| `rank` | Order 3-4 items | "Rank these chains by TVL" |

**Important:** All choice-based formats (`tf`, `ab`, `mc4`, `mc6`) use `choices` array and `answerIndex` for answer evaluation. For `tf` questions, the `choices` array is always `["True", "False"]` and `answerIndex` is `0` for true, `1` for false. The optional `answerValue` field stores the boolean for reference but is not used for answer evaluation.

## Episode Storage

Episodes are stored as static JSON files in the repository, served directly via Vercel's CDN.

### Structure

```
/public/episodes/
  2025-12/
    13.json
    14.json
    ...
  2026-01/
    01.json
    ...
```

### File Naming

- Path: `/public/episodes/{YYYY-MM}/{DD}.json`
- Example: `/public/episodes/2025-12/13.json` for December 13, 2025

### Generation & Deployment

**Weekly pool refresh** (Sundays 00:00 UTC):
1. **Refresh script** (`scripts/refresh-pools.ts`) fetches latest data from DefiLlama
2. **Applies filters and overrides**, writes to `/data/pools/*.json`
3. **Commits** changes to main branch

**Daily episode generation** (00:00 UTC):
1. **GitHub Actions cron** runs daily
2. **Generation script** (`scripts/generate-episode.ts`) executes:
   - Determines episode type from day of week
   - Selects topic via weighted random algorithm
   - Fetches data from DefiLlama API
   - Generates questions using templates
   - Generates explanations via LLM (with seed-based caching)
   - Falls back to template explanations if LLM fails
   - Writes JSON to `/public/episodes/{YYYY-MM}/{DD}.json`
   - Updates `/data/llm-cache/{YYYY-MM}.json` with any new LLM outputs
3. **Commit & push** to main branch
4. **Vercel auto-deploys** on push, CDN caches the new static file

### Client Access

Client fetches episodes directly via static path—no API route needed:

```typescript
const today = new Date()
const yyyy = today.getUTCFullYear()
const mm = String(today.getUTCMonth() + 1).padStart(2, '0')
const dd = String(today.getUTCDate()).padStart(2, '0')

const episode = await fetch(`/episodes/${yyyy}-${mm}/${dd}.json`).then(r => r.json())
```

### Why Static Files

- **Zero runtime cost**: No API routes, no database, no cold starts
- **Edge-cached**: Vercel CDN serves files globally with low latency
- **Simple**: No infrastructure to manage beyond GitHub + Vercel
- **Deterministic**: File exists or it doesn't—no race conditions

### Archival

At ~2-5KB per episode, a full year is ~1-2MB. No immediate need for cleanup or external storage. If repo size becomes a concern in the future, older months can be archived to external storage (S3/R2) and served via redirect.

## Detailed Specs

| File | Description |
|------|-------------|
| `question-templates.md` | Template catalog (P1-P6, C1-C6 implemented; P7-P12, C7-C9 planned) |
| `episode-assembly.md` | Slot matrix, difficulty targeting, prerequisite checks |
| `generation-algorithm.md` | Deterministic RNG, difficulty scoring, distractor selection |
| `defillama-api.md` | DefiLlama API reference |

## Open Questions / Future Work

- **Write-in format** (v2+): Free-form text input where players type answers (e.g., protocol names). Deferred because it requires:
  - Fuzzy matching logic (handling typos, aliases like "Uniswap" vs "uniswap" vs "UNI")
  - Alias database (official name variations, ticker symbols)
  - Validation edge cases (partial matches, common misspellings)
  - No distractors needed, but harder to ensure fairness without careful normalization
- **Pro API features** (v2+): If Pro API access is added later, could enable:
  - `/api/inflows` for daily capital flow questions
  - `/api/activeUsers` for user activity questions
  - `/yields/*` for APY/farming questions
- **Difficulty tuning**: Weights in scoring formula should be calibrated with real player data
- **Topic weight tuning**: Weight factors (40/30/30 split) should be validated with real usage data
- **Pool quality thresholds**: Current thresholds (30+ days history, 10+ protocols for chains) may need adjustment based on data quality issues encountered
- **Practice mode**: Replay past episodes
- **Archives**: Browse historical episodes
