# DeFidle Implementation Plan

This document outlines a phased approach to implementing DeFidle, a daily DeFi quiz game powered by DefiLlama data.

---

## Overview

DeFidle consists of four major systems:
1. **Data Layer** — Topic pools, DefiLlama API integration, caching
2. **Generation Engine** — Question templates, episode assembly, LLM integration
3. **Infrastructure** — GitHub Actions, static file storage, deployment
4. **Client** — Next.js frontend for playing episodes

The implementation is divided into **5 phases**, ordered by dependency and risk. Each phase produces a working increment.

---

## Phase 1: Foundation & Data Layer

**Goal**: Establish core data infrastructure and validate DefiLlama API integration.

### 1.1 Project Structure Setup

- [ ] Create directory structure:
  ```
  /data/
    pools/
      protocols.json
      chains.json
    llm-cache/
    overrides.json
  /scripts/
    refresh-pools.ts
    generate-episode.ts
  /lib/
    api/
      defillama.ts
    generation/
    types/
  /public/
    episodes/
  ```
- [ ] Configure TypeScript for scripts (separate tsconfig for Node.js execution)
- [ ] Add required dependencies: `openai`, date utilities, crypto for hashing

### 1.2 DefiLlama API Client

- [ ] Implement `lib/api/defillama.ts` with typed clients for:
  - `GET /api/protocols` — protocol list with TVL, category, chains
  - `GET /api/protocol/{slug}` — protocol detail with TVL history
  - `GET /api/v2/chains` — chain list with TVL
  - `GET /api/v2/historicalChainTvl/{chain}` — chain TVL history
  - `GET /api/overview/fees/{chain}` — fees leaderboard
  - `GET /api/summary/fees/{protocol}` — protocol fees/revenue
  - `GET /api/overview/dexs/{chain}` — DEX volume leaderboard
- [ ] Add error handling, timeouts, and retry logic
- [ ] Create TypeScript types for all API responses
- [ ] Write integration tests against live API (can be skipped in CI)

### 1.3 Topic Pool System

- [ ] Define pool entry schemas (`ProtocolPoolEntry`, `ChainPoolEntry`)
- [ ] Implement `scripts/refresh-pools.ts`:
  - Fetch top 150 protocols, top 50 chains
  - Compute quality signals (hasFeesData, historyDays, etc.)
  - Apply quality thresholds (30+ days history, etc.)
  - Apply overrides (blocklist, forceInclude)
  - Rank and trim to top 100 protocols, top 30 chains
  - Write to `/data/pools/*.json`
- [ ] Create initial `overrides.json` with empty blocklists
- [ ] Run pool refresh manually, validate output

### 1.4 Deterministic RNG Utilities

- [ ] Implement `lib/generation/rng.ts`:
  - `seedFromParts(...parts: string[]): number` — stable hash
  - `createRng(seed: number): () => number` — deterministic PRNG
  - `deterministicShuffle<T>(items: T[], ...seedParts: string[]): T[]`
- [ ] Write unit tests verifying determinism (same inputs → same outputs)

### 1.5 Topic Selection Algorithm

- [ ] Implement `lib/generation/topic-selection.ts`:
  - `selectTopic(date: string, type: "protocol" | "chain"): Topic`
  - Weight calculation: TVL rank (40%), data quality (30%), diversity bonus (30%)
  - Cooldown penalty system (14 days protocols, 10 days chains)
  - Same-week hard constraint
- [ ] Write unit tests for weight calculation and cooldown logic

**Phase 1 Deliverables**:
- Working DefiLlama API client with types
- Pool refresh script that produces valid JSON
- Deterministic topic selection for any date

---

## Phase 2: Question Templates & Difficulty System

**Goal**: Implement all 12 question templates with difficulty scoring.

### 2.1 Core Types & Interfaces

- [ ] Define `lib/types/episode.ts`:
  - `Episode`, `Question`, `QuestionFormat`
  - `DifficultyTarget`, `DifficultySignals`
  - `TemplateContext`, `QuestionDraft`
- [ ] Define `lib/types/template.ts`:
  - `Template` interface with `checkPrereqs`, `proposeFormats`, `instantiate`

### 2.2 Difficulty Scoring System

