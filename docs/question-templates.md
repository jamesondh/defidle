# Question Templates

This document defines the 12 question templates used in DeFidle: 6 for protocol episodes (P1-P6) and 6 for chain episodes (C1-C6).

> **Note**: All templates use **free DefiLlama API endpoints only**. No Pro API key required.
> See `defillama-api.md` for endpoint details and which are free vs paid.

Each template specifies:
- **Prompt**: What the player is asked
- **API data**: Which endpoints provide the answer
- **Formats**: Valid question formats (with degradation order)
- **Computed fields**: Derived values used for the question
- **Fallbacks**: What to do when data is missing or margins are too tight
- **Difficulty factors**: What makes this question easier or harder

## Conventions

**Margin calculations:**
- A/B margin: `abs(a - b) / max(a, b)`
- Top-2 margin: `(v1 - v2) / v1`

**Margin thresholds:**
- Easy: margin ≥ 25%
- Medium: margin 10-25%
- Hard: margin 5-15% (only for stable metrics)

**Format degradation order:**
```
mc6 → mc4 → ab → tf
rank4 → mc4 → ab
```

> **Note**: `write_in` (free-form text input) is deferred to v2+. See SPEC.md for rationale.

---

## Protocol Templates (P1-P12)

### P1: Protocol Fingerprint Guess

Identify a protocol from a set of clues about its characteristics.

**Prompt**: "Which protocol matches these clues?"

**Clues** (reveal 3-5):
- Category (e.g., "DEX", "Lending", "Yield")
- Chain count bucket ("single-chain", "2-5 chains", "10+ chains")
- TVL band ("$100M-$500M", "$1B+")
- 7d TVL change bucket ("up >10%", "roughly flat", "down >10%")
- Optional: Sparkline shape ("steady", "recent spike", "declining")

**API data**:
- `GET /api/protocols` → `category`, `chains`, `tvl`, `change_7d`
- `GET /api/protocol/{slug}` → `tvl[]` series (for sparkline)

**Formats**: `mc6` → `mc4`

**Computed fields**:
- `tvlRankBucket`: top_10, top_25, top_100, long_tail
- `tvlBand`: derived from TVL value
- `chainCountBucket`: 1, 2-5, 6-10, 10+
- `changeBucket`: up_strong, up_moderate, flat, down_moderate, down_strong

**Fallbacks**:
- If `tvl[]` missing → drop sparkline clue
- If protocol is obscure (rank > 100) → use `mc4` with easier clues
- If chain count = 1 → explicitly state "single-chain protocol"

**Difficulty factors**:
- Familiarity (TVL rank) — higher rank = easier
- Format — mc6 harder than mc4
- Clue specificity — more unique clues = easier

---

### P2: Cross-Chain Dominance

Compare a protocol's TVL across two chains.

**Prompt**: "Does {protocol} have higher TVL on {chainA} or {chainB}?"

**API data**:
- `GET /api/protocol/{slug}` → `currentChainTvls`

**Formats**: `ab` → `tf` (with "about equal" option)

**Computed fields**:
- `tvlA`: TVL on chain A
- `tvlB`: TVL on chain B
- `margin`: A/B margin between the two

**Fallbacks**:
- If fewer than 2 chains → switch to P3 (single-chain variant)
- If margin < 10% → add "about equal" as third option or use bucketed format

**Difficulty factors**:
- Margin — larger margin = easier
- Chain familiarity — comparing Ethereum vs Arbitrum easier than obscure L2s

---

### P3: Top Chain Concentration

What share of a protocol's TVL is on its dominant chain?

**Prompt**: "What share of {protocol}'s TVL is on its top chain ({topChain})?"

**Choices**: `<25%`, `25-50%`, `50-75%`, `>75%`

**API data**:
- `GET /api/protocol/{slug}` → `currentChainTvls`

**Formats**: `mc4` (buckets)

**Computed fields**:
- `topChain`: chain with highest TVL
- `topChainTvl`: TVL on that chain
- `totalTvl`: sum of all chain TVLs
- `topShare`: `topChainTvl / totalTvl`

**Fallbacks**:
- If only 1 chain → switch to T/F: "Is >90% of {protocol}'s TVL on {chain}?"

