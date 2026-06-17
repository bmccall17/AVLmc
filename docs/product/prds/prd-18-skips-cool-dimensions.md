# PRD 18: Skips Cool Dimensions

Part of the [Deeper Personalization Initiative](../deeper-personalization-prd.md). Cycle **C1**. Satisfies desired outcome **1 (Skips shape ranking)**.

## Summary

Teach discovery to learn from what a listener *skips*. Today the only negative signal is an explicit `remove`; the high-volume `impression` stream is captured in `event_interaction_events` but filtered out of scoring entirely (`lib/discovery-memory.ts:136`). This cycle starts reading impressions and treats an artist/venue/genre that a listener is **repeatedly shown but never engages with** as a soft *negative* — gently cooling that dimension in their ranking. The signal is deliberately conservative: per-dimension (never hiding a single event), weighted far below explicit actions, recency-decayed, and capped well under the explicit `remove` magnitude. It establishes the implicit-signal mechanism that C2 later generalizes into a full per-dimension affinity model.

## Implementation Status

**Shipped.** Delivered:

- **Impression stream is now read.** `listImplicitSignals` (`lib/discovery-memory.ts`) aggregates the previously-ignored `impression` rows server-side over a bounded 90-day window (`IMPLICIT_SIGNAL_WINDOW_DAYS`), returning per-(dimension, value) non-conversion signals — impression count, last-impression timestamp, and an `engaged` flag (any positive engagement for that artist/venue/tag). Reuses the merged anonymous+account `identity_key = any(...)` read; one bounded query per scoring pass (never per-event, never raw rows); tolerates a missing table → empty.
- **Skips cool dimensions.** `scoreImplicitSignals` + `buildImplicitSkipSignals` (`lib/discovery.ts`) turn a repeatedly-shown-but-never-engaged dimension into a gentle, recency-decayed cool, folded into the personal contribution and the matching `artistAffinity` / `venuePreference` / `genreMatch` / `learnedBehavior` bases. Conservative by construction: repetition threshold (≥4 impressions), 30-day half-life decay, per-dimension cap (12) and total cap (24) **strictly below** the explicit `remove` magnitude, and overridden by any explicit positive (`engaged`). Reuses `normalizeText` / `fieldMatchStrength`; never hides an event (only `remove` hides); the novelty floor is untouched.
- **Explainable.** Truthful, private-safe reasons (`you tend to skip this artist` / `this venue` / `shows like this`) surface when cooling is material; per-dimension attribution flows into the Listener Trace component breakdown; Recommendation Insight's behavior view shows the impression count + an `implicitLearningActive` flag (`lib/admin/insight.ts`, `components/admin/InsightSection.tsx`).
- **Wired** into the live board (`app/page.tsx`), the discovery sandbox, and the Listener Trace (`lib/admin/listener-graph.ts`).
- **Retention coordination** flagged: any impression-prune job must not delete rows inside the active 90-day signal window (`personalized-discovery-backlog.md`).
- **Verified:** 6 new scenarios in `tests/discovery-scoring.test.ts` (23 total green) including the provable cap-below-`remove` invariant; `typecheck`, `test:registry`, `lint` green; Snyk-clean; $0 (no new table/route — live-first per the epic).

## Goals

- Consume `impression` rows (today ignored) and derive per-listener **non-conversion** signals: an artist/venue/genre shown repeatedly with zero positive engagement.
- Apply a **soft, per-dimension negative** that gently lowers matching shows — never a hard hide (only explicit `remove` hides).
- Keep it conservative and safe: capped below `remove`, recency-decayed, and overridable by any explicit positive signal for the same dimension.
- Surface a truthful, private-safe reason (e.g. "you tend to skip shows like this") and make the effect visible in **Recommendation Insight** / **Listener Trace**.
- Preserve the existing novelty floor so cooling cannot, on its own, collapse discovery (full guardrail is C4).

## Non-Goals

- No time-decayed, confidence-weighted per-dimension affinity *model* — that is C2 (this cycle is the minimal, conservative implicit-negative mechanism).
- No hard-hiding of events from impressions; `remove` remains the only hide.
- No new preference dial (the contribution rides existing component bases / the learned-behavior term).
- No change to anonymous-vs-signed-in *positive* learning beyond adding the implicit negative.
- No correction UI for implicit signals yet (C4) — though the effect must already be explainable.

## Requirements

### Read the impression stream (`lib/discovery-memory.ts`)

