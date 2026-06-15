# PRD 10: Listener Taste Knowledge Graph

Part of the [Admin Portal Initiative](../admin-portal-prd.md). Cycle **C5**. Satisfies desired outcome **2 (Listener Taste Knowledge Graph)**.

## Summary

Give the portal a **visual, per-listener trace** of how a single signed-in listener's identity, connected music-platform data, expressed preferences, behavioral signals, and taste settings combine to influence the events surfaced and prioritized for that person. This composes the graph engine from [PRD 06](prd-06-admin-portal-platform-and-architecture.md) with the scoring explainability from [PRD 09](prd-09-recommendation-quality-and-listener-insight.md) to make one person's recommendation logic understandable, traceable, and explainable — not a black box. It is the highest-sensitivity surface in the initiative and is built privacy-first.

## Implementation Status

**Shipped.** Delivered:

- `lib/admin/listener-graph.ts` — `listTraceableListeners()` (signed-in users with any taste data + anonymous `identity_key`s with interaction history) and `loadListenerTrace(identityKey)`, which composes the existing per-user loaders (`listMusicConnections`, `listMusicProfileItems`, `getListenerDiscoveryPreferences`, `listDiscoveryPreferenceSignals`, `listDiscoveryStates`, `listSpotifyMatchCorrections`) with the live `scoreDiscoveryEvents`, and contrasts the listener's ranking with the anonymous baseline.
- `components/admin/ListenerGraphSection.tsx` — a new **Listener Trace** tab: a listener selector and a six-stage expandable trace (identity → connected data → expressed preferences → behavioral signals → taste settings → surfaced events). Clicking a surfaced event shows the per-listener score breakdown (components + reasons) and its movement vs. the anonymous baseline. The staged layout is itself the non-graph accessible fallback. Range/listener switching uses admin-gated `GET /api/admin/listener-trace?id=`.
- Taste-settings honoring: opt-out / disconnect / anonymous state is shown and the `tasteContributes` flag plus the per-event deltas demonstrate the ranking falling back toward the anonymous baseline when taste is gated.
- Privacy (highest-sensitivity surface): admin-only; minimum identifying surface (internal id / `identity_key`, never email); top-artist names shown for the trace and marked private; **no OAuth tokens, refresh tokens, external ids, or session secrets are read or returned** (the loader never selects token columns). New code passes the Snyk scan.

Brownfield baseline (now connected): every link existed in data (`users`, `music_connections`, `music_profile_items`, `listener_discovery_preferences`, `event_interaction_events`, `event_person_event_state`) and the scorer consumed them, but nothing followed one listener through the chain visually.

## Goals

- Select a signed-in listener (or representative/opted-in test listener) and render a visual graph tracing: **identity → connected music data → expressed preferences → behavioral signals → taste settings → surfaced/prioritized events**.
- Make each edge explainable: clicking an event in the trace shows the same scoring breakdown from PRD 09 attributed to *this* listener's inputs.
- Show how the listener's ranking differs from the anonymous baseline, attributing the difference to specific taste rows and learned signals.
- Honor taste settings: opt-out and disconnect visibly remove their contribution from the trace.
- Default to the minimum identifying surface and never expose OAuth tokens or raw secrets.

## Non-Goals

- No public user profiles and no exposure of one listener's data to another (admin-only, single-owner operator).
- No raw OAuth token, refresh token, or session-secret display, ever.
- No editing of a listener's taste data from the admin (read/trace only; the user manages their own data via the existing privacy controls).
- No tracking that contradicts the public privacy posture (no claims of listening history beyond what `music_profile_items` actually stores).

## Requirements

### Listener Selector & Identity Layer

- Choose a listener by signed-in user, or by anonymous `identity_key` for the anonymous merged-memory case (the app already uses a merged cookie+account model).
- The identity node shows the minimum: internal user id / `identity_key`, connection state, and counts — not unnecessary PII. Clearly label anonymous vs. signed-in identities.

### Trace Graph (reuses PRD 06 engine)

Render a left-to-right (or layered) graph with these stages, each expandable:

1. **Identity** — user/`identity_key`, signed-in vs. anonymous.
2. **Connected music data** — `music_connections` (provider, `connected_at`, `last_synced_at`, `disconnected_at`) and a count/preview of `music_profile_items` (top artists/tracks) — names shown only as needed for the trace and clearly marked private; no external IDs/tokens.
3. **Expressed preferences** — `listener_discovery_preferences.weights` per `ListenerPreferenceKey` and any `custom_signals`.
4. **Behavioral signals** — derived `DiscoveryPreferenceSignal`s from `event_interaction_events` and current `event_person_event_state` (fired/planning/removed), including negative-learning from removals.
5. **Taste settings** — opt-out (`taste_opt_out_at`) and connection status, shown as switches that visibly gate downstream contribution.
6. **Surfaced events** — the listener's ranked events, each linked back to the inputs that lifted or lowered it.

Provide a non-graph fallback (structured, layered lists) so the trace is fully accessible without the visual.

### Per-Listener Explainability (reuses PRD 09)

- Clicking a surfaced event shows the PRD 09 score breakdown computed with **this listener's** taste rows and signals, with each component attributed to a specific upstream node (e.g., "+X from Spotify top artist match", "+Y from your fire on a similar show", "−Z learned from a removed similar event").
- Show the same event's anonymous-baseline rank beside the personalized rank, with the delta attributed to taste/personal contributions.

### Privacy & Settings Honoring

- When the listener has opted out (`taste_opt_out_at`) or disconnected (`disconnected_at`), the trace visibly drops the taste contribution and the surfaced ranking falls back toward the anonymous baseline — demonstrating the controls work.
- All data is fetched server-side via an admin-gated loader; no taste data is sent to any client beyond what the admin view renders, and never tokens.

## Dependencies

- [PRD 06](prd-06-admin-portal-platform-and-architecture.md) graph engine and registry.
- [PRD 09](prd-09-recommendation-quality-and-listener-insight.md) score-explainability service (per-event component breakdown).
- Existing tables: `users`, `music_connections`, `music_profile_items`, `listener_discovery_preferences`, `event_interaction_events`, `event_person_event_state`; and `lib/discovery.ts` / `lib/discovery-memory.ts` / `lib/listener-preferences.ts`.

## Risks

- **Privacy exposure** — the central risk. Mitigations: admin-only behind `isAdminSession`; minimum-identifying defaults; no token/secret exposure; private rows clearly marked; Snyk scan required; explicit Non-Goals against public profiles and cross-listener exposure.
- **Small-N / empty traces** — with few signed-in listeners, traces may be sparse; mitigated by supporting a representative/opted-in test listener and clear empty states.
- **Performance** of assembling the full chain per listener — mitigated by bounded queries (per-`identity_key` indexes already exist) and caching the assembled trace briefly.
- **Drift from scoring** — mitigated by deriving the trace's event attributions from the live PRD 09 breakdown, not a parallel re-implementation.

## Acceptance Criteria

- An admin can select a signed-in (or opted-in test) listener and see a visual, expandable trace from identity through to their surfaced/prioritized events, with a working non-graph fallback.
- Clicking a surfaced event shows a per-listener score breakdown attributing each contribution to a specific upstream input, alongside the anonymous-baseline rank and delta.
- Toggling/representing opt-out or disconnect visibly removes the taste contribution and moves the ranking toward the anonymous baseline.
- No OAuth tokens, refresh tokens, session secrets, or another listener's data are ever exposed; anonymous vs. signed-in identities are clearly distinguished.
- The surface is unreachable without an admin session; new code passes a Snyk scan; the cycle runs at $0.

## Test Scenarios

- Select a Spotify-connected test listener with synced profile rows → the trace shows connected data → preferences → signals → settings → surfaced events; an event matching a top artist shows the attributed boost.
- Click a surfaced event → its breakdown attributes contributions to specific Spotify rows and personal signals, with the anonymous-baseline delta shown.
- Set the test listener to opted-out → the taste contribution disappears from the trace and the ranking regresses toward anonymous; re-enabling restores it.
- Select an anonymous `identity_key` with interaction history → behavioral signals appear; no music-connection stage is shown.
- Inspect every node/response → confirm no token, refresh token, or session secret is present anywhere.
- Select a listener with no data → a clean empty state explains there is nothing to trace yet.
