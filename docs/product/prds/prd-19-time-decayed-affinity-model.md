# PRD 19: Time-Decayed Per-Dimension Taste Model

Part of the [Deeper Personalization Initiative](../deeper-personalization-prd.md). Cycle **C2**. Satisfies desired outcome **2 (A richer, time-decayed taste model)**.

## Summary

Replace the flat "most recent 240 equally-weighted signals" model with a **time-decayed, confidence-weighted, per-dimension taste model**. Today `scorePersonalSignals` (`lib/discovery.ts:261`) sums per-signal similarity with no notion of recency, evidence volume, or which *dimension* a person actually likes. This cycle aggregates a listener's behavior (explicit actions from C0 plus the implicit non-conversion signal from C1) into separate, recency-decayed affinities for **artist, venue, genre, time-of-week, price (free/paid), and indoor/outdoor**, distinguishes **short-term intent** from **long-term taste**, and routes each affinity into the matching existing component base so it inherits the already-shipped dials. This is the core modeling cycle and generalizes C1's per-event implicit handling into one coherent model.

## Implementation Status

**Planned.**

## Goals

- Aggregate behavior into **per-dimension affinities** (artist / venue / genre / time-of-week / price / indoor-outdoor) instead of a single flat learned-behavior number.
- Apply **recency decay** (a half-life) and **confidence weighting** (more evidence → more weight) so taste reflects the shape and strength of behavior over time.
- Separate **short-term intent** (a recent window) from **long-term taste** (decayed lifetime) and blend them sensibly.
- Route each affinity into the matching component base (`artistAffinity`, `venuePreference`, `genreMatch`, `dateAvailability`, `freePaidPreference`, `outdoorIndoorPreference`) so it is tunable by existing weights and explainable per-dimension.
- Keep storage **live-first** (computed + cached); add a rollup table only if a measured perf problem appears.

## Non-Goals

- No social/curator signal (Phase 12).
- No new preference dials — affinities ride the existing nine controls.
- No change to the explicit-action capture pipeline or the implicit-signal *definition* from C1 (this cycle consumes both, it doesn't redefine them).
- No machine-learning model or external service — this is deterministic, explainable aggregation ($0, on-server).

## Requirements

### Per-dimension affinity aggregation (`lib/discovery.ts` + a focused module)

- Introduce an affinity builder (e.g. `lib/listener-affinity.ts`) that turns a listener's signal stream into per-dimension affinity scores. Dimensions: **artist**, **venue**, **genre** (via the C4 genre taxonomy / `resolveGenres`), **time-of-week** (derived from `event.eventDate`/`startsAt`), **price** (free/paid wording, reusing the `freePaidPreference` keywords), **indoor/outdoor** (reusing the `outdoorIndoorPreference` keywords).
- Each signal contributes to its dimension(s) weighted by **action strength** (existing `getPositiveActionWeight`; implicit negatives from C1) **× recency decay × a confidence factor** (more observations → higher confidence, with diminishing returns).
- Maintain two views per dimension: **short-term intent** (steep decay / recent window) and **long-term taste** (gentle decay over a larger window), blended into the base contribution.

### Route affinities into component bases (`getPreferenceComponentBases`)

- Feed each affinity into the matching base so it is tuned by the corresponding existing weight in `scorePreferenceTuning` and bounded by the existing component ceilings (e.g. `VENUE_PREFERENCE_CEILING`).
- Progressively reduce reliance on the opaque flat `learnedBehavior` term in favor of these legible per-dimension contributions (full consolidation/labeling lands in C4).

### Storage & performance (live-first)

- Compute affinities **once per scoring pass** from a single bounded read (replace/extend the 240-row cap with a decayed aggregation over a larger but bounded window); cache per identity (mirror the insight 30s cache pattern where appropriate).
- **Decision point:** if profiling shows the live aggregation is too slow at realistic data volumes, introduce a small additive per-listener rollup table (registered in `lib/system-registry.ts`); otherwise stay table-free. Record the decision in this PRD's Implementation Status when shipped.

### Explainability

- Each affinity that moves a ranking must be attributable per-dimension in **Listener Trace** and produce a truthful reason (e.g. "matches your taste in <venue/genre>") without exposing raw history.

## Dependencies

- **C1 (PRD 18):** the implicit non-conversion signal this model consumes alongside explicit actions.
- `lib/discovery.ts`: `scorePersonalSignals`, `getPreferenceComponentBases`, `scorePreferenceTuning`, `getPositiveActionWeight`, `scoreSignalSimilarity`, component ceilings, `normalizeText`.
- `lib/discovery-memory.ts`: the signal reads (explicit + implicit).
- `lib/genre-taxonomy.ts`: `resolveGenres` for the genre dimension.
- `lib/listener-preferences.ts`: existing weights/controls.
- Admin Phase 7: PRD 09 (Insight), PRD 10 (Listener Trace).

## Risks

- **Hot-path cost** — the biggest risk; mitigated by one bounded read per pass, caching, and the rollup-table escape hatch only if measured.
- **Over-personalization / narrowing** — a sharper model can narrow the board; mitigated by confidence weighting (sparse evidence → weak effect), the existing dials, and the C4 exploration floor.
- **Decay/confidence mis-tuning** — wrong half-life buries or over-weights taste; mitigated by starting conservative, unit-testing the math, and tuning against the Phase 10 benchmark.
- **Cold-start thinness** — few signals yield noisy affinities; mitigated by confidence weighting and handled further in C3.

## Acceptance Criteria

- Ranking reflects **per-dimension** taste: e.g. strong, recent jazz/venue engagement raises matching shows more than a single old tap, and the effect is attributable per-dimension in Listener Trace.
- Recency matters: recent behavior outweighs equally-similar stale behavior (unit-tested).
- Confidence matters: one observation produces a weak effect; many produce a stronger (bounded) one.
- Affinities are tuned by the existing weights (setting a dimension's weight to 0 cancels its affinity) and stay within component ceilings.
- A storage decision (live vs. rollup) is recorded with its performance rationale.
- Anonymous ranking still works; new code passes Snyk; $0.

## Test Scenarios

- Two listeners with the same total signals but different recency → the more-recent listener ranks the matching dimension higher.
- One vs. many observations of the same artist/genre → bounded, increasing effect with more evidence.
- Set `genreMatch` (or `venuePreference`) weight to 0 → the corresponding affinity contribution disappears.
- Short-term intent vs. long-term taste diverge (a recent mood shift) → ranking reflects recent intent without erasing long-term taste.
- Profiling scenario at representative volume → scoring pass stays within budget (documents the storage decision).
- Listener Trace attributes each affinity to its dimension with a truthful reason.
