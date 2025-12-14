# DeFidle

[DeFidle](https://defidle.fun) is a daily DeFi quiz web app powered by DefiLlama data. Each day features a single topic—primarily a DeFi protocol or a blockchain—and presents a short, Worldle-style sequence of questions that moves from broad recognition (a "metric fingerprint" reveal) to progressively more specific follow-ups (cross-chain dominance, rankings, milestones, and trend/insight checks). The game focuses on DeFi fundamentals and usage metrics rather than price: TVL and its history, per-chain breakdowns, fees vs revenue, DEX volumes, net inflows/outflows, and (where available) activity signals like active users.

Question generation is data-driven but curated to stay interesting and fair. Episodes are built from top protocols/chains and notable movers, with difficulty balanced using measurable separation signals (e.g., gaps between #1 and #2 in leaderboards, A/B comparison margins) and volatility checks to avoid overly noisy or arbitrary prompts. Lightweight LLM assistance is used for phrasing and distractor generation, but all answers are computed and verified directly from DefiLlama's API, with clear post-answer explanations backed by the underlying metrics.

See `docs/SPEC.md` for an up-to-date specification.

See `docs/implementation-plan.md` for implementation status of the specification.

## Tech Stack

- Bun (not npm)
- Next.js 16 (App Router)
- shadcn/ui components (see `docs/shadcn-ui.md` for list of components)
- react-icons (fa6)
- DeFiLlama API (see `docs/defillama-api.md` for usage)

## Quick Start

```bash
bun install
bun dev
```