**Difficulty factors**:
- Proximity to bucket boundary — if topShare is 74%, harder than if it's 90%
- Number of chains — more chains = less obvious answer

---

### P4: ATH Timing

When did a protocol reach its all-time high TVL?

**Prompt variations**:
- "In what month did {protocol} hit its ATH TVL?"
- "In what quarter did {protocol} reach peak TVL?"
- T/F: "Did {protocol} set a new 90-day high this month?"

**API data**:
- `GET /api/protocol/{slug}` → `tvl[]` series

**Formats**: `mc4` (months/quarters) → `tf` (recent high check)

**Computed fields**:
- `athValue`: maximum `totalLiquidityUSD` in series
- `athDate`: timestamp of ATH
- `athMonth`: formatted as "YYYY-MM" or "Mon YYYY"
- `athQuarter`: formatted as "Q1 2024"
- `newHighIn90d`: boolean

**Distractors**: Adjacent months/quarters (±1-3 periods) — not random dates

**Fallbacks**:
- If history < 6 months → switch to T/F: "New 90d high this month?"
- If ATH was very recent (last 30d) → ask about previous ATH or use T/F

**Difficulty factors**:
- Time granularity — quarter easier than month
- Recency — recent ATH easier to remember
- Format — T/F easiest, exact month hardest

---

### P5: Fees vs Revenue

Compare a protocol's fees and revenue metrics.

**Prompt variations**:
- "Over the last 7 days, did {protocol} generate more in fees or revenue?"
- "What percentage of {protocol}'s fees became protocol revenue?" (bucketed)
- T/F: "Does {protocol} have non-zero protocol revenue this week?"

**API data**:
- `GET /api/summary/fees/{slug}?dataType=dailyFees`
- `GET /api/summary/fees/{slug}?dataType=dailyRevenue`

**Formats**: `ab` → `mc4` (ratio buckets) → `tf`

**Computed fields**:
- `fees7d`: sum of last 7 days of fees
- `rev7d`: sum of last 7 days of revenue
- `revToFeesRatio`: `rev7d / fees7d`
- `hasRevenue`: boolean (rev7d > 0)

**Ratio buckets**: `<10%`, `10-30%`, `30-60%`, `>60%`

**Fallbacks**:
- If revenue = 0 → switch to T/F: "Does {protocol} have non-zero revenue?"
- If fees endpoint unavailable → skip this template

**Difficulty factors**:
- Ratio proximity to bucket boundary
- Whether fees vs revenue is "obvious" for the protocol type

---

### P6: TVL Trend

Did a protocol's TVL increase or decrease over a given period?

**Prompt variations**:
- T/F: "Did {protocol}'s TVL increase over the past 7 days?"
- "What was {protocol}'s approximate TVL change over the past 30 days?" (bucketed MC)
- A/B: "Did {protocol}'s TVL change more in the past 7 days or 30 days?"

**API data** (free endpoints):
- `GET /api/protocols` → `change_1d`, `change_7d`
- `GET /api/protocol/{slug}` → `tvl[]` series for custom period calculations

**Formats**: `tf` → `mc4` (buckets) → `ab`

**Semantic topics**: `tvl_trend_7d`, `tvl_direction` (shared with P15 to prevent duplicates)

**Computed fields**:
- `change1d`: 1-day TVL percentage change
- `change7d`: 7-day TVL percentage change  
- `change30d`: calculated from TVL series
- `trendDirection`: "increased" | "decreased" | "flat"
- `changeBucket`: "down >20%", "down 5-20%", "roughly flat (±5%)", "up 5-20%", "up >20%"

**Buckets for MC4**: `Down >10%`, `Down 1-10%`, `Roughly flat`, `Up 1-10%`, `Up >10%`

**Fallbacks**:
- If TVL series too short → use only `change_7d` from `/api/protocols`
- If change is near bucket boundary (±2%) → use T/F format instead

**Difficulty factors**:
- Proximity to bucket boundary — 9% change is harder to categorize than 25%
- Volatility — protocols with erratic TVL are harder
- Time period — 7d easier than 30d (more recent, memorable)

---

### P7: Category Identification

Identify a protocol's category.

**Prompt**: "Which category is {protocol}?"

**API data**:
- `GET /api/protocols` → `category`