- [ ] Implement `lib/generation/difficulty.ts`:
  - `computeDifficulty(signals: DifficultySignals): number`
  - Format factors: tf=0.15, ab=0.30, mc4=0.45, mc6=0.55, rank4=0.70
  - Familiarity factors based on TVL rank bucket
  - Margin factor: `clamp(1 - margin/0.30, 0, 1)`
  - Target bands: easy=[0, 0.38], medium=[0.30, 0.68], hard=[0.60, 1.0]
  - `matchesTarget(score, target): boolean`
- [ ] Write unit tests for scoring edge cases

### 2.3 Data Helpers

- [ ] Implement `lib/generation/metrics.ts`:
  - `percentChange(series, days): number | null`
  - `abMargin(a, b): number | null`
  - `top2Margin(sortedDesc): number | null`
  - `volatilityScore(series, windowDays): number | null`
  - `sumLastN(series, n): number`
- [ ] Write unit tests with sample data

### 2.4 Protocol Templates (P1-P6)

Implement each template as a class implementing `Template` interface:

- [ ] **P1: Protocol Fingerprint Guess**
  - Prereqs: has category, chains, tvl
  - Formats: mc6 → mc4
  - Clue generation: category, chain count bucket, TVL band, 7d change
  
- [ ] **P2: Cross-Chain Dominance**
  - Prereqs: currentChainTvls with ≥2 chains
  - Formats: ab → tf
  - Chain pair selection with margin threshold
  
- [ ] **P3: Top Chain Concentration**
  - Prereqs: currentChainTvls
  - Formats: mc4 (buckets) → tf
  - Bucket selection: <25%, 25-50%, 50-75%, >75%
  
- [ ] **P4: ATH Timing**
  - Prereqs: tvl[] series ≥6 months, ATH not current month
  - Formats: mc4 (months) → tf
  - Month distractor generation (adjacent months)
  
- [ ] **P5: Fees vs Revenue**
  - Prereqs: fees data available
  - Formats: ab → mc4 (ratio buckets) → tf
  - Ratio buckets: <10%, 10-30%, 30-60%, >60%
  
- [ ] **P6: TVL Trend**
  - Prereqs: tvl series or change_7d available
  - Formats: tf → mc4 (buckets) → ab
  - Change buckets: down >10%, down 1-10%, flat, up 1-10%, up >10%

### 2.5 Chain Templates (C1-C6)

- [ ] **C1: Chain Fingerprint Guess**
  - Prereqs: chain in /api/v2/chains
  - Formats: mc6 → mc4
  - Clues: TVL rank, TVL band, token symbol, 30d trend
  
- [ ] **C2: Chain TVL Comparison**
  - Prereqs: comparison chain with margin ≥25%
  - Formats: ab → bucketed
  
- [ ] **C3: Chain ATH Timing**
  - Prereqs: historical series ≥6 months
  - Formats: mc4 (months) → tf
  
- [ ] **C4: Chain Growth Ranking**
  - Prereqs: change30d for 4+ chains
  - Formats: rank4 → mc4 → ab
  
- [ ] **C5: Top Protocol by Fees**
  - Prereqs: ≥4 protocols in fees leaderboard
  - Formats: mc4 → ab
  
- [ ] **C6: Top DEX by Volume**
  - Prereqs: ≥4 DEXes in volume leaderboard
  - Formats: mc4 → ab

### 2.6 Distractor Selection

- [ ] Implement `lib/generation/distractors.ts`:
  - `pickEntityDistractors(correctId, pool, constraints, seed): Entity[] | null`
  - `makeNumericChoices(correctValue, nearbyValues, mode, seed): string[] | null`
  - `makeTimingDistractors(correctMonth, count, seed): string[]`
- [ ] Ensure diversity constraints (not all same category, etc.)

**Phase 2 Deliverables**:
- All 12 templates implemented and individually testable
- Difficulty scoring system
- Distractor generation utilities

---

## Phase 3: Episode Assembly & Generation Engine

**Goal**: Assemble complete episodes from templates with proper slot assignment.

### 3.1 Episode Type Scheduling

- [ ] Implement `lib/generation/schedule.ts`:
  - Map day of week to episode type
  - Sun/Mon/Wed/Fri → Protocol
  - Tue/Thu/Sat → Chain

