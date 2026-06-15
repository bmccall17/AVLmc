# PRD 09: Recommendation Quality & Listener Insight

Part of the [Admin Portal Initiative](../admin-portal-prd.md). Cycle **C4**. Satisfies desired outcome **5 (Recommendation Quality and Listener Insight)**.

## Summary

Make the recommendation engine legible from the admin: show *why* a given event is prioritized, *which* listener and community signals influenced its ranking, and *how* outcomes differ between anonymous visitors and signed-in listeners. The scoring engine already computes weighted per-signal components and human-readable reasons for every event — they are simply never surfaced. This cycle exposes them and adds aggregate quality metrics so personalization can be assessed for relevance, diversity, and local value.

## Implementation Status

**Shipped.** Delivered:

- `lib/admin/insight.ts` — `loadRecommendationInsight()` re-runs the live `scoreDiscoveryEvents` over the rolling window (server-side, briefly cached) and exposes, per event: total score, rank, the ranked weighted `components` (largest-impact first), and the emitted `reasons`. Absent inputs show as zeroed (e.g., no Spotify match → "profile component = 0").
- Anonymous-vs-signed-in comparison driven by a **synthetic taste profile derived from the window's own public event artists** (never a real listener's data, no tokens/profile values). Movers (events that rise/fall once taste is added) are highlighted with the driving reason.
- Aggregate quality metrics: venue/tag/artist **diversity** (with a low-spread flag), **local value** (share of top results carrying community signal), **signal mix** (which component dominates the top results), and **coverage** (events that receive any personalization vs. rank on timing alone — derived by diffing the anonymous and signed-in scores).
- Richer **behavioral-signal** view (action mix over `event_interaction_events`, with removals surfaced as the negative-learning path from ADR-001).
- `components/admin/InsightSection.tsx` — a new **Recommendation Insight** tab. Explanations derive from live scoring output (no restated algorithm), so they cannot drift.

Original brownfield baseline (now surfaced): the scoring engine already produced `reasons`/`components` per event but the admin had no view of them.

## Goals

- Surface the full scoring breakdown for any upcoming event: total score, ranked signal components with their weights, and the reasons emitted.
- Explain the difference between the anonymous ranking (public/community signals only) and a signed-in ranking (adds normalized Spotify profile rows and personal learning signals).
- Provide aggregate recommendation-quality metrics: ranking diversity (venue/tag/artist spread in the top N), local-value coverage, and the mix of signal types driving the top results.
- Let an admin inspect "why is this event #1 / why is this event buried?" without reading code.
- Keep all scoring server-side and leak no private profile values.

## Non-Goals

- No changes to the scoring algorithm itself (this cycle observes and explains; tuning is a separate decision informed by what this surfaces).
- No per-named-listener trace UI (that is [PRD 10](prd-10-listener-taste-knowledge-graph.md); this cycle works at the ranking/aggregate level and with representative/synthetic profiles).
- No exposure of raw Spotify profile item names or OAuth tokens in any response.
- No A/B testing framework.

## Requirements

### Score Explainability (`lib/admin/insight.ts`, `components/admin/InsightSection.tsx`)

- For the current rolling window, run `scoreDiscoveryEvents` in an admin context and present, per event: total score, rank, the ranked `components` with their weights and the sign/magnitude of each contribution, and the emitted `reasons`.
- Allow drilling into a single event to see the component breakdown as a readable "this ranked here because…" explanation built from `DiscoveryScoreComponents` (public/community heat, timing, tag/venue, personal-signal, Spotify-profile contributions).
- Distinguish reason kinds (`simple` vs. `spotify_artist`) and show which inputs were available vs. absent (e.g., "no Spotify profile → profile component = 0").

### Anonymous vs. Signed-In Comparison

- Render two ranked columns for the same window: the **anonymous** ranking (public/community signals only) and a **signed-in** ranking that adds normalized Spotify profile rows and personal learning signals.
- Use a representative or synthetic taste profile (and/or an opted-in test account) so the comparison never depends on exposing a real person's private data.
- Highlight movers: events that rank meaningfully higher/lower once taste and personal signals are included, with the reason for the shift.

### Aggregate Quality Metrics

- **Diversity:** venue, tag, and artist spread across the top N (flag if the top results collapse onto one venue/genre).
- **Local value:** share of top results carrying local context / community signal.
- **Signal mix:** distribution of which component types drive the top results (timing vs. community vs. taste vs. personal), so over-reliance on any single signal is visible.
- **Coverage:** how many upcoming events receive any positive personalization signal vs. rank on timing alone.

### Behavioral Signal Insight

- Extend the existing interaction stats (`getInteractionStats` over `event_interaction_events`) into a richer view: action mix (impression, detail_open, avlgo_click, fire, planning, remove, unremove, contributions), and removal patterns that downrank similar future events (the negative-learning path documented in the discovery V2 work and ADR-001).

## Dependencies

- [PRD 06](prd-06-admin-portal-platform-and-architecture.md) admin service-layer scaffolding and registry (the discovery service is a registry node).
- Existing `lib/discovery.ts` (`scoreDiscoveryEvents`, `DiscoveryScore`, `DiscoveryScoreComponents`, `DiscoveryReason`), `lib/discovery-memory.ts` (`DiscoveryPreferenceSignal`), `lib/listener-preferences.ts` (`ListenerPreferenceKey`, weights), `lib/events.ts`.
- Existing `event_interaction_events` / `event_person_event_state` tables.

## Risks

- **Re-scoring cost on the admin page** — mitigated by scoring only the rolling window, server-side, and caching the result briefly.
- **Leaking private taste data** via the signed-in comparison — mitigated by using synthetic/opted-in profiles and never returning raw profile item names or tokens.
- **Explanation drift** if scoring changes — mitigated by deriving explanations from the live `components`/`reasons` output rather than restating the algorithm in the UI.
- **Misreading correlation as quality** — mitigated by framing metrics as descriptive (diversity/coverage/mix), not as a single "quality score."

## Acceptance Criteria

- Any upcoming event can be inspected to show total score, ranked weighted components, and emitted reasons, with absent inputs shown as zeroed components.
- The portal renders an anonymous vs. signed-in ranking comparison and highlights the events that move, with the driving reason.
- Diversity, local-value, signal-mix, and coverage metrics are shown for the current top results.
- The richer behavioral-signal view shows the action mix and removal/negative-learning patterns.
- No response exposes raw Spotify profile values or OAuth tokens; explanations derive from live scoring output; new code passes a Snyk scan; the cycle runs at $0.

## Test Scenarios

- Inspect the current #1 event → its component breakdown explains the ranking (e.g., "happening soon" + "high community signal" dominate; profile component = 0 with no Spotify).
- Inspect a buried event with good metadata → the breakdown shows which components are low.
- Toggle the synthetic Spotify profile in the comparison → events matching its top artists rise, with a "Spotify artist match" reason, and the movers list reflects it.
- A window dominated by one venue → the diversity metric flags low spread.
- Confirm the signed-in comparison never returns profile item names or token values.
- Add several "remove" interactions for similar events → the behavioral view reflects the negative-learning pattern.
