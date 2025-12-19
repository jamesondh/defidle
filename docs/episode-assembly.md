# Episode Assembly

This document defines how questions are assembled into episodes, including the slot structure, difficulty targeting, and prerequisite checks.

## Episode Structure

Each episode consists of **5 questions** (can be 4-6 based on data availability), organized into slots with specific purposes:

| Slot | Purpose | Target Difficulty | Description |
|------|---------|-------------------|-------------|
| A | Hook / Reveal | Medium | Identify the topic from clues |
| B | Confidence Builder | Easy | High-margin comparison, builds momentum |
| C | Context | Medium | Ecosystem context (fees, history, composition) |
| D | Skill Test | Hard | Tighter margins or precise timing |
| E | Wrap-up | Easy-Medium | Insight or trend, ends on accessible note |

The slot structure creates a difficulty arc: start engaging (medium), build confidence (easy), add depth (medium), challenge (hard), close accessibly (easy-medium).

## Difficulty System

### Difficulty Targets

Default mix for 5-question episode: **1 easy, 2 medium, 1 hard, 1 easy**

| Target | Score Range | Characteristics |
|--------|-------------|-----------------|
| Easy | 0.00 - 0.38 | Large margins (>25%), familiar topics, simple formats |
| Medium | 0.30 - 0.55 | Moderate margins (10-25%), standard formats |
| Hard | 0.34 - 1.00 | mc6 format, any margin, challenging identification |

Note: Ranges overlap intentionally to allow flexibility in slot assignment. The hard band starts at 0.34 because mc6 questions with top-25 familiarity and high margins score ~0.34. This ensures episodes can have genuinely challenging questions rather than falling back to trivial ones.

### Difficulty Scoring

Each question's difficulty is computed from four signals:

```
score = 0.40 × formatFactor 
      + 0.20 × familiarityFactor 
      + 0.30 × marginFactor 
      + 0.10 × volatilityFactor
```

**Format Factor** (lower = easier):
| Format | Factor |
|--------|--------|
| tf | 0.20 |
| ab | 0.40 |
| mc4 | 0.55 |
| mc6 | 0.70 |
| rank4 | 0.85 |

> **Note**: `write_in` format is deferred to v2+. See SPEC.md for rationale.

**Familiarity Factor** (based on TVL rank):
| Rank Bucket | Factor |
|-------------|--------|
| top_10 | 0.10 |
| top_25 | 0.18 |
| top_100 | 0.30 |
| long_tail | 0.45 |

**Margin Factor** (smaller margin = harder):
```
marginFactor = clamp(1 - (margin / 0.25), 0, 1)
```
- 25%+ margin → 0.0 (easy)
- 12.5% margin → 0.5 (medium)
- 0% margin → 1.0 (hard)

**Volatility Factor**: 0.0 - 1.0 based on daily series variance (see generation-algorithm.md)

---

## Protocol Episode Matrix

### Slot A: Hook / Reveal → P1 (Fingerprint Guess)

**Primary template**: P1

**Prerequisites**:
- Protocol has `category`, `chains`, `tvl` from `/api/protocols`
- Optional: `tvl[]` series for sparkline clue

**Format selection**:
- Top-25 protocol → `mc6`
- Top-100 protocol → `mc6`
- Long-tail protocol → `mc4` with easier clues

**Fallbacks**:
- If sparkline data missing → drop that clue, add another characteristic

### Slot B: Confidence Builder → P2 or P3

**Primary template**: P2 (Cross-Chain Dominance)

**Prerequisites**:
- `currentChainTvls` exists with ≥2 chains
- At least one chain pair has margin ≥ 25%

**Alternative**: P3 (Top Chain Concentration)
- Use when protocol is heavily concentrated on one chain
- Or when P2 can't find a high-margin pair

**Fallbacks**:
- Single-chain protocol → P3 variant: "Is >90% of TVL on {chain}?" (T/F)

### Slot C: Context → P5 or P4

**Primary template**: P5 (Fees vs Revenue)

**Prerequisites**:
- Fees data available from `/api/summary/fees/{slug}`
- At least one of: fees > 0, revenue > 0

**Alternative**: P4 (ATH Timing)
- Use when fees data unavailable
- Or when P5 would be trivial (revenue always 0 for protocol type)

**Fallbacks**:
- Revenue = 0 → P5 becomes "Does protocol have non-zero revenue?" (T/F)
- No fees data → use P4
- Short history → P4 becomes "New 90d high?" (T/F)

### Slot D: Skill Test → P4 or P5 (harder variant)

**Primary template**: P4 (ATH Timing) with month precision

**Prerequisites**:
- TVL history ≥ 6 months
- ATH is not in current month (would be trivial)