### 3.2 Template Matrices

- [ ] Define slot-to-template mappings in `lib/generation/matrices.ts`:
  ```typescript
  PROTOCOL_MATRIX = {
    A: [P1],
    B: [P2, P3],
    C: [P5, P4],
    D: [P4, P5, P2],
    E: [P6, P3, P5]
  }
  CHAIN_MATRIX = {
    A: [C1],
    B: [C2],
    C: [C5, C6],
    D: [C3, C4],
    E: [C6, C5, C2]
  }
  ```

### 3.3 Slot Selection Algorithm

- [ ] Implement `lib/generation/slot-selection.ts`:
  - `selectQuestionForSlot(slot, templates, ctx, target, seed, usedTemplates, buildLog)`
  - Try templates in priority order
  - Check prerequisites
  - Try formats in preference order
  - Compute difficulty and check against target
  - Apply format adjustment if needed
  - Track used templates to avoid duplicates

### 3.4 Post-Balance Pass

- [ ] Implement post-assembly validation:
  - Max 1 high-volatility question per episode
  - Convert excess high-vol questions to bucket format
  - Ensure difficulty mix is roughly correct (1 easy, 2 medium, 1 hard, 1 easy)

### 3.5 Build Log System

- [ ] Define `BuildLogEntry` schema
- [ ] Log all decisions: selected, skip, reject, adjusted, fallback
- [ ] Include in episode JSON for debugging (optional, can strip in prod)

### 3.6 Episode Generator Entry Point

- [ ] Implement `lib/generation/generate-episode.ts`:
  - Determine episode type from date
  - Select topic
  - Fetch all required data
  - Compute derived metrics
  - Iterate through slots, select questions
  - Run post-balance pass
  - Return assembled episode (without LLM text yet)
- [ ] Write integration tests generating episodes for multiple dates

**Phase 3 Deliverables**:
- Complete episode generation (data + questions, no LLM text)
- Build log for debugging
- Deterministic: same date always produces same episode structure

---

## Phase 4: LLM Integration & Storage

**Goal**: Add LLM-generated explanations and implement episode storage.

### 4.1 LLM Client

- [ ] Implement `lib/llm/client.ts`:
  - OpenAI client configuration (gpt-4o-mini)
  - Explanation generation with temperature=0.3, max_tokens=150
  - Optional prompt rephrasing with temperature=0.5
  - Timeout handling (10s default)
  - Retry logic (max 2 retries)

### 4.2 LLM Caching

- [ ] Implement `lib/llm/cache.ts`:
  - Cache key: `date|type|topic|slot|templateId|contentType|dataHash`
  - `hashData(data): string` — deterministic SHA-256 hash
  - Load/save cache from `/data/llm-cache/{YYYY-MM}.json`
  - Cache lookup before LLM call
  - Cache write after successful LLM call

### 4.3 Template-Based Fallbacks

- [ ] Implement `lib/llm/fallbacks.ts`:
  - `EXPLANATION_TEMPLATES` map with placeholders
  - `generateFallbackExplanation(templateId, data): string`
- [ ] Trigger fallback on: API error, timeout, validation failure, SKIP_LLM=true

### 4.4 Text Generation Integration

- [ ] Implement `lib/generation/text.ts`:
  - `generateQuestionText(questions, ctx): Promise<Question[]>`
  - For each question: generate explanation (LLM or fallback)
  - Mark `llmFallback: true` if fallback used

### 4.5 Episode Storage

- [ ] Implement `lib/storage/episodes.ts`:
  - `saveEpisode(episode): void` — write to `/public/episodes/{YYYY-MM}/{DD}.json`
  - `loadEpisode(date): Episode | null` — read episode for date
  - Create directories as needed

### 4.6 Generation Script

- [ ] Complete `scripts/generate-episode.ts`:
  - Accept date argument (default: today)
  - Run full generation pipeline
  - Save episode JSON
  - Update LLM cache
  - Exit with appropriate code on failure
- [ ] Add `npm run generate` script

**Phase 4 Deliverables**:
- Complete episode generation with LLM explanations
- Deterministic caching for reproducibility
- Graceful fallbacks when LLM fails
- Episodes saved as static JSON files

---

## Phase 5: Client & Infrastructure

