# PRD 26: Social Signal in Discovery

Part of the [Social / Curator Graph initiative](../social-curator-prd.md) (Phase 12). Cycle **C4** (fourth of five). Satisfies desired outcome **4 (Social Signal in Discovery — optional, distinct, bounded)**. Depends on **C1 (PRD 23 graph)**, **C2 (PRD 24 attribution)**, **C3 (PRD 25 curators)**, and the shipped **Phase 11** scoring model. Guardrail measurement/enforcement (Outcome 5) lands in C5.

## Goal

**Make trusted-circle / followed-curator activity an optional ranking input — a new scoring component, clearly distinct from anonymous public `socialHeat` ("your people" vs. "the crowd") — that a listener can opt into and tune via its own preference weight, capped so it can never drown out local relevance and novelty.**

This is the first cycle that touches ranking. It introduces a **tenth** `ListenerPreferenceKey`, `socialCircle`, that is the first dial to default to **0 (off)**: a listener opts in by raising it. Its contribution is bounded below the Phase 11 exploration floor and is fully explainable + attributed in Recommendation Insight / Listener Trace.

## Summary

A new `socialCircle` component is added to `lib/discovery.ts`, `lib/listener-preferences.ts`, Recommendation Insight, and Listener Trace. Its base is computed live from the C1 graph: for each candidate event, the viewer's **followed-and-opted-in** friends going/firing it (C2's `getCircleEventActivity`) and any **followed curator's pick** of it (C3) contribute a bounded, saturating boost — distinct from the anonymous `socialHeat` so popularity is never double-counted. It routes through a **new dial** (`socialCircle`, default **0**), so it is off unless the listener opts in, and it is **hard-capped** below the local/novel exploration floor from Phase 11 so it can nudge but never dominate. Anonymous and not-opted-in sessions get exactly 0 from this component — the anonymous board is byte-for-byte unchanged. Truthful, private-safe reasons ("3 people you follow are going", "picked by [curator you follow]") attribute the boost in event reasons + Listener Trace, naming only people/curators inside the viewer's own circle.

## Implementation Status

**Shipped — June 17, 2026.**

Trusted-circle / followed-curator activity is now an optional, distinct, bounded ranking input:

- **New dial.** `socialCircle` added to `ListenerPreferenceKey`, `PREFERENCE_KEYS`, `LISTENER_PREFERENCE_CONTROLS` (label **"Your people"**) and `DEFAULT_LISTENER_WEIGHTS = 0` — the first dial that defaults to 0/off. `normalizeWeights` preserves 0 (verified). The dial appears in the listener-preferences panel and surfaces in Insight/Trace automatically (both iterate the controls).
- **Scoring component (`lib/discovery.ts`).** A new `socialCircle` base via the pure, exported `scoreSocialCircleBase(activity, followedCuratorPickCount)` — saturating (firing > going > pick weight; a 4th person adds little), sourced **only** from the viewer's own circle (C2 `getCircleEventActivity`) and **followed** curators' picks (C3 `getFollowedCuratorPicks`), never the crowd, so it never double-counts `socialHeat`. Special-cased in `scorePreferenceTuning` (off-by-default `base·(weight/100)`, not the default-100 `base·((weight-100)/100)`), with a **hard cap** `SOCIAL_CIRCLE_CAP = 10` set **below** `EXPLORATION_FLOOR_BASE = 14` so it can reorder within the personalized band but never evict the Phase 11 novel/local floor (unit-tested). **Anonymous-null**: no viewer/graph/dial → 0; `SCORER_VERSION` bumped `11.4 → 12.4`.
- **Attribution.** Truthful, private-safe reasons — `"N people you follow are going · M firing"` (reusing `summarizeCircleLabel`) and `"picked by [curator]"` — shown only when the dial > 0; in-circle names only, never an out-of-circle identity.
- **Threading.** `app/page.tsx` fetches `circleActivityByEvent` + `followedCuratorPicksByEvent` (batched) and passes both into `scoreDiscoveryEvents`; `EventBoard` threads both into its client re-score so the dial is live.
- **Tests.** `tests/discovery-scoring.test.ts` extended (6 scenarios): dial-0 == baseline, dial-up lifts capped, saturation, followed-curator pick + reason, `socialCircle`⊥`socialHeat`, anonymous → 0. `svc-discovery` node description updated + system map regenerated.
- **Quality.** `test:discovery` (38), `test:registry`, `test:insight`, typecheck, lint, `next build`, and Snyk all green; no pay-to-play path; no Spotify writes; $0. The anonymous board is unchanged byte-for-byte.

