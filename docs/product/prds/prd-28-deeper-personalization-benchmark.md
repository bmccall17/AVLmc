# PRD 28: Deeper Personalization Benchmark

Part of the [Discovery Benchmarking initiative](../discovery-benchmark_desiredoutcomes.md) (Phase 10). Cycle **C2** (second of three). Satisfies desired outcome **2 (Deeper Personalization Benchmark)**; Outcome 1 (Discovery Baseline) shipped as [PRD 22](prd-22-discovery-baseline.md) and Outcome 3 (Social & Curator Benchmark) shipped inside [PRD 27](prd-27-social-guardrails-and-benchmark.md).

## Goal

**Show whether *real* listeners receive meaningfully different and *more useful* rankings than the anonymous baseline — not just that personalization runs, but that it helps — and that it stays diverse, explainable, and loop-protected.**

Phase 11 (Deeper Personalization, PRDs 18–21) added the scoring substrate: implicit skip cooling, a time-decayed per-dimension taste model, durable cold-start hand-off, and exploration-floor guardrails. PRD 22 established the *anonymous* baseline reading. This cycle adds the aggregate read that measures the personalized layer against that baseline: do skips measurably move ranking, which signals drove a listener's rank changes, and does personalization avoid quietly burying the quiet/local shows.

## Summary

Outcome 2 homes in the existing **Recommendation Insight** surface (the aggregate) with **Listener Trace** as the per-listener evidence — **no new tab, no new table, no new dependency**, **live-only / $0**. It is a **real-listener aggregate roll-up**: it reuses the per-listener Listener Trace scoring (`scoreListenerAgainstAnonymous`, extracted from `loadListenerTrace`) across a bounded set of real traceable listeners and rolls the personal-vs-anonymous deltas up into descriptive metrics. Output is **aggregate-only** (shares / means / counts) — no listener identity, token, or private profile value is ever included. As with PRD 22/27, a reading is **descriptive**, never a single quality score, and is recordable via a dated **copy-as-markdown** snapshot.

The **reproducible synthetic-behavior fixture** (a committed skip/engage fixture giving a reading that moves only when the algorithm changes) is intentionally **PARKED** this cycle — see *Parked* below.

## Implementation Status

**Shipped.** Delivered:

- **Aggregate roll-up** in Recommendation Insight (`lib/admin/personalization-benchmark.ts` →
  `loadPersonalizationBenchmark`, folded into `loadRecommendationInsight` so it reuses the single
  already-loaded events/counts/anonymousScores). Bounded to `MAX_LISTENERS = 15` real traceable
  listeners; cached ~30s; degrades to an `available: false` reading on any failure.
- **Reuse, not duplication**: the per-listener "load signals → score personal vs anonymous →
  surfaced ranking" core was extracted from `loadListenerTrace` into an exported
  `scoreListenerAgainstAnonymous(identityKey, events, counts, anonymousScores)` in
  `lib/admin/listener-graph.ts`; both the Listener Trace and the benchmark call it. Surfaced events
  gained a `novel` flag (the exploration-floor `novel` rule already used by Insight).
- **Pure, unit-tested metrics** (`lib/admin/insight-metrics.ts`): `computePersonalizationLift`
  (personalized share + mean/median rank displacement), `computeSkipInfluence` (listeners with
  implicit signals / a surfaced "you tend to skip…" reason), `computeSignalAttribution` (ranked
  explainable reasons across listeners), `computePersonalizationGuardrails` (mean personalized
  novelty vs anonymous baseline → `floorHolds`), `computePersonalizationCoverage`, and
  `serializePersonalizationMarkdown` (dated snapshot; honest empty-state form).
- **Presentation** (`components/admin/InsightSection.tsx`): a **Deeper Personalization** strip —
  listeners-personalized %, the skips-move-ranking headline, the novelty-floor guardrail, coverage,
  and ranked top signals — each with a plain-language definition, the "descriptive, not a quality
  score" caveat, an aggregate-only note, and a **"Copy personalization benchmark as markdown"**
  button. Per-listener evidence stays in Listener Trace.
- **Tests**: `tests/personalization-benchmark.test.ts` (9 cases) + `test:personalization-benchmark`
  script. The Listener Trace refactor is behavior-preserving (`test:insight` still green).
