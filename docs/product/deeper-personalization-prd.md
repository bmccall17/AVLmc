# Deeper Personalization Scoring — Master PRD (Epic)

Updated: June 16, 2026

## One-Sentence Goal

Make discovery learn from what a listener *skips*, not just what they tap — evolving today's flat "most recent 240 explicit actions" model into a **time-decayed, per-dimension taste model** that safely incorporates implicit signals (impressions that never convert), stays explainable and correctable, and is structurally protected from runaway feedback loops.

## How To Use This Document

This is the umbrella tracker for the Deeper Personalization initiative (**Phase 11** in [`master-roadmap.md`](master-roadmap.md)). It synthesizes the desired outcomes in [`deeper-personalization_desiredoutcomes.md`](deeper-personalization_desiredoutcomes.md) into a sequenced series of focused PRDs in [`prds/`](prds/) (PRDs **18–21**). Treat this file the way [`admin-portal-prd.md`](admin-portal-prd.md) serves Phase 7 and [`saved-favorites-genre-prd.md`](saved-favorites-genre-prd.md) serves Phase 8: the epic owns shared architecture, cross-cutting rules, and sequencing; each cycle PRD owns one independently shippable increment.

This is Initiative A of the discovery **North Star** (*evolve discovery from "ranks what you tap" to "understands your taste and your trusted circle"*). It is the scoring substrate that Initiative B — the [Social / Curator Graph](social-curator_desiredoutcomes.md) (Phase 12) — later layers a social signal on top of. The [Discovery Benchmark](discovery-benchmark_desiredoutcomes.md) (Phase 10, Outcome 2) is the admin surface that grades whether this work actually helps.

## Current State (Brownfield Baseline)

This is not greenfield; every cycle extends the live discovery scorer.

**The scorer is a pure component model.** `scoreDiscoveryEvents` (`lib/discovery.ts:112`) scores all upcoming events and returns, per event, a `DiscoveryScoreComponents` map: the nine weighted `ListenerPreferenceKey` components (`artistAffinity`, `genreMatch`, `venuePreference`, `dateAvailability`, `socialHeat`, `localRelevance`, `novelty`, `freePaidPreference`, `outdoorIndoorPreference`) plus `customSignals` and `learnedBehavior`. Bases are produced in `getPreferenceComponentBases` and tuned per-listener in `scorePreferenceTuning` via the 0–200 weights (default 100) from `lib/listener-preferences.ts`.

**"Learning" today is shallow and flat.** `scorePersonalSignals` (`lib/discovery.ts:261`) is the entire behavioral-learning layer. It reads a listener's **most recent 240 explicit, meaningful actions** (`listDiscoveryPreferenceSignals`, `lib/discovery-memory.ts:121`) — `detail_open`, `avlgo_click`, `fire`, `planning`, `remove`, and the two contribution actions — and for each signal sums a `scoreSignalSimilarity` (`:584`) against the candidate event (eventId +10, artist +8, title +6, venue +4, tag +2, capped 12). Positive actions add `min(weight, similarity·weight·0.12)`; an explicit `remove` subtracts `min(56, similarity·8)`. The result is one flat number clamped to [−80, 70], surfaced as the **`learnedBehavior`** component with a **fixed weight of 100 (not tunable)** and coarse reasons ("matches your recent picks" / "learned from your clicks").

**Key gaps vs. the desired outcomes:**

- **Impressions are ignored.** `listDiscoveryPreferenceSignals` hard-filters its `action in (…)` list to exclude `impression`. The high-volume impression stream is captured in `event_interaction_events` but never read by scoring. There is **no concept of a skip** (an impression that never converts) — the only negative signal is an explicit `remove`.
- **No time decay, no confidence, no per-dimension aggregation.** All 240 signals count equally regardless of age; there is no half-life, no "more evidence = more weight," and no rollup into per-dimension affinities (artist / venue / genre / time-of-week / price / indoor-outdoor). Short-term intent and long-term taste are indistinguishable.
- **Loop protection is a binary floor.** `scoreNovelty` (`:516`) returns a flat +12 only when an event has near-zero social/profile/personal signal, else 0. There is no *guaranteed* exploration share and no measured assurance that diversity/novelty won't collapse as personalization sharpens.
- **No durable anonymous→account hand-off.** Identity is `user:{id}` / `session:{id}`; `getIdentityKeys` (`lib/discovery-memory.ts:481`) merges both **on read** when a request carries both, but nothing migrates session-keyed rows to the account at sign-in, so signals orphan once the anonymous cookie rotates.
- **Implicit signals aren't correctable.** Only Spotify match corrections (`spotify_event_match_corrections`) and ad-hoc custom signals exist; there is no way for a listener to override learned/implicit inference ("no, I actually like this").

**Reusable spine every cycle plugs into:** the component-base → preference-weight model (`getPreferenceComponentBases` → `scorePreferenceTuning`), the match primitives `normalizeText` / `fieldMatchStrength` / `scoreSignalSimilarity`, the append-only `event_interaction_events` stream (already including impressions) and durable `event_person_event_state`, the custom-signal/correction stores, and the Phase 7 admin observability — **Recommendation Insight** (PRD 09) and **Listener Trace** (PRD 10) — which exist precisely to validate scoring changes against real ranking output.