- Add an accessor (e.g. `listImplicitSignals` / extend the signal read) that returns, per identity (`getIdentityKeys`), the data needed to detect non-conversion: impression counts per artist/venue/genre dimension and whether any positive engagement (`detail_open`/`avlgo_click`/`fire`/`planning`/contribution) exists for the same dimension within the window.
- Reuse the `identity_key = any(...)` merged anonymous+account read. Bound the window/row count for the hot path (mirror the existing 240 cap discipline; impressions are higher-volume, so aggregate rather than return raw rows where possible).
- Tolerate a missing table (existing `isMissingRelationError` → empty) so the board never breaks.

### Define non-conversion conservatively

- A dimension cools only after a **repetition threshold** (shown ≥ N times) with **zero** positive engagement for that dimension — a single skip does nothing.
- Recency-decay the contribution so stale skips fade.
- An explicit positive for the dimension (or an explicit `remove`, which already handles the event) **overrides** the implicit cool.

### Apply the soft negative (`lib/discovery.ts`)

- Fold the implicit negative into the personal/learned layer (extend `scorePersonalSignals` or add a sibling `scoreImplicitSignals` consumed in `getPreferenceComponentBases`), applied **per-dimension** to the relevant base (artist→`artistAffinity`, venue→`venuePreference`, genre→`genreMatch`).
- **Cap below explicit:** the maximum implicit cool is strictly less than the explicit `remove` magnitude (`min(56, …)`) and below positive action weights, enforcing the "explicit > implicit" invariant.
- Reuse `normalizeText` / `fieldMatchStrength` so dimension matching is consistent with the rest of scoring.

### Reasons & observability

- Add a compact, truthful reason (e.g. `you tend to skip these`) when an implicit cool meaningfully lowers a show; never expose raw counts or private values.
- Ensure the contribution appears in the **Recommendation Insight** behavior view (`lib/admin/insight.ts`) and is attributable per-dimension in **Listener Trace** (`lib/admin/listener-graph.ts`).

### Retention coordination

- Document that any impression-prune job must **not** delete impressions within the active signal window (impressions are now signal, not bloat). Flag the prune note in the backlog/retention surface.

## Dependencies

- `lib/discovery-memory.ts`: `listDiscoveryPreferenceSignals`, `getIdentityKeys`, `isMissingRelationError`; `event_interaction_events` (already stores `impression`).
- `lib/discovery.ts`: `scorePersonalSignals`, `getPreferenceComponentBases`, `scoreSignalSimilarity`, `normalizeText`, `fieldMatchStrength`, `scoreNovelty` (existing floor).
- Admin Phase 7 surfaces: PRD 09 (Insight), PRD 10 (Listener Trace).
- Epic shared contract: implicit-signal hierarchy, live-first storage.

## Risks

- **Feedback loop / over-cooling** — mitigated by the repetition threshold, per-dimension scope, sub-`remove` cap, decay, the existing novelty floor, and explicit override; full guardrail in C4.
- **Impression noise** ("skip" may mean "not now") — mitigated by requiring repetition and weighting far below explicit actions.
- **Hot-path cost** (impressions are high-volume) — mitigated by aggregating in the read, bounding the window, one read per scoring pass.
- **Mis-attribution in admin** — mitigated by a distinct reason label and per-dimension breakdown.

## Acceptance Criteria

- A signed-in (or anonymous-session) listener repeatedly shown an artist/venue/genre they never engage with sees matching shows **gently** lower — visible in Listener Trace.
- A single impression, or any explicit positive for the dimension, produces **no** cooling (explicit overrides implicit).
- The maximum implicit cool is provably below the explicit `remove` magnitude (unit-tested).
- No event is hidden by an impression; only `remove` hides.
- A truthful "you tend to skip these" reason appears when cooling is material; no private values leak.
- Anonymous browsing still works; missing table degrades to no-op; new code passes Snyk; $0.

## Test Scenarios

- Impress an artist N times with no engagement → that artist's matching events cool; below threshold → no effect.
- Impress then `fire`/`planning` the dimension → cooling is overridden (explicit wins).
- Verify the implicit cool magnitude never exceeds the `remove` contribution for an equivalent similarity.
- Stale skips (old impressions) decay → cooling shrinks over time.
- Listener Trace attributes the cool to the right dimension with a truthful reason; Recommendation Insight reflects the new behavior signal.
- Missing `event_interaction_events` relation → scoring proceeds with no implicit signal (no crash).