**Alternative**: P5 with tight ratio buckets
- Use when P4 already used in Slot C
- Or when fees/revenue ratio is near bucket boundary

**Constraints**:
- Do not use highly volatile daily metrics for hard questions
- Prefer stable historical data over recent daily spikes

**Fallbacks**:
- P2 with deliberately tighter margin (10-15%) if other options exhausted

### Slot E: Wrap-up → P6, P3, or P5 (trend)

**Primary template**: P6 (TVL Trend)

**Prerequisites**:
- TVL series available from `/api/protocol/{slug}`
- OR `change_7d` available from `/api/protocols`

**Alternatives**:
- P3 (Top Chain Concentration) if not used earlier
- P5 trend variant: "Were fees up or down vs prior week?"

**Fallbacks**:
- If TVL series too short → use `change_7d` from `/api/protocols`
- If all alternatives used → repeat P2 with different chain pair

---

## Chain Episode Matrix

### Slot A: Hook / Reveal → C1 (Chain Fingerprint Guess)

**Primary template**: C1

**Prerequisites**:
- Chain exists in `/api/v2/chains`
- Optional: historical data for 30d trend clue

**Format selection**:
- Top-10 chain → `mc6`
- Top-20 chain → `mc6`
- Other chains → `mc4`

**Fallbacks**:
- No historical data → drop trend clue, rely on TVL + token symbol

### Slot B: Confidence Builder → C2

**Primary template**: C2 (Chain TVL Comparison)

**Prerequisites**:
- Can find a comparison chain with margin ≥ 25%

**Chain selection**: Pick a chain that is:
- Similar enough to be plausible (same tier or adjacent)
- Different enough that answer is clear

**Fallbacks**:
- If no high-margin pair → use bucketed format ("much higher / somewhat / about equal")

### Slot C: Activity → C5 or C6

**Primary template**: C5 (Top Protocol by Fees) or C6 (Top DEX by Volume)

**Selection logic**:
- Prefer whichever has cleaner top-2 separation
- If chain is DEX-heavy (Arbitrum, Base) → lean toward C6
- If chain has diverse fee generators → lean toward C5

**Prerequisites**:
- Chain has ≥4 protocols in fees/DEX leaderboard for MC4
- Top-2 margin is computable

**Fallbacks**:
- < 4 options → use A/B (top 2)
- Top-2 margin < 10% → add "too close to call" option

### Slot D: Skill Test → C3 or C4

**Primary template**: C3 (Chain ATH Timing)

**Prerequisites**:
- Historical TVL series ≥ 6 months
- ATH not in current month

**Alternative**: C4 (Chain Growth Ranking)
- Use when comparing multiple chains is more interesting
- Requires clear separations between growth rates

**Fallbacks**:
- Short history → C3 becomes "New 90d high?" (T/F)
- C4 separations too tight → "Which grew most?" (single pick MC)

### Slot E: Wrap-up → C6/C5 (whichever unused) or C2 variant

**Primary template**: Whichever of C5/C6 wasn't used in Slot C

**Alternative**: C2 growth comparison
- "Which chain grew faster over 30d: {chainA} or {chainB}?"

**Fallbacks**:
- If both C5/C6 used or unavailable → use growth bucket comparison

---

## Prerequisite Checks

Before selecting a template for a slot, the system verifies:

### Data Availability
- [ ] Required API endpoints return valid data
- [ ] Time series have sufficient history (≥30 days for trends, ≥6 months for ATH)
- [ ] Leaderboards have enough entries for MC format

### Margin Suitability
- [ ] Easy slots: margin ≥ 25%
- [ ] Medium slots: margin 10-25%
- [ ] Hard slots: margin 5-15% AND metric is stable

### Volatility Check
- [ ] If volatility > 0.75, force bucket/trend format
- [ ] Max 1 high-volatility question per episode

### Template Uniqueness
- [ ] Same template not used twice (except P2/C2 with different comparison)
- [ ] Episode covers diverse metric types (not all TVL-based)

---

## Assembly Algorithm

```
1. Determine episode type from day of week
2. Select topic (protocol or chain)
3. Fetch all required data for topic
4. Compute derived metrics (margins, volatility, ranks)
5. For each slot (A through E):
   a. Get candidate templates for slot
   b. For each candidate (in priority order):
      - Check prerequisites
      - Try preferred format, then fallbacks
      - Compute difficulty score
      - If score matches target → select and continue
   c. If no candidate works → use safe fallback
6. Validate episode (difficulty mix, volatility cap, uniqueness)
7. Generate final question text and explanations via LLM
8. Output episode JSON
```

See `generation-algorithm.md` for detailed pseudo-code.
