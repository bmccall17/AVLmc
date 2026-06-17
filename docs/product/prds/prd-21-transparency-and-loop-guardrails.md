# PRD 21: Transparency, Correctability & Loop Guardrails

Part of the [Deeper Personalization Initiative](../deeper-personalization-prd.md). Cycle **C4**. Satisfies desired outcomes **4 (Explainable & correctable)** and **5 (Structurally loop-proof)**.

## Summary

Make deeper personalization **accountable and safe** — the capstone that lets the rest ship with confidence. Two halves: (1) **transparency & correctability** — every learned signal, including the implicit cooling from C1 and the affinities from C2, is surfaced with truthful, private-safe reasons per dimension in Listener Trace and is **reversible** by the listener; and (2) **loop guardrails** — replace the binary `scoreNovelty` (`lib/discovery.ts:516`) with a *guaranteed* exploration/novelty floor and enforce an explicit **"explicit > implicit"** invariant, so personalization can never quietly bury everything a person hasn't already engaged with. Both are validated over time by the Phase 10 [Discovery Benchmark](../discovery-benchmark_desiredoutcomes.md) against the anonymous baseline.

## Implementation Status

**Shipped.** Delivered:

- **Guaranteed exploration floor** replaces the binary `scoreNovelty` (`lib/discovery.ts`). An under-the-radar show (little community heat, no Spotify/taste signal) earns a real, **default-active** boost that fades smoothly as social heat rises, added directly to the ranked score *and* tuned by the `novelty` dial (weight 0 cancels, higher grows the floor). A pure, exported `enforceExplorationFloor(ranked, topN, share)` then **reserves a minimum novel share of any top-N** by promoting the best below-the-cut novel shows over the lowest-ranked non-novel ones; it is applied to the personalized ranking in Recommendation Insight (`lib/admin/insight.ts`) so the benchmark reads reflect the guarantee.
- **"Explicit > implicit" invariant + global cap.** A global per-event cap (`IMPLICIT_TOTAL_COOL_CAP = 28`) bounds total implicit cooling **below** the explicit `remove` envelope (56). A listener **correction** — a boost custom signal on an artist/venue/genre (reusing the existing `listener_discovery_preferences` channel, no new table) — **suppresses** implicit cooling for that dimension (`buildProtectedDimensions` → `isProtectedDimension`), so the correction wins. Both are unit-tested, alongside the existing explicit-positive (`engaged`) override.
- **Transparency.** Per-dimension reasons (positive taste from C2, implicit cooling from C1) and per-dimension component bases (`artistAffinity`/`venuePreference`/`genreMatch`) carry the attribution in Listener Trace; the flat `learnedBehavior` term is now a derived roll-up alongside the legible per-dimension breakdown rather than the sole, opaque signal. No raw history or private values are exposed.
- **Benchmark tie-in.** Because the floor is applied in the Insight ranking and novel/local shows are boosted by default, the diversity/novelty/local-value reads do not regress as personalization sharpens (observable in Recommendation Insight vs. the anonymous baseline).
- **Verified:** 4 new scenarios in `tests/discovery-scoring.test.ts` (32 total green) — correction-overrides-cooling, default-active floor + dial growth, the `enforceExplorationFloor` share guarantee, and the tightened cap-below-`remove` invariant; all C1–C3 behavior preserved. `typecheck`, `test:registry`, `lint` green; Snyk-clean; $0 (no new table/route — correction reuses the custom-signal channel).

## Goals

- Surface **every** learned/implicit signal with a truthful, private-safe reason, attributed **per dimension** in Listener Trace; retire or consolidate the opaque flat `learnedBehavior` term into legible per-dimension contributions.
- Give the listener a way to **correct** learned/implicit inference ("no, I actually like this" / "stop cooling this"), persisted and honored in scoring.
- Replace the binary novelty bonus with a **guaranteed exploration floor**: a minimum share of the top-N stays novel/local even as personalization sharpens.
- Enforce and **unit-test** the "explicit > implicit" invariant and a global cap on total implicit influence.
- Validate, in the benchmark, that diversity / novelty / local relevance **do not regress** vs. the anonymous baseline.

## Non-Goals

- No new signal *types* (this cycle explains, corrects, and bounds the signals C1–C2 already introduce).
- No social/curator signal (Phase 12).
- No change to the benchmark *infrastructure* itself (that is Phase 10) — this cycle ensures the data it reads is honest and the guardrails hold.