## Goals

- A new `socialCircle` scoring component, **distinct** from `socialHeat`, fed by the viewer's followed-and-opted-in friends' going/firing and followed curators' picks.
- A new `socialCircle` **dial** (`ListenerPreferenceKey`) that **defaults to 0** (off); raising it opts the listener in and tunes the influence, mirroring the V3 controls.
- The component is **hard-capped** so it can never displace the local/novel exploration floor (Phase 11) — it nudges, never dominates; **no money path** sets or raises it.
- Anonymous and not-opted-in sessions get **0** from this component (anonymous board unchanged byte-for-byte).
- The contribution is **explainable + attributed** in Recommendation Insight and Listener Trace — naming the specific in-circle friends/curators that drove a rank change, never anyone outside the viewer's circle.

## Non-Goals

- **No** change to the anonymous `socialHeat` component or the anonymous ranking; the two stay separate.
- **No** new social-activity table — the base reuses C2's live-computed `getCircleEventActivity` + C3's `getCuratedByForEvents` (caching as needed).
- **No** pay-to-play, no purchasable boost, no admin override of an individual's rank.
- **No** default-on behavior — opt-in only (dial starts at 0).
- **No** Spotify writes; **no** new OAuth scope.

## Requirements

### New preference key (`lib/listener-preferences.ts`)

- Add `socialCircle` to `ListenerPreferenceKey`, `PREFERENCE_KEYS`, `LISTENER_PREFERENCE_CONTROLS` (label **"Your people"**, description: *"How much shows your followed friends and curators are into should lift the list. Off until you turn it on."*), and `DEFAULT_LISTENER_WEIGHTS` with value **0** (the first non-100 default). `normalizeWeights` must preserve 0 as a valid weight (verify it does not coerce 0 → default).

### Scoring component (`lib/discovery.ts`)

- Add a `socialCircle` base in `getPreferenceComponentBases` computed from, for each event: the count/recency of the viewer's **entitled** circle going/firing (via C2) + a curator-pick bump for **followed** curators (via C3). Saturating (diminishing returns past a few people) so one well-connected event can't run away.
- Route it through `scorePreferenceTuning` like the other components (0–200 dial; default 0 means it contributes nothing until opted in; dial cancels to 0).
- **Hard cap:** the post-tuning `socialCircle` contribution is clamped to a ceiling chosen so it sits **below** the Phase 11 exploration-floor reservation — i.e. it can reorder within the personalized band but cannot evict the guaranteed novel/local share. Document the constant next to the Phase 11 cap constants; unit-test the invariant.
- **Anonymous-null:** with no viewer / no graph / dial 0, the component returns 0 — the anonymous `scoreDiscoveryEvents` output is unchanged. Bump `SCORER_VERSION` (`lib/discovery.ts`) on this change (per PRD 22 discipline).
- Truthful reasons: `"3 people you follow are going"`, `"picked by [curator]"` — counts + in-circle names only, never private values or out-of-circle identities.

### Explainability (`lib/admin/insight.ts`, `lib/admin/listener-graph.ts` + sections)