## Definition Of Done (Outcomes 1–5, Synthesized)

1. **Skips shape ranking** — an impression that never converts gently cools the matching artist/venue/genre, weighted far below explicit actions, decayed, capped, and applied per-dimension so no single unseen show is buried.
2. **A richer, time-decayed taste model** — per-dimension affinities (artist/venue/genre/time-of-week/price/indoor-outdoor) with recency decay and confidence weighting, separating short-term intent from long-term taste, feeding the existing component bases.
3. **Cold-start & graceful hand-off** — useful personalization before sign-in; session signals merge durably into the account at link time with no loss.
4. **Explainable & correctable** — every learned signal (including implicit cooling) carries truthful, private-safe reasons in Listener Trace and is reversible by the listener.
5. **Structurally loop-proof** — a guaranteed novelty/exploration floor and an explicit "explicit > implicit" invariant, benchmarked so diversity/novelty/local relevance do not regress against the anonymous baseline.

## Outcome → PRD Map

Build order ≠ outcome number; outcomes are re-sequenced into a dependency-sound order. Each cycle leaves the product coherent and demoable.

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 18 — Skips Cool Dimensions](prds/prd-18-skips-cool-dimensions.md) | 1 | Consume the ignored `impression` stream; a non-converting artist/venue/genre gently cools, conservatively capped/decayed, below explicit `remove`; truthful "you tend to skip these" reason; leans on the existing novelty floor. |
| C2 | [PRD 19 — Time-Decayed Per-Dimension Taste Model](prds/prd-19-time-decayed-affinity-model.md) | 2 | Replace flat recent-240 with recency-decayed, confidence-weighted per-dimension affinities; short-term intent vs. long-term taste; route through existing component bases. Generalizes C1's implicit mechanism. |
| C3 | [PRD 20 — Cold-Start & Account Hand-off](prds/prd-20-coldstart-and-account-handoff.md) | 3 | Strengthen anonymous/cold-start ranking; durably migrate session-keyed signals to the account at sign-in (idempotent, lossless). |
| C4 | [PRD 21 — Transparency, Correctability & Loop Guardrails](prds/prd-21-transparency-and-loop-guardrails.md) | 4, 5 | Per-dimension explainability in Listener Trace; a correction affordance for learned/implicit signals; a guaranteed exploration floor + "explicit > implicit" invariant; benchmark validation. |

## Delivery Sequence & Dependencies

```
C1 Skips Cool Dimensions
 └──> C2 Time-Decayed Per-Dimension Model   (generalizes C1's implicit signal)
        └──> C3 Cold-Start & Account Hand-off (hands off the richer model)
        └──> C4 Transparency, Correctability & Loop Guardrails
                 (explains/guards the signals C1+C2 introduce; validated by Phase 10 benchmark)
```

- **C1 first** — highest leverage and the headline ask (skips → ranking), shippable without the full model rewrite; it establishes the implicit-signal mechanism and conservative caps.
- **C2** generalizes C1's per-event implicit handling into a unified, decayed, per-dimension affinity model and routes contributions through the existing dials (so they become tunable).
- **C3** and **C4** both depend on C2 and are independent of each other; either may follow. C4 is the safety/accountability capstone and the natural pairing with the Phase 10 benchmark cycle.
- **Recommended order:** C1 → C2 → C3 → C4.

## Shared Architecture & Cross-Cutting Design

Decided once here; inherited by every cycle PRD.

### Implicit-signal hierarchy (the safety contract)

- **Explicit always outranks implicit.** Explicit actions (`fire`/`planning`/`remove`/contributions/clicks) and explicit corrections always dominate implicit inference for the same dimension. Implicit signals are **capped well below** the explicit `remove` magnitude (which is `min(56, …)`) and below positive action weights.
- **Per-dimension, not per-event.** Implicit cooling/warming adjusts an *artist/venue/genre* affinity, never hard-hides a specific event (only explicit `remove` hides). A quiet show a person simply hasn't seen yet must not be buried.
- **Decayed and bounded.** Every implicit contribution is recency-decayed and globally capped so it nudges rather than dominates.

### Storage: live-first ($0)

Affinities are **computed live from the `event_interaction_events` stream with caching**, consistent with the live-only benchmark posture — no new affinity table by default. A small per-listener rollup table is introduced **only if** C2 demonstrates a real performance problem at scale (Neon free Postgres; flagged against the roadmap [Scaling Milestones](master-roadmap.md), not assumed). Reads stay one-pass-per-scoring-call, never per-event.

### Reuse the component/preference-weight model

New signals feed the **existing** `getPreferenceComponentBases` → `scorePreferenceTuning` bases (artist→`artistAffinity`, venue→`venuePreference`, genre→`genreMatch`, timing→`dateAvailability`, price→`freePaidPreference`, setting→`outdoorIndoorPreference`) rather than a parallel system — so they inherit the already-shipped 0–200 dials and become tunable/cancelable. The flat `learnedBehavior` term is reduced to (or retired in favor of) these legible per-dimension contributions over C2/C4.