**Goal**: Build the frontend and set up automated generation.

### 5.1 GitHub Actions: Pool Refresh

- [ ] Create `.github/workflows/refresh-pools.yml`:
  - Schedule: Sundays 00:00 UTC
  - Run `npm run refresh-pools`
  - Commit and push changes to main
  - Manual trigger option

### 5.2 GitHub Actions: Daily Generation

- [ ] Create `.github/workflows/generate-episode.yml`:
  - Schedule: Daily 00:00 UTC
  - Run `npm run generate`
  - Commit episode JSON to main
  - Trigger Vercel deploy on commit
- [ ] Add secrets: OPENAI_API_KEY

### 5.3 Client: Episode Fetching

- [ ] Implement `lib/client/episode.ts`:
  - `fetchTodayEpisode(): Promise<Episode>`
  - Construct path from current UTC date
  - Fetch from `/episodes/{YYYY-MM}/{DD}.json`
  - Handle 404 (episode not generated)

### 5.4 Client: Game State

- [ ] Implement `lib/client/game-state.ts`:
  - Session-only state (no persistence)
  - Track current question index
  - Track answers given
  - Track correct/incorrect counts

### 5.5 Client: UI Components

- [ ] **QuestionCard** — displays prompt, clues, choices
- [ ] **ChoiceButton** — selectable answer option
- [ ] **ExplanationPanel** — shown after answering
- [ ] **ResultsSummary** — "You got X/Y correct"
- [ ] **LoadingState** — while fetching episode
- [ ] **ErrorState** — episode not found or fetch failed

### 5.6 Client: Game Flow

- [ ] Implement main game page (`app/page.tsx`):
  - Fetch episode on mount
  - Display questions sequentially
  - After each answer: reveal correct answer, show explanation
  - After all questions: show results summary
  - Option to review all questions/answers

### 5.7 Styling

- [ ] Design responsive layout (mobile-first)
- [ ] Dark mode support (optional)
- [ ] Animations for answer reveal

### 5.8 Testing & Polish

- [ ] Add loading skeletons
- [ ] Error boundaries
- [ ] Test with generated episodes
- [ ] Manual QA across question types

**Phase 5 Deliverables**:
- Automated pool refresh and episode generation
- Playable client fetching daily episodes
- Zero runtime API calls (fully static)

---

## Post-Launch: Monitoring & Iteration

### Monitoring

- [ ] Monitor GitHub Actions for failures
- [ ] Add simple analytics (page views, completion rate) via Vercel Analytics
- [ ] Review build logs for question quality issues

### Iteration Opportunities

- [ ] Tune difficulty weights based on player feedback
- [ ] Tune topic selection weights
- [ ] Add more templates for variety
- [ ] Practice mode (replay past episodes)
- [ ] Archives page (browse historical episodes)

---

## Dependency Graph

```
Phase 1 (Foundation)
    │
    ├──▶ Phase 2 (Templates)
    │         │
    │         ├──▶ Phase 3 (Assembly)
    │         │         │
    │         │         └──▶ Phase 4 (LLM & Storage)
    │         │                   │
    │         │                   └──▶ Phase 5 (Client & Infra)
    │         │
    │         └──▶ Phase 4 (can start distractor work early)
    │
    └──▶ Phase 5 (GitHub Actions setup can start early)
```

Phases 1-4 are strictly sequential for the generation pipeline. Phase 5 client work can begin once Phase 4 produces valid episode JSON. GitHub Actions configuration can be drafted early.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| DefiLlama API instability | Retry logic, skip generation on failure, manual trigger option |
| LLM rate limits / outages | Template-based fallbacks, seed-based caching |
| Question quality issues | Build logs, manual review of first episodes |
| Tight margins causing unfair questions | Format degradation, margin thresholds, post-balance pass |
| Topic pool staleness | Weekly refresh, manual override system |

---

## Success Criteria

- [ ] Episodes generate deterministically (same date → same episode)
- [ ] All 12 templates produce valid questions
- [ ] Difficulty distribution matches targets (1E, 2M, 1H, 1E)
- [ ] LLM fallbacks work when OpenAI is unavailable
- [ ] Client loads and plays episodes without runtime API calls
- [ ] GitHub Actions run reliably on schedule