- Surface `socialCircle` as its own component in Recommendation Insight's signal mix and in Listener Trace's per-dimension breakdown, attributed to the specific in-circle friends/curators (within the traced listener's own circle). Make clear it is **distinct** from `socialHeat`.

### Frontend

- The board's client re-score threads the new component (consistent with how saved-favorites/Phase 11 components were threaded). The new dial appears in the listener-preferences panel grouped/labeled so "Your people" reads as distinct from "Social heat".

### Architecture & quality

- Update the discovery node + Recommendation Insight node descriptions in `lib/system-registry.ts` if their role changes; regenerate the system map; `npm run test:registry` passes.
- Extend `tests/discovery-scoring.test.ts`: dial-0 contributes nothing; anonymous/no-graph yields 0; the contribution saturates; the **cap-below-exploration-floor** invariant holds; `socialCircle` is independent of `socialHeat` (changing one does not move the other).
- Snyk scan; confirm no out-of-circle identity or PII leaks into reasons/responses; $0.

## Dependencies

- **C1 (PRD 23)** — `listener_follows`, `canViewActivityOf`.
- **C2 (PRD 24)** — `getCircleEventActivity` (entitled going/firing base).
- **C3 (PRD 25)** — `getCuratedByForEvents` + followed-curator resolution.
- **Phase 11** — the component-base → dial model, the exploration floor (`enforceExplorationFloor`) + cap constants in `lib/discovery.ts`, `SCORER_VERSION`.
- Recommendation Insight (`lib/admin/insight.ts`) + Listener Trace (`lib/admin/listener-graph.ts`) for validation.

## Risks

- **Drowning local/novel discovery (headline).** A strong social signal could bury quiet local shows. Mitigated by off-by-default (dial 0), the hard cap below the exploration floor, saturation, and C5's benchmark check that diversity/novelty don't regress.
- **Double-counting popularity.** A popular event already lifts `socialHeat`; if `socialCircle` mirrored it, popularity would count twice. Mitigated by sourcing only the viewer's *own circle* (not the crowd) and unit-testing independence from `socialHeat`.
- **Influence concentration.** One hyper-connected curator/friend could dominate a listener's board. Mitigated by saturation + the cap, and surfaced by C5's concentration warning.
- **Privacy leak via reasons.** Attribution strings could expose out-of-circle identities. Mitigated by naming only in-circle people/curators and routing through C1's entitlement gate.
- **Hot-path cost.** Mitigated by reusing C2/C3's batched, cached reads (one pass per scoring call).

## Acceptance Criteria

- With the `socialCircle` dial at 0 (default), ranking is identical to today; raising it lifts events the viewer's entitled circle is into, bounded by the cap.
- `socialCircle` is a **distinct** component from `socialHeat` in scoring, Insight, and Trace; changing one does not move the other.
- The component can **never** evict the Phase 11 guaranteed novel/local share (cap-below-floor invariant, unit-tested).
- Anonymous / no-graph / dial-0 → the component is 0; the anonymous board is unchanged; `SCORER_VERSION` bumped.
- Reasons + Trace attribute the boost to specific in-circle friends/curators only; no out-of-circle identity or PII appears.
- `tests/discovery-scoring.test.ts` extensions + `npm run test:registry` pass; Snyk-clean; $0.

## Test Scenarios

- Dial 0 → `socialCircle` contributes 0 for every event (ranking == baseline). Dial 100/200 → entitled-circle events rise, capped.
- Three followed-and-opted-in friends going an event → saturating boost with reason "3 people you follow are going"; a fourth adds little.
- A followed curator picks an event → "picked by [curator]" boost; an un-followed curator's pick contributes 0 to this viewer.
- Construct an event the circle loves but that is non-novel/non-local → it cannot push the reserved novel/local top-N share below the Phase 11 floor.
- Change anonymous community heat only → `socialHeat` moves, `socialCircle` does not (and vice versa).
- Anonymous request → component 0, ranking byte-for-byte unchanged from pre-cycle.
</content>
