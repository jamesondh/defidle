# Question Templates

> **Auto-generated from template configs.** Do not edit manually.
> Run `bun run scripts/generate-template-docs.ts` to regenerate.

This document defines the question templates used in DeFidle: 21 protocol templates (P1-P15), 14 chain templates (C1-C12), and 29 fallback templates.

> **Note**: All templates use **free DefiLlama API endpoints only**. No Pro API key required.

## Table of Contents

- [Conventions](#conventions)
- [Protocol Templates (P1-P15)](#protocol-templates-p1-p15)
- [Chain Templates (C1-C12)](#chain-templates-c1-c12)
- [Protocol Fallbacks](#protocol-fallbacks)
- [Chain Fallbacks](#chain-fallbacks)
- [Template Summary](#template-summary)
- [Semantic Topic Reference](#semantic-topic-reference)

## Conventions

**Margin calculations:**
- A/B margin: `abs(a - b) / max(a, b)`
- Top-2 margin: `(v1 - v2) / v1`

**Format degradation order:**
```
mc6 -> mc4 -> ab -> tf
```

**Fallback selection:**
- Fallbacks are used when regular templates fail prerequisites or difficulty matching
- For hard slots, A/B comparisons are preferred over T/F threshold questions
- T/F questions with >25% margin are filtered out for hard slots

---

## Protocol Templates (P1-P15)

### P1_FINGERPRINT: Protocol Fingerprint Guess

Identify a protocol from a set of clues about its characteristics

| Property | Value |
|----------|-------|
| **ID** | `P1_FINGERPRINT` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | A |
| **Reusable** | No |

---

### P2_CROSSCHAIN: Cross-Chain Dominance

Compare a protocol's TVL across two chains

| Property | Value |
|----------|-------|
| **ID** | `P2_CROSSCHAIN` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | B, D |
| **Reusable** | No |

---

### P3_CONCENTRATION: Top Chain Concentration

What share of a protocol's TVL is on its dominant chain

| Property | Value |
|----------|-------|
| **ID** | `P3_CONCENTRATION` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | B, E |
| **Reusable** | No |

---

### P4_ATH_TIMING: ATH Timing

When did a protocol reach its all-time high TVL

| Property | Value |
|----------|-------|
| **ID** | `P4_ATH_TIMING` |
| **Type** | protocol |
| **Semantic Topics** | `ath_history` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### P5_FEES_REVENUE: Fees vs Revenue

Compare a protocol's fees and revenue metrics

| Property | Value |
|----------|-------|
| **ID** | `P5_FEES_REVENUE` |
| **Type** | protocol |
| **Semantic Topics** | `fees_metrics` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### P6_TVL_TREND: TVL Trend

Did a protocol's TVL increase or decrease over a given period

| Property | Value |
|----------|-------|
| **ID** | `P6_TVL_TREND` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_trend_7d`, `tvl_direction` |
| **Slot Assignments** | E |
| **Reusable** | No |

---

### P7_CATEGORY: Category Identification

Identify a protocol's category

| Property | Value |
|----------|-------|
| **ID** | `P7_CATEGORY` |
| **Type** | protocol |
| **Semantic Topics** | `category_identification` |
| **Slot Assignments** | B |
| **Reusable** | No |

---

### P8_CHAIN_MEMBERSHIP: Chain Membership

Check if a protocol is deployed on a specific chain

| Property | Value |
|----------|-------|
| **ID** | `P8_CHAIN_MEMBERSHIP` |
| **Type** | protocol |
| **Semantic Topics** | None |
| **Slot Assignments** | E |
| **Reusable** | No |

---

### P9_TOP_CHAIN: Top Chain Name

Which chain has the most TVL for a multi-chain protocol

| Property | Value |
|----------|-------|
| **ID** | `P9_TOP_CHAIN` |
| **Type** | protocol |
| **Semantic Topics** | None |
| **Slot Assignments** | B, D |
| **Reusable** | No |

---

### P10_TVL_BAND: TVL Band

Which TVL range fits a protocol

| Property | Value |
|----------|-------|
| **ID** | `P10_TVL_BAND` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_magnitude` |
| **Slot Assignments** | E |
| **Reusable** | No |

---

### P11_FEES_TREND: Fees Trend

Did a protocol's fees increase or decrease over a period

| Property | Value |
|----------|-------|
| **ID** | `P11_FEES_TREND` |
| **Type** | protocol |
| **Semantic Topics** | `fees_metrics` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### P12_DEX_VOLUME_TREND: DEX Volume Trend

Did a DEX's volume increase or decrease

| Property | Value |
|----------|-------|
| **ID** | `P12_DEX_VOLUME_TREND` |
| **Type** | protocol |
| **Semantic Topics** | None |
| **Slot Assignments** | E |
| **Reusable** | No |

---

### P13_TVL_RANK_COMPARISON: TVL Rank Comparison

Compare a protocol's TVL to another similar protocol

| Property | Value |
|----------|-------|
| **ID** | `P13_TVL_RANK_COMPARISON` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | B, D |
| **Reusable** | No |

---

### P14_CATEGORY_LEADER: Category Leader Comparison

Compare protocol to others in the same category

| Property | Value |
|----------|-------|
| **ID** | `P14_CATEGORY_LEADER` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### P15_RECENT_TVL_DIRECTION: Recent TVL Direction

Simple question about protocol's recent TVL trend

| Property | Value |
|----------|-------|
| **ID** | `P15_RECENT_TVL_DIRECTION` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_trend_7d`, `tvl_direction` |
| **Slot Assignments** | C, E |
| **Reusable** | No |

---

### P16_CATEGORY_PEER: Category Peer Comparison

Which protocol has highest/lowest TVL in category

| Property | Value |
|----------|-------|
| **ID** | `P16_CATEGORY_PEER` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute`, `category_ranking` |
| **Slot Assignments** | B, D |
| **Reusable** | No |

---

### P20_ATH_DISTANCE: ATH Distance

How far is the protocol from its all-time high TVL

| Property | Value |
|----------|-------|
| **ID** | `P20_ATH_DISTANCE` |
| **Type** | protocol |
| **Semantic Topics** | `ath_history`, `tvl_magnitude` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### P22_CATEGORY_MARKET_SHARE: Category Market Share

What percentage of category TVL does this protocol hold

| Property | Value |
|----------|-------|
| **ID** | `P22_CATEGORY_MARKET_SHARE` |
| **Type** | protocol |
| **Semantic Topics** | `tvl_absolute`, `category_ranking` |
| **Slot Assignments** | C, E |
| **Reusable** | No |

---

### P27_DERIVATIVES_RANKING: Derivatives Protocol Comparison

Compare TVL between derivatives/perps protocols

| Property | Value |
|----------|-------|
| **ID** | `P27_DERIVATIVES_RANKING` |
| **Type** | protocol |
| **Semantic Topics** | `derivatives_ranking`, `tvl_absolute` |
| **Slot Assignments** | B, C, D |
| **Reusable** | No |

---

### P29_CATEGORY_GROWTH: Category TVL Growth Comparison

Which protocol category grew the most in TVL

| Property | Value |
|----------|-------|
| **ID** | `P29_CATEGORY_GROWTH` |
| **Type** | protocol |
| **Semantic Topics** | `category_trend` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### P30_CHAIN_EXPANSION: Protocol Chain Expansion

Questions about protocol multi-chain deployment growth

| Property | Value |
|----------|-------|
| **ID** | `P30_CHAIN_EXPANSION` |
| **Type** | protocol |
| **Semantic Topics** | `chain_expansion` |
| **Slot Assignments** | B, E |
| **Reusable** | No |

---

## Chain Templates (C1-C12)

### C1_FINGERPRINT: Chain Fingerprint Guess

Identify a chain from a set of clues

| Property | Value |
|----------|-------|
| **ID** | `C1_FINGERPRINT` |
| **Type** | chain |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | A |
| **Reusable** | No |

---

### C2_CHAIN_COMPARISON: Chain TVL Comparison

Compare TVL between two chains

| Property | Value |
|----------|-------|
| **ID** | `C2_CHAIN_COMPARISON` |
| **Type** | chain |
| **Semantic Topics** | `tvl_absolute` |
| **Slot Assignments** | B, E |
| **Reusable** | No |

---

### C3_ATH_TIMING: Chain ATH Timing

When did a chain reach its ATH TVL

| Property | Value |
|----------|-------|
| **ID** | `C3_ATH_TIMING` |
| **Type** | chain |
| **Semantic Topics** | `ath_history` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### C4_GROWTH_RANKING: Chain Growth Ranking

Rank chains by recent TVL growth

| Property | Value |
|----------|-------|
| **ID** | `C4_GROWTH_RANKING` |
| **Type** | chain |
| **Semantic Topics** | `tvl_trend` |
| **Slot Assignments** | C, D, E |
| **Reusable** | No |

---

### C5_TOP_BY_FEES: Top Protocol by Fees

Which protocol generates the most fees on a given chain

| Property | Value |
|----------|-------|
| **ID** | `C5_TOP_BY_FEES` |
| **Type** | chain |
| **Semantic Topics** | `fees_metrics` |
| **Slot Assignments** | C, E |
| **Reusable** | No |

---

### C6_TOP_DEX: Top DEX by Volume

Which DEX has the highest volume on a given chain

| Property | Value |
|----------|-------|
| **ID** | `C6_TOP_DEX` |
| **Type** | chain |
| **Semantic Topics** | None |
| **Slot Assignments** | C, E |
| **Reusable** | No |

---

### C7_CHAIN_TVL_BAND: Chain TVL Band

Which TVL range fits a chain

| Property | Value |
|----------|-------|
| **ID** | `C7_CHAIN_TVL_BAND` |
| **Type** | chain |
| **Semantic Topics** | `tvl_magnitude` |
| **Slot Assignments** | E |
| **Reusable** | No |

---

### C8_30D_DIRECTION: 30-Day Direction

Did a chain's TVL increase or decrease over the last 30 days

| Property | Value |
|----------|-------|
| **ID** | `C8_30D_DIRECTION` |
| **Type** | chain |
| **Semantic Topics** | `tvl_trend` |
| **Slot Assignments** | B, E |
| **Reusable** | No |

---

### C9_DISTANCE_FROM_ATH: Distance from ATH

How close is a chain to its all-time high TVL

| Property | Value |
|----------|-------|
| **ID** | `C9_DISTANCE_FROM_ATH` |
| **Type** | chain |
| **Semantic Topics** | `ath_history` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### C10_PROTOCOL_COUNT: Protocol Count

How many protocols are deployed on a given chain

| Property | Value |
|----------|-------|
| **ID** | `C10_PROTOCOL_COUNT` |
| **Type** | chain |
| **Semantic Topics** | None |
| **Slot Assignments** | B, E |
| **Reusable** | No |

---

### C11_TOP_PROTOCOL_TVL: Top Protocol by TVL

Which protocol has the most TVL on a given chain

| Property | Value |
|----------|-------|
| **ID** | `C11_TOP_PROTOCOL_TVL` |
| **Type** | chain |
| **Semantic Topics** | None |
| **Slot Assignments** | B, C, D |
| **Reusable** | No |

---

### C12_CATEGORY_DOMINANCE: Category Dominance

What category has the most TVL on a given chain

| Property | Value |
|----------|-------|
| **ID** | `C12_CATEGORY_DOMINANCE` |
| **Type** | chain |
| **Semantic Topics** | None |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

### C13_LAYER_TYPE: Layer Type Identification

Identify whether a chain is a Layer 1 or Layer 2 blockchain

| Property | Value |
|----------|-------|
| **ID** | `C13_LAYER_TYPE` |
| **Type** | chain |
| **Semantic Topics** | `chain_classification` |
| **Slot Assignments** | B, E |
| **Reusable** | No |

---

### C14_TVL_DOMINANCE: Chain TVL Dominance

What share of a chain's TVL is controlled by its top protocol

| Property | Value |
|----------|-------|
| **ID** | `C14_TVL_DOMINANCE` |
| **Type** | chain |
| **Semantic Topics** | `chain_concentration` |
| **Slot Assignments** | C, D |
| **Reusable** | No |

---

## Protocol Fallbacks

Fallback questions provide substantive, data-driven questions when regular templates fail. They use real data comparisons instead of trivial questions.

### TVL Threshold

Questions about whether TVL exceeds certain thresholds

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `protocol_tvl_above_100m` | True/False | Easy | `tvl_absolute` |
| `protocol_tvl_above_500m` | True/False | Easy | `tvl_absolute` |
| `protocol_tvl_above_1b` | True/False | Medium | `tvl_absolute` |
| `protocol_tvl_above_5b` | True/False | Medium | `tvl_absolute` |

### Trend Direction

Questions about TVL movement over time periods

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `protocol_tvl_increased_7d` | True/False | Easy | `tvl_trend` |
| `protocol_tvl_decreased_7d` | True/False | Easy | `tvl_trend` |

### Trend Threshold

Questions about whether TVL changed by more than a threshold

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `protocol_tvl_up_5pct` | True/False | Medium | `tvl_trend` |
| `protocol_tvl_down_5pct` | True/False | Medium | `tvl_trend` |

### Rank Position

Questions about ranking position by TVL

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `protocol_rank_top_10` | True/False | Easy | `tvl_rank` |
| `protocol_rank_top_25` | True/False | Medium | `tvl_rank` |
| `protocol_rank_top_50` | True/False | Easy | `tvl_rank` |

### Chain Count

Questions about multi-chain deployment

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `protocol_chains_above_3` | True/False | Easy | `chain_count` |
| `protocol_chains_above_5` | True/False | Medium | `chain_count` |
| `protocol_chains_above_10` | True/False | Medium | `chain_count` |

### A/B Comparisons

Questions comparing TVL between two entities

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `protocol_compare_nearby` | A/B Choice | Medium | `tvl_absolute` |
| `protocol_compare_category` | A/B Choice | Medium | `tvl_absolute` |

---

## Chain Fallbacks

### TVL Threshold

Questions about whether TVL exceeds certain thresholds

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `chain_tvl_above_100m` | True/False | Easy | `tvl_absolute` |
| `chain_tvl_above_500m` | True/False | Easy | `tvl_absolute` |
| `chain_tvl_above_1b` | True/False | Medium | `tvl_absolute` |
| `chain_tvl_above_5b` | True/False | Medium | `tvl_absolute` |
| `chain_tvl_above_10b` | True/False | Medium | `tvl_absolute` |

### Trend Direction

Questions about TVL movement over time periods

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `chain_tvl_increased_30d` | True/False | Easy | `tvl_trend` |
| `chain_tvl_decreased_30d` | True/False | Easy | `tvl_trend` |

### Trend Threshold

Questions about whether TVL changed by more than a threshold

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `chain_tvl_up_10pct` | True/False | Medium | `tvl_trend` |
| `chain_tvl_down_10pct` | True/False | Medium | `tvl_trend` |

### Rank Position

Questions about ranking position by TVL

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `chain_rank_top_5` | True/False | Easy | `tvl_rank` |
| `chain_rank_top_10` | True/False | Easy | `tvl_rank` |
| `chain_rank_top_20` | True/False | Medium | `tvl_rank` |

### A/B Comparisons

Questions comparing TVL between two entities

| ID | Format | Difficulty | Semantic Topics |
|----|--------|------------|-----------------|
| `chain_compare_nearby` | A/B Choice | Medium | `tvl_absolute` |

---

## Template Summary

### Protocol Templates

| ID | Name | Semantic Topics | Slots |
|----|------|-----------------|-------|
| P1_FINGERPRINT | Protocol Fingerprint Guess | `tvl_absolute` | A |
| P2_CROSSCHAIN | Cross-Chain Dominance | `tvl_absolute` | B, D |
| P3_CONCENTRATION | Top Chain Concentration | `tvl_absolute` | B, E |
| P4_ATH_TIMING | ATH Timing | `ath_history` | C, D |
| P5_FEES_REVENUE | Fees vs Revenue | `fees_metrics` | C, D |
| P6_TVL_TREND | TVL Trend | `tvl_trend_7d`, `tvl_direction` | E |
| P7_CATEGORY | Category Identification | `category_identification` | B |
| P8_CHAIN_MEMBERSHIP | Chain Membership | None | E |
| P9_TOP_CHAIN | Top Chain Name | None | B, D |
| P10_TVL_BAND | TVL Band | `tvl_magnitude` | E |
| P11_FEES_TREND | Fees Trend | `fees_metrics` | C, D |
| P12_DEX_VOLUME_TREND | DEX Volume Trend | None | E |
| P13_TVL_RANK_COMPARISON | TVL Rank Comparison | `tvl_absolute` | B, D |
| P14_CATEGORY_LEADER | Category Leader Comparison | `tvl_absolute` | C, D |
| P15_RECENT_TVL_DIRECTION | Recent TVL Direction | `tvl_trend_7d`, `tvl_direction` | C, E |
| P16_CATEGORY_PEER | Category Peer Comparison | `tvl_absolute`, `category_ranking` | B, D |
| P20_ATH_DISTANCE | ATH Distance | `ath_history`, `tvl_magnitude` | C, D |
| P22_CATEGORY_MARKET_SHARE | Category Market Share | `tvl_absolute`, `category_ranking` | C, E |
| P27_DERIVATIVES_RANKING | Derivatives Protocol Comparison | `derivatives_ranking`, `tvl_absolute` | B, C, D |
| P29_CATEGORY_GROWTH | Category TVL Growth Comparison | `category_trend` | C, D |
| P30_CHAIN_EXPANSION | Protocol Chain Expansion | `chain_expansion` | B, E |

### Chain Templates

| ID | Name | Semantic Topics | Slots |
|----|------|-----------------|-------|
| C1_FINGERPRINT | Chain Fingerprint Guess | `tvl_absolute` | A |
| C2_CHAIN_COMPARISON | Chain TVL Comparison | `tvl_absolute` | B, E |
| C3_ATH_TIMING | Chain ATH Timing | `ath_history` | C, D |
| C4_GROWTH_RANKING | Chain Growth Ranking | `tvl_trend` | C, D, E |
| C5_TOP_BY_FEES | Top Protocol by Fees | `fees_metrics` | C, E |
| C6_TOP_DEX | Top DEX by Volume | None | C, E |
| C7_CHAIN_TVL_BAND | Chain TVL Band | `tvl_magnitude` | E |
| C8_30D_DIRECTION | 30-Day Direction | `tvl_trend` | B, E |
| C9_DISTANCE_FROM_ATH | Distance from ATH | `ath_history` | C, D |
| C10_PROTOCOL_COUNT | Protocol Count | None | B, E |
| C11_TOP_PROTOCOL_TVL | Top Protocol by TVL | None | B, C, D |
| C12_CATEGORY_DOMINANCE | Category Dominance | None | C, D |
| C13_LAYER_TYPE | Layer Type Identification | `chain_classification` | B, E |
| C14_TVL_DOMINANCE | Chain TVL Dominance | `chain_concentration` | C, D |

### Fallback Summary

| Type | Count | Formats | Difficulties |
|------|-------|---------|--------------|
| Protocol | 16 | tf, ab | easy, medium |
| Chain | 13 | tf, ab | easy, medium |

## Semantic Topic Reference

Templates and fallbacks with overlapping semantic topics will not both be selected in the same episode. This prevents semantically duplicate questions.

| Semantic Topic | Templates/Fallbacks |
|----------------|---------------------|
| `tvl_absolute` | P1_FINGERPRINT, P2_CROSSCHAIN, P3_CONCENTRATION, P13_TVL_RANK_COMPARISON, P14_CATEGORY_LEADER, P16_CATEGORY_PEER, ... (22 total) |
| `ath_history` | P4_ATH_TIMING, P20_ATH_DISTANCE, C3_ATH_TIMING, C9_DISTANCE_FROM_ATH |
| `fees_metrics` | P5_FEES_REVENUE, P11_FEES_TREND, C5_TOP_BY_FEES |
| `tvl_trend_7d` | P6_TVL_TREND, P15_RECENT_TVL_DIRECTION |
| `tvl_direction` | P6_TVL_TREND, P15_RECENT_TVL_DIRECTION |
| `category_identification` | P7_CATEGORY |
| `tvl_magnitude` | P10_TVL_BAND, P20_ATH_DISTANCE, C7_CHAIN_TVL_BAND |
| `category_ranking` | P16_CATEGORY_PEER, P22_CATEGORY_MARKET_SHARE |
| `derivatives_ranking` | P27_DERIVATIVES_RANKING |
| `category_trend` | P29_CATEGORY_GROWTH |
| `chain_expansion` | P30_CHAIN_EXPANSION |
| `tvl_trend` | C4_GROWTH_RANKING, C8_30D_DIRECTION, FALLBACK_PROTOCOL_TVL_INCREASED_7D, FALLBACK_PROTOCOL_TVL_DECREASED_7D, FALLBACK_PROTOCOL_TVL_UP_5PCT, FALLBACK_PROTOCOL_TVL_DOWN_5PCT, ... (10 total) |
| `chain_classification` | C13_LAYER_TYPE |
| `chain_concentration` | C14_TVL_DOMINANCE |
| `tvl_rank` | FALLBACK_PROTOCOL_RANK_TOP_10, FALLBACK_PROTOCOL_RANK_TOP_25, FALLBACK_PROTOCOL_RANK_TOP_50, FALLBACK_CHAIN_RANK_TOP_5, FALLBACK_CHAIN_RANK_TOP_10, FALLBACK_CHAIN_RANK_TOP_20 |
| `chain_count` | FALLBACK_PROTOCOL_CHAINS_ABOVE_3, FALLBACK_PROTOCOL_CHAINS_ABOVE_5, FALLBACK_PROTOCOL_CHAINS_ABOVE_10 |