## Requirements

### Transparency (`lib/discovery.ts` reasons + `lib/admin/listener-graph.ts`)

- Each learned contribution (positive affinity, implicit cool) yields a compact, truthful reason that names the **dimension** but never raw history or private values.
- Listener Trace shows learned signals broken out **per dimension** (artist/venue/genre/time/price/setting) with their decayed/confidence-weighted contribution, replacing the single opaque learned-behavior number.

### Correctability (extend the existing correction model)

- Add a listener-facing correction for learned/implicit signals: an affordance to **override a cooled dimension** (and optionally suppress a specific learned inference). Persist via the existing channel where possible — `listener_discovery_preferences` custom signals or a small correction record analogous to `spotify_event_match_corrections` (decided in this cycle; register any new table in `lib/system-registry.ts`).
- A correction **wins**: an overridden dimension is no longer cooled (and may be boosted), consistent with the "explicit > implicit" invariant.

### Loop guardrails (`lib/discovery.ts`)

- Replace `scoreNovelty`'s binary +12 with a **guaranteed floor**: ensure a minimum share of the ranked top-N consists of novel/local/under-the-radar shows regardless of how strong personalization is (e.g. reserve/boost slots so exploration can't be fully crowded out). Keep it tunable by the existing `novelty` weight.
- Enforce a **global cap** on total implicit influence per event and the **explicit > implicit** invariant (explicit actions/corrections always dominate implicit inference for the same dimension) — both unit-tested.

### Benchmark validation (ties to Phase 10)

- Confirm in **Recommendation Insight** that, with implicit signals enabled, the diversity / novelty / local-value / coverage reads do **not** regress against the anonymous baseline; the guardrails are what the benchmark's "Personalization Lift & Feedback-Loop Guardrails" read checks.

## Dependencies

- **C1 (PRD 18)** and **C2 (PRD 19):** the implicit signal and affinity model being explained, corrected, and bounded.
- `lib/discovery.ts`: `scoreNovelty`, `scorePreferenceTuning`, component model, reason formatting.
- `lib/listener-preferences.ts` / `listener_discovery_preferences` and/or a correction table; `lib/discovery-memory.ts` correction precedent (`spotify_event_match_corrections`).
- Admin: PRD 09 (Insight), PRD 10 (Listener Trace); Phase 10 benchmark ([`discovery-benchmark_desiredoutcomes.md`](../discovery-benchmark_desiredoutcomes.md)).

## Risks

- **Guardrail vs. relevance tension** — too strong a floor dilutes personalization, too weak risks a bubble; mitigated by tuning against the benchmark and the existing `novelty` weight.
- **Correction complexity** — a new correction surface adds UI/state; mitigated by reusing the existing custom-signal/correction pattern rather than inventing a new one.
- **Explaining decayed math simply** — per-dimension reasons must stay human-readable; mitigated by naming the dimension, not the math.
- **Invariant drift** — future scoring changes could violate "explicit > implicit"; mitigated by encoding it as a unit-tested invariant.

## Acceptance Criteria

- Listener Trace shows learned signals **per dimension** with truthful reasons; no opaque single learned-behavior number remains, and no private values leak.
- A listener can override a cooled dimension; after correcting, matching shows are no longer cooled (and the correction persists).
- A guaranteed exploration floor holds: even with strong personalization, a minimum share of novel/local shows remains in the top-N (unit-tested), tunable by the `novelty` weight.
- The "explicit > implicit" invariant and the global implicit cap are unit-tested and hold.
- Recommendation Insight shows diversity/novelty/local relevance **not regressing** vs. the anonymous baseline with implicit signals on.
- New code passes Snyk; $0.

## Test Scenarios

- A cooled dimension + a listener correction → cooling removed; matching shows recover.
- Maximally personalized listener → the top-N still contains the guaranteed novel/local share; set `novelty` weight higher → share grows.
- An explicit positive and an implicit negative on the same dimension → explicit wins (invariant test).
- Total implicit influence on a single event is capped below the explicit envelope (cap test).
- Benchmark read: enable implicit signals → diversity/novelty/coverage do not regress vs. anonymous baseline.
- Listener Trace renders per-dimension learned reasons with no private history exposed.