### Explainability & correctability by default

Every cycle that adds or changes a signal must (a) surface it with a truthful, **private-safe** reason string in event reasons and the **Listener Trace** per-dimension breakdown, and (b) keep it **reversible** — extending the V3 weights / custom-signal / match-correction model. No implicit inference ships as an opaque black box.

### Loop-safety invariants

A guaranteed exploration/novelty floor (C4, replacing the binary `scoreNovelty`) ensures a minimum share of the top-N stays novel/local even as personalization sharpens; the "explicit > implicit" invariant is enforced and unit-tested. Both are validated over time in the Phase 10 benchmark against the anonymous baseline.

### Cross-cutting requirements (apply to every cycle)

- **Validated, not guessed.** Every scoring change is checked in **Recommendation Insight** (`lib/admin/insight.ts`, `components/admin/InsightSection.tsx`) and **Listener Trace** (`lib/admin/listener-graph.ts`, `components/admin/ListenerGraphSection.tsx`); new signals must appear in those breakdowns.
- **Security at inception (mandatory).** All new first-party code passes a Snyk code scan before "done"; fix and rescan until clean.
- **$0 constraint.** No new paid hosting, database, storage, or API; stack stays Vercel Hobby + Neon free Postgres; anything approaching a free tier degrades gracefully and is flagged.
- **Privacy / PII.** Behavioral inference is listener-adjacent: never exposed in public/community responses, never in OG images, never alongside `session_id`/`user_id`; OAuth tokens never leave the server; reasons never echo private values verbatim.
- **Anonymous-first preserved.** Browsing, reacting, and contributing never require login; personalization (implicit included) is an optional layer for both anonymous sessions and signed-in accounts.
- **Architecture registration.** Any new table/route is registered in `lib/system-registry.ts` with a correct `sourceOfTruth`; `npm run generate:system-map` re-run and `npm run test:registry` green.
- **Test coverage.** Extend `tests/discovery-scoring.test.ts` for every scoring change; the existing discovery suite stays green.

## Cross-Cutting Risks

- **Feedback loops / filter bubbles** — the central risk of learning from skips. Mitigated by the per-dimension (not per-event) rule, conservative caps + decay, the guaranteed exploration floor (C4), the "explicit > implicit" invariant, and continuous benchmark validation that diversity/novelty don't regress.
- **Impression noise** — impressions are high-volume and noisy (a skip may just mean "not now"). Mitigated by weighting them far below explicit actions, requiring repetition before cooling, decaying, and capping.
- **Hot-path cost** — richer per-dimension aggregation over a larger window could slow the scoring pass. Mitigated by live-compute-with-cache, one read per pass, bounded windows, and the rollup-table escape hatch only if measured.
- **Creepiness / accountability** — behavioral inference can feel invasive. Mitigated by explainable reasons, full correctability, and anonymous-first defaults.
- **Retention coupling** — using impressions changes the prune story; any impression-prune job must not delete within the active signal window. Flagged for C1.
- **Brownfield regression** — changes touch the hot discovery path. Mitigated by additive, behavior-preserving edits; anonymous Best Bets and explicit fire/plan/remove keep working at every step.

## Initiative-Level Success Criteria

- A signed-in listener's ranking **measurably reflects what they skip**, not just what they tap — visible in Recommendation Insight / Listener Trace.
- Personalization reflects **per-dimension, time-decayed** taste (recent intent vs. long-term), tunable via the existing dials.
- Anonymous personalization is useful from the first interactions, and signing in **merges prior session signals** with no loss.
- Every learned signal is **explainable** in Listener Trace and **correctable** by the listener.
- Diversity, novelty, and local relevance **do not regress** when implicit signals are enabled (benchmarked vs. the anonymous baseline); no runaway loop; explicit signals dominate implicit ones.
- No tokens or PII leak in public responses; all new code passes Snyk; the whole initiative ships at $0.

## Open Decisions & Assumptions

- **Assumed:** live-computed affinities with caching are sufficient; a per-listener rollup table is added only if C2 shows a measured perf problem (decided in C2).
- **Assumed:** implicit contributions feed the **existing** component bases/weights rather than introducing a new "implicit" dial; revisit only if listeners need to tune implicit influence separately (candidate for C4).
- **Assumed:** the flat `learnedBehavior` component is progressively replaced by legible per-dimension contributions over C2/C4 rather than kept as an opaque term.
- **Assumed:** correctability for implicit signals can reuse the existing custom-signal/correction channel (`listener_discovery_preferences` / a correction table) rather than a new bespoke store; finalized in C4.
- **Assumed:** PRD numbering continues the existing sequence (18–21) and this registers as **Phase 11**; cycle labels C1–C4 are scoped to this initiative (distinct from other phases' cycle numbering).
- **Open:** the exact decay half-life(s), confidence function, impression-repetition threshold for cooling, and exploration-floor share — to be set with concrete values in C2/C4 and tuned against the benchmark.
