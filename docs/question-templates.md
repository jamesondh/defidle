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

## Protocol Templates (P1-P6)

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

## Chain Templates (C1-C6)

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

## Template Summary

| ID | Name | Primary Format | Fallback Format | Key Metric |
|----|------|----------------|-----------------|------------|
| P1 | Protocol Fingerprint | mc6 | mc4 | Multiple clues |
| P2 | Cross-Chain Dominance | ab | tf | Chain TVL comparison |
| P3 | Top Chain Concentration | mc4 (buckets) | tf | TVL share |
| P4 | ATH Timing | mc4 (months) | tf | TVL history |
| P5 | Fees vs Revenue | ab/mc4 | tf | Fees, revenue |
| P6 | TVL Trend | tf/mc4 | ab | TVL change over time |
| C1 | Chain Fingerprint | mc6 | mc4 | Multiple clues |
| C2 | Chain TVL Comparison | ab | buckets | Chain TVL |
| C3 | Chain ATH Timing | mc4 (months) | tf | Chain TVL history |
| C4 | Chain Growth Ranking | rank4 | mc4/ab | 30d TVL change |
| C5 | Top Protocol by Fees | mc4 | ab | Chain fees leaderboard |
| C6 | Top DEX by Volume | mc4 | ab | Chain DEX volume |