**Formats**: `mc4` → `mc6`

**Semantic topics**: `category_identification`

**Computed fields**:
- `category`: protocol's category (e.g., "Dexes", "Lending", "Bridge")

**Distractors**: Categories from protocols with similar TVL rank (nearby in leaderboard)

**Prerequisites**:
- Protocol must have a category
- **Name-answer leakage check**: Template is skipped if the protocol name contains keywords that reveal the category. For example:
  - "Jupiter **Lend**" → "Lending" (skipped - "lend" reveals answer)
  - "Uni**swap**" → "Dexes" (skipped - "swap" reveals answer)
  - "Across **Bridge**" → "Bridge" (skipped - "bridge" reveals answer)
  - "Aave" → "Lending" (allowed - name doesn't reveal category)

**Fallbacks**:
- If protocol category is rare/unique → use broader category groupings

**Difficulty factors**:
- Category ambiguity — some protocols span multiple categories
- Protocol familiarity — well-known protocols easier

---

### P8: Chain Membership

Check if a protocol is deployed on a specific chain.

**Prompt variations**:
- "Which chain is {protocol} deployed on?" (MC4)
- "Is {protocol} deployed on {chainX}?" (TF)

**API data**:
- `GET /api/protocol/{slug}` → `chains`
- `GET /api/protocols` → `chains`

**Formats**: `mc4` → `tf`

**Computed fields**:
- `chains`: list of chains the protocol is deployed on
- `chainCount`: number of chains
- `isDeployedOn(chain)`: boolean check

**Distractors** (for MC4): Mix of chains the protocol IS on and popular chains it's NOT on

**Fallbacks**:
- For TF version: intentionally pick present/absent chains for balanced True/False distribution

**Difficulty factors**:
- Protocol familiarity — flagship chains easier to recall
- Chain count — protocols on many chains have more possible "yes" answers

---

### P9: Top Chain Name

Which chain has the most TVL for a multi-chain protocol?

**Prompt**: "On which chain does {protocol} have the most TVL?"

**API data**:
- `GET /api/protocol/{slug}` → `currentChainTvls`

**Formats**: `mc4`

**Computed fields**:
- `topChain`: chain with highest TVL
- `chainTvls`: sorted list of chain → TVL pairs
- `top2Margin`: margin between #1 and #2

**Distractors**: Other chains the protocol is deployed on (or common L1/L2s if sparse)

**Fallbacks**:
- If only 1-2 chains → use TF: "Does {protocol} have more TVL on {chainA} than {chainB}?"
- If top2 margin < 15% → add margin note in explanation

**Difficulty factors**:
- Top-2 margin — larger = easier
- Chain familiarity — Ethereum vs L2s often predictable

---

### P10: TVL Band

Which TVL range fits a protocol?

**Prompt**: "Which TVL range fits {protocol}?"

**Choices**: `<$50M`, `$50M-$250M`, `$250M-$1B`, `$1B-$5B`, `>$5B`

**API data**:
- `GET /api/protocols` → `tvl`

**Formats**: `mc4`

**Computed fields**:
- `tvl`: current total TVL
- `tvlBand`: bucket the TVL falls into

**Distractors**: Adjacent TVL bands

**Fallbacks**:
- If TVL near bucket boundary (within 5%) → widen buckets or add margin note

**Difficulty factors**:
- Proximity to bucket boundary
- Protocol familiarity — easier if player knows rough size

---

### P11: Fees Trend

Did a protocol's fees increase or decrease over a period?

**Prompt variations**:
- TF: "Did {protocol} fees rise over the last month?"
- MC4 (buckets): "How did {protocol}'s fees change over the past 30 days?"

**Buckets**: `Down >20%`, `Down 5-20%`, `Roughly flat`, `Up 5-20%`, `Up >20%`

**API data**:
- `GET /api/summary/fees/{slug}?dataType=dailyFees`

**Formats**: `tf` → `mc4` (buckets)

**Computed fields**:
- `fees30dAgo`: fees from 30 days ago
- `feesNow`: recent fees (7d average)
- `feesTrend`: percentage change
- `trendDirection`: "increased" | "decreased" | "flat"

**Fallbacks**:
- If fees data sparse (< 30 days) → use 7d trend or skip template
- If change near bucket boundary → use TF format

**Difficulty factors**:
- Volatility — protocols with erratic fees harder
- Market conditions — trending markets make direction clearer

---

### P12: DEX Volume Trend

Did a DEX's volume increase or decrease? (Only for DEX protocols)

**Prompt**: "Did {protocol}'s trading volume increase over the past 7 days?"

**API data**:
- `GET /api/summary/dexs/{slug}`

**Formats**: `tf` → `mc4` (buckets)

**Computed fields**:
- `volume7dAgo`: volume from 7 days ago
- `volumeNow`: recent volume
- `volumeTrend`: percentage change
- `trendDirection`: "increased" | "decreased" | "flat"

**Prerequisites**:
- Protocol must be a DEX (category = "Dexes")
- Protocol must have volume data available

**Fallbacks**:
- If no volume data → skip template entirely

**Difficulty factors**:
- Volume volatility — DEX volumes can swing wildly
- Market conditions — clear bull/bear trends make direction predictable

---

### P13: TVL Rank Comparison

Compare a protocol's TVL rank to another similar protocol. Works well for single-chain protocols.

**Prompt variations**:
- "Which protocol has higher TVL?" (AB)
- "{protocol} has higher TVL than {other}." (TF)

**API data**:
- `GET /api/protocols` → protocol list with TVL

**Formats**: `ab` → `tf`

**Computed fields**:
- `topicRank`: topic's TVL rank
- `compareRank`: comparison protocol's rank

**Distractors**: Protocols within ±20 rank positions

**Prerequisites**:
- Protocol list with at least 10 entries

**Fallbacks**:
- None — works with minimal data

**Difficulty factors**:
- Rank difference — larger gap = easier
- Protocol familiarity

---

### P14: Category Leader Comparison

Compare protocol to others in the same category. Works well for single-chain protocols.

**Prompt variations**:
- "Which protocol has the most TVL in {category}?" (MC4)
- "Which {category} protocol has higher TVL?" (AB)
- "{protocol} is the #1 {category} protocol by TVL." (TF)

**API data**:
- `GET /api/protocols` → protocol list with categories and TVL

**Formats**: `ab` → `mc4` → `tf`

**Computed fields**:
- `category`: protocol's category
- `topicCategoryRank`: position within category
- `categoryLeader`: #1 protocol in category

**Distractors**: Other protocols from the same category

**Prerequisites**:
- Protocol has a category
- At least 2 other protocols in the same category

**Fallbacks**:
- If only 1 other in category → use AB format

**Difficulty factors**:
- TVL gap between top protocols in category
- Category size — more protocols = more distractors

---

### P15: Recent TVL Direction

Simple question about protocol's recent TVL trend. Works with minimal history.

**Prompt variations**:
- "Over the past {period}, did {protocol}'s TVL increase or decrease?" (AB)
- "{protocol}'s TVL has increased over the past {period}." (TF)
- "How did {protocol}'s TVL change over the past {period}?" (MC4 buckets)

**API data**:
- `GET /api/protocol/{slug}` → `tvl[]` or `change_7d` from list

**Formats**: `ab` → `tf` → `mc4` (buckets)

**Semantic topics**: `tvl_trend_7d`, `tvl_direction` (shared with P6 to prevent duplicates)

**Buckets for MC4**: `Down >10%`, `Down 5-10%`, `Roughly flat`, `Up 5-10%`, `Up >10%`

**Computed fields**:
- `change7d`: 7-day TVL change
- `change30d`: 30-day TVL change
- `direction`: "increased" | "decreased"

**Prerequisites**:
- At least 7d or 30d change data available
- Change magnitude > 2% (to avoid ambiguous "flat" answers)

**Fallbacks**:
- Uses 7d data preferentially, falls back to 30d

**Difficulty factors**:
- Magnitude of change — larger swings easier
- Volatility — erratic protocols harder
- Familiarity with protocol

---

## Chain Templates (C1-C9)

### C1: Chain Fingerprint Guess

Identify a chain from a set of clues.

**Prompt**: "Which chain matches these clues?"

**Clues** (reveal 3-4):
- TVL rank bucket ("top 5", "top 10", "top 20")
- TVL band ("$1B-$5B", "$10B+")
- Native token symbol (e.g., "ETH", "SOL", "AVAX")
- 30d TVL trend ("up >20%", "roughly flat", "down >10%")

**API data**:
- `GET /api/v2/chains` → `tvl`, `tokenSymbol`
- `GET /api/v2/historicalChainTvl/{chain}` → 30d trend

**Formats**: `mc6` → `mc4`

**Computed fields**:
- `tvlRank`: position in chain TVL ranking
- `tvlRankBucket`: top_5, top_10, top_20, other
- `tvlBand`: derived from TVL
- `change30d`: percentage change over 30 days
- `trendBucket`: up_strong, up_moderate, flat, down_moderate, down_strong

**Fallbacks**:
- If historical data missing → drop 30d trend clue
- If multiple chains share token symbol → use `mc4` with additional clues

**Difficulty factors**:
- Chain familiarity — Ethereum/Solana easier than obscure L2s
- Clue uniqueness — unique token symbol = easier

---

### C2: Chain TVL Comparison

Compare TVL between two chains.

**Prompt**: "Which chain has higher TVL: {chainA} or {chainB}?"

**API data**:
- `GET /api/v2/chains`

**Formats**: `ab` → bucketed ("much higher", "somewhat higher", "about equal")

**Computed fields**:
- `tvlA`: chain A's TVL
- `tvlB`: chain B's TVL
- `margin`: A/B margin

**Fallbacks**:
- If margin < 10% → add "about equal" option or use buckets

**Difficulty factors**:
- Margin — larger = easier
- Chain familiarity — well-known chains easier

---

### C3: Chain ATH Timing

When did a chain reach its ATH TVL?

**Prompt variations**:
- "In what month did {chain} hit its ATH TVL?"
- T/F: "Did {chain} set a new 90-day TVL high this month?"

**API data**:
- `GET /api/v2/historicalChainTvl/{chain}`

**Formats**: `mc4` (months) → `tf`

**Computed fields**:
- `athValue`: maximum TVL in series
- `athDate`: timestamp of ATH
- `athMonth`: formatted month
- `newHighIn90d`: boolean

**Distractors**: Adjacent months (±1-3)

**Fallbacks**:
- If history too short → T/F format only

**Difficulty factors**:
- Same as P4

---

### C4: Chain Growth Ranking

Rank chains by recent TVL growth.

**Prompt**: "Order these 4 chains by 30-day TVL change (highest to lowest)"

**API data**:
- `GET /api/v2/historicalChainTvl/{chain}` for each chain

**Formats**: `rank4` → `mc4` ("which grew most?") → `ab`

**Computed fields**:
- `change30d` for each chain
- `separations`: gaps between adjacent ranks

**Fallbacks**:
- If separations too tight (ranks within 5%) → switch to "which grew most?" (single pick)
- If only 2-3 valid candidates → use A/B format

**Difficulty factors**:
- Separation between ranks — larger gaps = easier
- Volatility of growth metrics

---

### C5: Top Protocol by Fees

Which protocol generates the most fees on a given chain?

**Prompt**: "Which protocol is #1 by 24h fees on {chain}?"

**API data**:
- `GET /api/overview/fees/{chain}`

**Formats**: `mc4` → `ab` (top 2)

**Computed fields**:
- `topProtocol`: highest fees protocol
- `top2Margin`: margin between #1 and #2
- `leaderboard`: sorted list of protocols by fees

**Distractors**: Other protocols from the chain's fees leaderboard

**Fallbacks**:
- If fewer than 4 protocols with fees data → use A/B (top 2)
- If top2 margin < 10% → use A/B with "too close to call" option

**Difficulty factors**:
- Top-2 margin — larger = easier
- Chain activity — more active chains have clearer leaders

---

### C6: Top DEX by Volume

Which DEX has the highest volume on a given chain?

**Prompt**: "Which DEX is #1 by 24h volume on {chain}?"

**API data**:
- `GET /api/overview/dexs/{chain}`

**Formats**: `mc4` → `ab` (top 2)

**Computed fields**:
- `topDex`: highest volume DEX
- `top2Margin`: margin between #1 and #2
- `leaderboard`: sorted list of DEXes by volume

**Distractors**: Other DEXes from the chain's volume leaderboard

**Fallbacks**:
- If sparse DEX data → fall back to C5 (fees)
- If top2 margin < 10% → use A/B format

**Difficulty factors**:
- Same as C5

---

### C7: Chain TVL Band

Which TVL range fits a chain?

**Prompt**: "Which TVL range fits {chain}?"

**Choices**: `<$100M`, `$100M-$500M`, `$500M-$2B`, `$2B-$10B`, `>$10B`

**API data**:
- `GET /api/v2/chains` → `tvl`

**Formats**: `mc4`

**Computed fields**:
- `tvl`: chain's total TVL
- `tvlBand`: bucket the TVL falls into

**Distractors**: Adjacent TVL bands

**Fallbacks**:
- If TVL near bucket boundary → widen buckets or add margin note

**Difficulty factors**:
- Proximity to bucket boundary
- Chain familiarity

---

### C8: 30-Day Direction

Did a chain's TVL increase or decrease over the last 30 days?

**Prompt variations**:
- TF: "Did {chain} TVL increase over the last 30 days?"
- AB: "Over the last 30d, did {chain} TVL increase or decrease?"

**API data**:
- `GET /api/v2/historicalChainTvl/{chain}`

**Formats**: `ab` → `tf`

**Computed fields**:
- `tvl30dAgo`: TVL from 30 days ago
- `tvlNow`: current TVL
- `change30d`: percentage change
- `direction`: "increased" | "decreased"

**Fallbacks**:
- If change < 2% → use "roughly flat" option or skip

**Difficulty factors**:
- Magnitude of change — larger swings easier to track
- Chain activity/news — memorable events make direction clearer

---

### C9: Distance from ATH

How close is a chain to its all-time high TVL?

**Prompt variations**:
- TF: "Is {chain} within 10% of its ATH TVL?"
- MC4 (buckets): "How far is {chain} from its ATH TVL?"

**Buckets**: `At ATH`, `Within 10%`, `10-30% below`, `30-60% below`, `>60% below`

**API data**:
- `GET /api/v2/historicalChainTvl/{chain}`

**Formats**: `tf` → `mc4` (buckets)

**Computed fields**:
- `athValue`: maximum TVL in history
- `athDate`: when ATH occurred
- `currentTvl`: current TVL
- `athDistance`: `(athValue - currentTvl) / athValue` as percentage
- `isWithin10Pct`: boolean

**Fallbacks**:
- If history < 90 days → skip template
- If at or very near ATH → use TF format

**Difficulty factors**:
- Market cycle awareness — bear market = most chains far from ATH
- Proximity to bucket boundary

---

### C10: Protocol Count

How many protocols are deployed on a given chain?

**Prompt**: "How many protocols are deployed on {chain}?"

**Choices**: `<50`, `50-100`, `100-250`, `>250`

**API data**:
- `GET /api/protocols` → filter by `chains` array containing target chain

**Formats**: `mc4` (buckets)

**Computed fields**:
- `protocolCount`: count of protocols where `chains` includes target chain
- `countBucket`: bucket the count falls into

**Distractors**: Adjacent count buckets

**Fallbacks**:
- If count near bucket boundary (within 10%) → add margin note in explanation

**Difficulty factors**:
- Proximity to bucket boundary — counts near 50, 100, 250 are harder
- Chain familiarity — major chains like Ethereum have obviously high counts

---

### C11: Top Protocol by TVL

Which protocol has the most TVL on a given chain?

**Prompt**: "Which protocol has the most TVL on {chain}?"

**API data**:
- `GET /api/protocols` → filter by chain, use `chainTvls[chain]` for ranking

**Formats**: `mc4` → `ab` (top 2)

**Computed fields**:
- `topProtocol`: protocol with highest TVL on chain
- `topProtocolTvl`: that protocol's TVL on the chain
- `top2Margin`: margin between #1 and #2
- `leaderboard`: sorted list of protocols by chain TVL

**Distractors**: Other protocols from the chain's TVL leaderboard

**Fallbacks**:
- If fewer than 4 protocols with TVL data → use A/B (top 2)
- If top2 margin < 10% → use A/B format

**Difficulty factors**:
- Top-2 margin — larger = easier
- Protocol familiarity — well-known protocols easier to identify

---

### C12: Category Dominance

What category has the most TVL on a given chain?

**Prompt**: "What category has the most TVL on {chain}?"

**API data**:
- `GET /api/protocols` → filter by chain, aggregate `chainTvls[chain]` by `category`

**Formats**: `mc4`

**Computed fields**:
- `topCategory`: category with highest aggregate TVL on chain
- `topCategoryTvl`: total TVL in that category on the chain
- `categoryTvls`: sorted map of category → TVL
- `top2Margin`: margin between #1 and #2 categories

**Distractors**: Other categories with significant TVL on the chain

**Category grouping**: Minor categories (< 2% of chain TVL) are grouped into "Other" to reduce noise

**Fallbacks**:
- If fewer than 4 distinct categories → skip template
- If top2 margin < 10% → add margin note in explanation

**Difficulty factors**:
- Top-2 margin — larger category dominance = easier
- Chain ecosystem knowledge — knowing which categories dominate which chains

---

## Template Summary

| ID | Name | Primary Format | Fallback Format | Key Metric | Single-Chain Friendly | Semantic Topics |
|----|------|----------------|-----------------|------------|----------------------|-----------------|
| P1 | Protocol Fingerprint | mc6 | mc4 | Multiple clues | ✓ | — |
| P2 | Cross-Chain Dominance | ab | tf | Chain TVL comparison | ✗ | — |
| P3 | Top Chain Concentration | mc4 (buckets) | tf | TVL share | ✗ | — |
| P4 | ATH Timing | mc4 (months) | tf | TVL history | ✓ | — |
| P5 | Fees vs Revenue | ab/mc4 | tf | Fees, revenue | ✓ | — |
| P6 | TVL Trend | tf/mc4 | ab | TVL change over time | ✓ | `tvl_trend_7d`, `tvl_direction` |
| P7 | Category Identification | mc4 | mc6 | Protocol category | ✓ | `category_identification` |
| P8 | Chain Membership | mc4 | tf | Deployment chains | ✓ | — |
| P9 | Top Chain Name | mc4 | tf | Top chain by TVL | ✗ | — |
| P10 | TVL Band | mc4 | — | TVL bucket | ✓ | — |
| P11 | Fees Trend | tf | mc4 | Fees change over time | ✓ | — |
| P12 | DEX Volume Trend | tf | mc4 | Volume change (DEX only) | ✓ | — |
| P13 | TVL Rank Comparison | ab | tf | Compare to similar protocol | ✓ | — |
| P14 | Category Leader | ab/mc4 | tf | Category context | ✓ | — |
| P15 | Recent TVL Direction | ab | tf/mc4 | Recent trend | ✓ | `tvl_trend_7d`, `tvl_direction` |
| C1 | Chain Fingerprint | mc6 | mc4 | Multiple clues | — | — |
| C2 | Chain TVL Comparison | ab | buckets | Chain TVL | — | — |
| C3 | Chain ATH Timing | mc4 (months) | tf | Chain TVL history | — | — |
| C4 | Chain Growth Ranking | mc4 | ab | 30d TVL change | — | — |
| C5 | Top Protocol by Fees | mc4 | ab | Chain fees leaderboard | — | — |
| C6 | Top DEX by Volume | mc4 | ab | Chain DEX volume | — | — |
| C7 | Chain TVL Band | mc4 | — | Chain TVL bucket | — | — |
| C8 | 30-Day Direction | ab | tf | 30d TVL direction | — | — |
| C9 | Distance from ATH | tf | mc4 | ATH proximity | — | — |
| C10 | Protocol Count | mc4 | — | Protocol count bucket | — | — |
| C11 | Top Protocol by TVL | mc4 | ab | Chain protocol leaderboard | — | — |
| C12 | Category Dominance | mc4 | — | Category TVL aggregation | — | — |

### Semantic Topic Deduplication

Templates with overlapping `semanticTopics` will not both be selected in the same episode. This prevents questions that ask about the same underlying metric in different formats:

- **P6 and P15** both have `tvl_trend_7d` → Only one TVL direction question per episode
- **P7** has `category_identification` → Only one category question per episode

Add semantic topics to new templates when they cover the same underlying data/metric as existing templates.