- **Verified**: `typecheck` / `lint` / `build` green; unit suites pass (incl. `test:registry` after
  map regeneration); Snyk **0 issues**. No new table / route / tab / dependency; $0.

### First recorded snapshot (2026-06-17, scorer v12.4)

Recorded live against Neon production (commit `0364d27`):

```
### Deeper Personalization Benchmark — 2026-06-17

- **Window:** 2026-06-17 → 2026-07-08
- **Scorer:** v12.4 (commit 0364d27)
- **Method:** Aggregate roll-up of 15 real traceable listeners' rankings vs. the anonymous baseline (capped at 15); no listener identities.
- _Descriptive snapshot — not a single quality score; aggregate only, no listener identities._

**Lift:** 100% of 15 listeners get a different top-N · mean displacement 58.3 ranks (median 36.6).
**Skips:** 1/15 listeners (7%) see a "you tend to skip…" reason · 9 surfaced events cooled — capped below explicit remove.
**Guardrail:** personalized novelty 100% vs anonymous baseline 100% — floor holds.
**Coverage:** 15/4 personalized of 16 traceable listeners.
**Top signals:** dialed down for you ×168 · happening soon ×121 · tag match ×53 · genre match: folk ×24 · genre match: jazz ×12 · genre match: jazz / blues ×11 · genre match: hip hop ×11 · genre match: folk / metal ×11
```

**Reading notes (two follow-ups this first snapshot exposed):**

1. **Coverage `withSignal` undercount — fixed.** The `15/4` reads "15 personalized but only 4 with
   signal," which is impossible. Cause: `hasSignal` didn't count implicit (impression-derived) skip
   signals, even though those personalize ranking on their own — so listeners personalized purely by
   skip-cooling weren't counted as "with signal." Fixed in `lib/admin/personalization-benchmark.ts`
   (`toRow` now includes `implicitSignals`); the next live reading should read `≈15/15 of 16`.
2. **Displacement magnitude is whole-list, not top-N.** `delta` compares a surfaced event's personal
   rank against its anonymous rank across **all** ~431 events, so a mean of 58 ranks means
   personalization pulls a listener's surfaced shows up ~58 positions from where the anonymous board
   sat them — expected given the metric, but worth stating so it isn't misread as instability. A
   future cut could add a top-N-membership-churn view alongside it.

## Goals

- Present an aggregate **Deeper Personalization reading** in Recommendation Insight covering:
  **lift/displacement** (share of real listeners whose top-N differs from anonymous, and by how
  far), **skip influence** (do impression-derived skips measurably move ranking — the Outcome-2
  headline), **signal attribution** (which explainable reasons drove personalization), **coverage**
  (how many listeners have enough signal to personalize at all), and a **loop-protection guardrail**
  (personalized novelty share vs the anonymous baseline) — each with a plain-language definition.
- Reuse the existing per-listener Listener Trace scoring rather than building a second scoring path.
- Keep the reading **aggregate-only and privacy-first** (no listener identity/tokens), **descriptive**
  (never a single quality score), and **recordable without storage** (copy-as-markdown).

## Non-Goals

- **No** reproducible synthetic-behavior fixture this cycle — explicitly **parked** (below).
- **No** new snapshot table, longitudinal store, new dependency, or new top-level tab.
- **No** change to the scoring algorithm — this cycle only observes and explains its output.
- **No** per-listener identities, OAuth tokens, or private profile values in the aggregate payload.
- **No** Social & Curator Benchmark (Outcome 3 — shipped in PRD 27).

## Parked — Synthetic Behavior Fixture

