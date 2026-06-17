# PRD 22: Discovery Baseline

Part of the [Discovery Benchmarking initiative](../discovery-benchmark_desiredoutcomes.md) (Phase 10). Cycle **C1** (first of three). Satisfies desired outcome **1 (Discovery Baseline)**; Outcomes 2 (Deeper Personalization Benchmark) and 3 (Social & Curator Benchmark) are explicitly out of scope here.

## Goal

**Establish a repeatable, fixed-methodology baseline reading of how discovery performs today, computed the same way every time and recorded at known moments, so every future personalization or social change can be measured against the same reference.**

Phase 11 (Deeper Personalization, PRDs 18–21) just materially changed the scorer, and Phase 12 (Social / Curator) will change it again. Right now there is no fixed reference point to answer "are we getting better or worse at discovery?" — only "what does discovery look like right now?". This cycle turns the already-shipped **Recommendation Insight** surface into that reference: one coherent **baseline reading** (anonymous ranking shape, listener behavior mix, engagement, diversity, novelty, local relevance, signal coverage) with a **pinned, stated methodology** and a **paste-ready markdown snapshot** for the sprint record. The value is the *discipline* — fixed methodology + disciplined recording — not new infrastructure.

## Summary

Outcome 1 homes in the existing admin surfaces — **Recommendation Insight** (aggregate) and **Overview** (summary link) — and adds **no new tab** and **no new storage**. It stays **live-only / $0**: the benchmark re-runs the production scorer (`scoreDiscoveryEvents`) on demand against a fixed methodology, and "memory" lives in **dated markdown snapshots** copied into shipped PRD / sprint records (diffed by eye), never in a snapshot table.

The bulk of the per-reading content already exists in `lib/admin/insight.ts`; "done" means it is (a) presented together as one legible reading with plain-language definitions, (b) made **reproducible** — a pinned event window, a **stable** synthetic taste profile, and the scorer version surfaced on the panel, and (c) **recordable** without storage via a copy-as-markdown affordance. A snapshot is framed as **descriptive** — never collapsed into a single "quality score" (carrying forward PRD 09's risk note: don't misread correlation as quality).

## Implementation Status

**Shipped.** Delivered (commit `cb24683`):

- **Fixed-methodology baseline reading** in Recommendation Insight (`lib/admin/insight.ts`,
  `components/admin/InsightSection.tsx`): a `methodology` block on the payload + a panel
  **Methodology strip** stating the pinned event window, `SCORER_VERSION` (`v11.4`, new constant
  in `lib/discovery.ts`) + git commit (`VERCEL_GIT_COMMIT_SHA`, graceful when absent), and the
  synthetic-profile note — with the "descriptive, not a quality score" caveat.
- **Stable synthetic profile**: a committed, public-derived `SYNTHETIC_TASTE_SEED` (pinned
  2026-06-17, regenerated intentionally from frequent listings) replaces the drift-prone
  `topArtists(events)`, so the anonymous-vs-signed-in comparison moves only when the algorithm
  changes — verified live (coverage 20/418, 6 movers).
- **New baseline metrics**: novelty share (top-N under-the-radar), engagement (total community
  heat + top-N concentration), and impression non-conversion share — plus a plain-language
  **definition** under each metric card; the impression-non-conversion read also surfaces in the
  behavioral panel.
- **Recording without storage**: a pure `serializeBaselineMarkdown` + a **"Copy baseline reading
  as markdown"** button produce a dated, paste-ready snapshot (no table, no file output).
- **Overview discovery-health card** (`components/AdminPortal.tsx`) summarizing diversity /
  novelty / coverage / local value with a link into Recommendation Insight (warms its cache).
- **Pure helpers** extracted to `lib/admin/insight-metrics.ts` (no `server-only`/db) and
  unit-tested (`tests/insight-metrics.test.ts`, 8 cases).
- **Verified**: `typecheck`/`lint`/`build` green; 66 unit tests pass (incl. new insight suite +
  `test:registry`); Snyk **0 issues**; live-verified against Neon production data. $0; no new
  table, route, tab, or dependency.

### Recorded baseline snapshots

The first reading (scorer **v11.4**) and a re-recording after the Phase 12 social work shipped
(scorer **v12.4**, commit `0364d27`). Diff by eye: the window rolled forward a day, the top-5
reshuffled (the Pisgah lineup aged out, scores compressed to 44), tag spread 50→48, and a
`socialCircle`-maxed **Social & Curator** block now appears (Outcome 3 / PRD 27). Diversity, novelty
(100%), local value (0%), and engagement concentration (0%) held steady across the scorer change.

#### v11.4 — 2026-06-17

