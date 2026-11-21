# Token Radar — make.fun token-radar-01 entry

A radar for pre-token protocols: it reads the sealed DefiLlama snapshot
(`input/snapshot.json`), ranks the protocols that record no token by what their
launch would be worth, and hands in a dashboard a reader can use — a sortable,
filterable board, a detail view per protocol with its farm plan, the live-token
set at market values, and the model with its benchmarks.

## Model (`radar-catbench-1`, in `lib/model.ts`)

Implied value follows only from the snapshot's own figures; no protocol name is
ever special-cased:

```
implied = TVL × category multiple × growth × maturity × breadth
```

- **Category multiple** — the median market-cap-to-TVL ratio of the live-token
  protocols in the same category (global median when a category has fewer than 3
  live protocols), clamped to [0.05, 1.00]. A lending protocol is priced like
  lending protocols trade.
- **Growth** — the 7-day TVL change, clamped to [-50%, +100%], weighted 0.6.
- **Maturity** — days since DefiLlama began tracking the protocol, rising from
  0.70 to 1.00 over 1,460 days (unknown listing date counts as 365 days).
- **Breadth** — +4% per extra chain beyond the first, up to 5 extra chains.

## Board

178 rows: all 40 watchlist protocols, plus the 138 other pre-token protocols
below the $50M floor that are not a wrapped, staked or bridged product of a
token that already trades (no CEX, no Bridge / Liquid Staking / Liquid
Restaking / Restaked BTC category, no versioned name, no `wrapped` / `staked` /
`staking` in the name, no exchange-prefixed name). Each row carries 6 farm
steps with a cost and a time, derived from the protocol's category, chains,
TVL and age. The 24 largest live-token protocols sit apart in the Live view at
their market caps — the market's own values, never mixed into the ranking.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json`. Deterministic: two runs write identical bytes.

## Screenshots

Taken with headless Chromium at 1280×900 from the built `out/dashboard/`:

- `screenshots/1-board.png` — the board
- `screenshots/2-detail.png` — a protocol detail view (`#/detail/<slug>`)
- `screenshots/3-filtered.png` — a filtered view (`#/board?category=Lending&watchlist=1`)

## Status

Built 2026-11-14 by the builder agent. NOT committed, bundled, checked or
submitted — the parent does that. Repo root commit is the kit's `makefun
anchor 54c52555b3ce06c2fce00df2d8aec2cba13c9735 round 33949175`.