A committed, deterministic **skip/engage behavior fixture** (analogous to PRD 27's synthetic
"circle" and PRD 22's `SYNTHETIC_TASTE_SEED`), scored with the implicit/taste model maxed, would
give a **reproducible** read that "a repeatedly-skipped artist/venue/genre measurably drops, below
the explicit `remove` envelope" — a number that moves **only when the algorithm changes**.

- **Why parked now:** the real-listener aggregate answers the product question ("is it helping real
  people?") with zero new fixtures and reuses shipped machinery. The synthetic fixture is the
  *methodology-stability* upgrade — valuable but additive — and is only worth its maintenance once
  there is a discovery-scoring change to regression-guard.
- **When to implement:** before/at the next change to the Phase 11 implicit/taste scoring
  (`scoreImplicitSignals` / `buildTasteModel` in `lib/discovery.ts`) or the next `SCORER_VERSION`
  bump, so the fixed reading can be diffed across the change. It would land as a committed fixture
  feeding the same pure helpers in `lib/admin/insight-metrics.ts` (no new table). Tracked as a
  follow-up in [`discovery-benchmark_desiredoutcomes.md`](../discovery-benchmark_desiredoutcomes.md) §2
  and [`personalized-discovery-backlog.md`](../personalized-discovery-backlog.md).

## Requirements

### Aggregate roll-up (`lib/admin/personalization-benchmark.ts`)

- `loadPersonalizationBenchmark(events, counts, anonymousScores)` returns a
  `PersonalizationBenchmark` (a `PersonalizationReading` + `markdown`). It loads a bounded set of
  real traceable listeners (`listTraceableListeners`, cap `MAX_LISTENERS = 15`), scores each with
  `scoreListenerAgainstAnonymous`, reduces each to a `PersonalizationListenerRow`, and composes the
  pure helpers. Resilient: any failure → `available: false`.
- Folded into `loadRecommendationInsight` (reusing its events/counts/anonymousScores) so the only
  added cost is the bounded per-listener loader fan-out.

### Shared scoring (`lib/admin/listener-graph.ts`)

- Extract `scoreListenerAgainstAnonymous` from `loadListenerTrace` (behavior-preserving); add a
  `novel` flag to surfaced events (`score.components.novelty.base > 0`).

### Pure metrics (`lib/admin/insight-metrics.ts`)

- `computePersonalizationLift`, `computeSkipInfluence`, `computeSignalAttribution`,
  `computePersonalizationGuardrails`, `computePersonalizationCoverage`,
  `serializePersonalizationMarkdown` — dependency-free and unit-tested.

### Presentation (`components/admin/InsightSection.tsx`)

- A **Deeper Personalization** strip with the metrics above, plain-language definitions, the
  descriptive/aggregate-only caveat, and a copy-as-markdown button; honest empty state.

## Dependencies

- **PRD 09 (Recommendation Insight)** + **PRD 10 (Listener Trace)** — the surfaces this extends and
  the per-listener scoring it reuses.
- **PRD 22 (Discovery Baseline)** — the anonymous baseline + `serialize…Markdown` recording pattern.
- **Phase 11 (PRDs 18–21)** — the implicit/taste scoring this benchmark measures.
- `lib/discovery.ts` (`scoreDiscoveryEvents`, `SCORER_VERSION`, the `novelty` component),
  `lib/events.ts`, `lib/community.ts`.

## Risks

- **Reading mistaken for a grade** — mitigated by per-metric definitions and an explicit "descriptive,
  not a quality score" caveat (carries PRD 09/22's note).
- **Population drift** — a real-listener aggregate moves as the user base changes, so two readings
  aren't strictly comparable over time; mitigated by stating the listener count + method on the panel
  and snapshot, and by the parked synthetic fixture being the reproducibility upgrade when needed.
- **Per-listener re-scoring cost** — mitigated by the `MAX_LISTENERS` cap, reusing the single
  events/counts/anonymousScores load, the ~30s cache, and admin-only access.
- **Privacy** — mitigated by aggregate-only output (no identities/tokens); per-listener detail stays
  in the already-admin-gated Listener Trace.

## Acceptance Criteria

- Recommendation Insight shows a Deeper Personalization strip with lift/displacement, skip influence,
  signal attribution, coverage, and the novelty-floor guardrail, each with a plain-language definition.
- The strip is **aggregate-only** — no listener identity, token, or private profile value appears.
- "Copy personalization benchmark as markdown" yields a clean, dated, paste-ready snapshot; the empty
  state is honest when no traceable listeners have signal.
- The Listener Trace surface is unchanged (behavior-preserving refactor).
- No new table, tab, or dependency; live-only / $0. New code passes Snyk.

## Test Scenarios

- The pure helpers (`lift`, `skipInfluence`, `signalAttribution`, `guardrails`, `coverage`,
  markdown serializer) compute correctly from fixed fixtures (`tests/personalization-benchmark.test.ts`).
- `loadPersonalizationBenchmark` degrades to `available: false` when there are no traceable listeners.
- `test:insight` still passes after the Listener Trace refactor (behavior preserved).
- Live: the strip renders real aggregate numbers against Neon; the markdown snapshot copies cleanly.