```
### Discovery Baseline — 2026-06-17

- **Window:** 2026-06-17 → 2026-07-07
- **Scorer:** v11.4
- **Synthetic profile:** Fixed public-derived seed (5 artists), pinned 2026-06-17 — regenerated intentionally, never a real listener's data.
- _Descriptive snapshot — not a single quality score._

**Diversity (top 10):** 10 venues · 10 artists · 50 tags
**Novelty:** 100% of top-10 under-the-radar
**Local value:** 0% of top-10 carry community signal
**Engagement:** 10 total community heat · 0% concentrated in top-10
**Coverage:** 20/418 events personalized · 398 rank on timing alone
**Signal mix (top 10):** Genre match 9 · Date availability 1
**Behavior:** 340 interactions · 2 removals · 316 impressions · 93% non-converting

**Top 5 anonymous ranking:**
1. Pisgah Brewing Upcoming Music Lineup — Pisgah Brewing Company Black Mountain (score 44)
2. Old-time Jam — Jack of the Wood Pub (score 38)
3. Bayou Diesel at Arbor Evenings — The North Carolina Arboretum (score 38)
4. Taps + Tunes Live Music — White Labs Brewing Co - Asheville Kitchen & Tap (score 38)
5. Matt Smith's Well-Crafted Music Series with Melissa McKinney — Highland Brewing Co. (score 38)
```

#### v12.4 — 2026-06-17 (post Phase 12; commit 0364d27)

```
### Discovery Baseline — 2026-06-17

- **Window:** 2026-06-17 → 2026-07-08
- **Scorer:** v12.4 (commit 0364d27)
- **Synthetic profile:** Fixed public-derived seed (5 artists), pinned 2026-06-17 — regenerated intentionally, never a real listener's data.
- _Descriptive snapshot — not a single quality score._

**Diversity (top 10):** 10 venues · 10 artists · 48 tags
**Novelty:** 100% of top-10 under-the-radar
**Local value:** 0% of top-10 carry community signal
**Engagement:** 7 total community heat · 0% concentrated in top-10
**Coverage:** 21/431 events personalized · 410 rank on timing alone
**Signal mix (top 10):** Date availability 10
**Behavior:** 453 interactions · 8 removals · 423 impressions · 95% non-converting

**Top 5 anonymous ranking:**
1. Old-time Jam — Jack of the Wood Pub (score 44)
2. Bayou Diesel at Arbor Evenings — The North Carolina Arboretum (score 44)
3. Matt Smith's Well-Crafted Music Series with Melissa McKinney — Highland Brewing Co. (score 44)
4. Wednesday Jazz at The Mule — The Mule at Devil's Foot Beverage (score 44)
5. Taps + Tunes Live Music — White Labs Brewing Co - Asheville Kitchen & Tap (score 44)

**Social & Curator (PRD 27):**
- "Your people" lift: 50 · anonymous popularity (socialHeat): 0 — read separately, never combined.
- Influence concentration: 67% from the single largest source · ⚠ early-warning threshold crossed.
- Exploration floor holds with social maxed: yes (novelty 100% vs baseline 100%).
- _Descriptive synthetic-circle reading — not a quality score; no money buys rank._
```

## Goals

- Present a single **baseline reading** in Recommendation Insight covering, for the current event window: anonymous ranking shape, listener behavior mix (incl. the impression-never-converts share), engagement (community heat + top-of-ranking concentration), diversity, novelty (quiet share of the top-N), local relevance, and signal coverage — each with a short plain-language definition so a human or agent reads the same panel the same way every time.
- Make a reading **reproducible**: pin and state the **event window**, use a **stable synthetic taste profile** (so the anonymous-vs-signed-in delta moves only when the *algorithm* changes, not because listings drifted), and surface the **scorer version / commit** the reading was computed against.
- Make a reading **recordable without storage**: a one-click **copy baseline-reading-as-markdown** affordance producing a dated, paste-ready snapshot for the shipped PRD / sprint record.
- Surface a compact **discovery-health summary** on the Overview tab that links into Recommendation Insight.
- Keep every read **descriptive**, never a single composite "quality score."

## Non-Goals

- **No** Deeper Personalization Benchmark (Outcome 2) or Social & Curator Benchmark (Outcome 3) — framed in the desired-outcomes doc for sequence only; they remain unscoped until those tracks are prioritized.
- **No** new snapshot table, longitudinal store, or new dependency; **no** new top-level tab.
- **No** change to the scoring algorithm itself — this cycle only observes, pins, and records its output.
- **No** real listener data in the synthetic comparison; **no** tokens/secrets read or shown.

## Requirements

### Fixed methodology (`lib/admin/insight.ts`)

- **Stable synthetic taste profile.** Replace the current drift-prone `topArtists(events)` input to `buildSyntheticProfile` with a **committed, public-derived seed constant** (`SYNTHETIC_TASTE_SEED`), regenerated only intentionally. The `syntheticProfile.note` stays honest about being a fixed, pinned, public-derived seed (never a real listener's data).
- **Pinned window + version on the payload.** Add a `methodology` block: the event window (`windowStart`/`windowEnd`), the `scorerVersion` (a `SCORER_VERSION` constant in `lib/discovery.ts`, manually bumped on scoring changes) plus the deployed git commit when available (`VERCEL_GIT_COMMIT_SHA`), and the synthetic-profile descriptor.

### Baseline metrics (`lib/admin/insight.ts`)

- **Novelty:** `noveltyShare` — the share of the top-N that is "quiet" (under-the-radar), aggregated from the existing per-event exploration-floor `novel` flag.
- **Engagement:** total community heat across the window and the share concentrated in the top-N (`engagement.totalHeat`, `engagement.topNHeatShare`), reusing `communityTotal`.
- **Behavior:** `impressionNonConversionShare` — impressions that never convert (the soft-negative volume Deeper Personalization consumes), derived from the existing `byAction` rollup.
- Reuse as-is: anonymous/signed-in rankings, movers, venue/tag/artist spread + `lowDiversity`, `localValueShare`, `signalMix`, `coverage`.

### Recording without storage

- A pure **`serializeBaselineMarkdown(insight)`** helper returning a dated, human-readable markdown block (the reading + its methodology), exposed for a client **copy-to-clipboard** affordance — no server write, no file output.

### Presentation (`components/admin/InsightSection.tsx`, `components/AdminPortal.tsx`)

- A **Methodology** strip atop Recommendation Insight: window dates, scorer version + commit, synthetic-profile note, and the "descriptive, not a quality score" caveat.
- **Novelty** and **Engagement** stat cards, and a short plain-language **definition** under each baseline metric.
- The impression-non-conversion share in the behavioral panel.
- A **"Copy baseline reading as markdown"** button.
- A compact **discovery-health summary** on the Overview tab (diversity flag / novelty share / coverage) with a link that switches to the Insight tab.

## Dependencies

- **PRD 09 (Recommendation Insight)** — the aggregate surface and `lib/admin/insight.ts` this cycle extends.
- **PRD 10 (Listener Trace)** — the per-listener drill-down that supplies evidence (unchanged this cycle).
- `lib/discovery.ts` — `scoreDiscoveryEvents`, `enforceExplorationFloor`, the per-event `novelty` component; gains the `SCORER_VERSION` constant.
- `lib/events.ts` — the 21-day rolling window (`getUpcomingEvents`).
- `lib/system-registry.ts` — update the Recommendation Insight node description if its role changes; regenerate `system-map.generated.md`.

## Risks

- **Reading mistaken for a grade** — a baseline can be misread as a single quality score; mitigated by presenting it descriptively with per-metric definitions and an explicit caveat (carries PRD 09's note).
- **Synthetic-profile staleness** — a committed seed can drift from real listings over time; mitigated by it being *intentionally* regenerated (a known, recorded act) rather than silently drifting every sync, which is the whole point.
- **Methodology drift** — if the window or seed silently changes, two readings stop being comparable; mitigated by surfacing the window, seed note, and scorer version on the panel and in every snapshot.
- **Recording discipline** — value depends on snapshots actually being recorded at ship; mitigated by the one-click markdown affordance and a `/ship` hand-off step.

## Acceptance Criteria

- Recommendation Insight presents one coherent baseline reading with all Outcome-1 dimensions, each with a plain-language definition.
- The synthetic profile is stable: re-loading after listings change does **not** move the anonymous-vs-signed-in comparison (only an algorithm/seed change does).
- The panel surfaces the pinned window, scorer version + commit, and synthetic-profile note.
- Novelty share, engagement (heat + top-N concentration), and impression-non-conversion share are shown.
- "Copy baseline reading as markdown" yields a clean, dated, paste-ready snapshot.
- The Overview tab shows a discovery-health summary linking into Recommendation Insight.
- No new table, no new tab, no new dependency; live-only / $0. New code passes Snyk.

## Test Scenarios

- Two readings over different listing states with the same scorer version → the synthetic-profile-driven comparison is unchanged (stability test for the committed seed).
- `noveltyShare`, `engagement.topNHeatShare`, and `impressionNonConversionShare` compute correctly from known fixtures (pure-helper unit tests).
- `serializeBaselineMarkdown` produces a stable, dated markdown block from a fixed insight payload.
- The methodology block reflects the bumped `SCORER_VERSION` and the commit when the env var is present, and degrades gracefully when it is absent.
- Overview discovery-health summary renders and its link activates the Insight tab.
