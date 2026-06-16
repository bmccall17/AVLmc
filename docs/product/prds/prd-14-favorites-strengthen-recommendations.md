# PRD 14: Favorites Strengthen Recommendations

Part of the [Saved/Favorites & Genre Initiative](../saved-favorites-genre-prd.md). Cycle **C3** (Track A). Satisfies desired outcome **4 (Favorites strengthen recommendations)**.

## Summary

Make saving consequential. A saved venue or artist should not just sit in a list — it should **nudge similar upcoming shows up the ranking**, and the listener should be able to see that their favorites are shaping what they're shown. This cycle wires C1's saved items into the existing discovery-scoring spine by feeding them into the `venuePreference` and `artistAffinity` component bases, reusing the match primitives already in `lib/discovery.ts`, so favorites become first-class, durable positive signals tuned by the weights that already exist.

## Implementation Status

**Planned.** Depends on C1 (`saved_items`, `lib/saved-items.ts`). Independent of C2.

## Goals

- Saved **venues** raise the `venuePreference` base for matching upcoming events; saved **artists** raise the `artistAffinity` base — measurably nudging similar shows up the ranking.
- Reuse the existing match primitives and preference weights; introduce **no new preference control** and no new weight UI.
- Surface a short, truthful reason on boosted cards (e.g. "saved venue", "saved artist").
- Make the favorite contribution **visible and explainable** in the Admin **Recommendation Insight** and **Listener Trace** tabs.
- Keep contributions bounded so favorites can't dominate or double-count against ad-hoc custom signals.

## Non-Goals

- No new scoring weight or slider for favorites (they ride existing `venuePreference` / `artistAffinity`).
- No automatic saving from behavior — only explicit saves count.
- No change to anonymous scoring beyond what already exists (saving is signed-in-only, so this signal applies to signed-in listeners).
- No genre-based favoriting — that is Track B.

## Requirements

### Feed favorites into component bases (`lib/discovery.ts`)

- Extend the scoring inputs so the per-listener saved venues/artists (loaded via `getSavedKeys` / a saved-items accessor from C1) are available to `getPreferenceComponentBases`.
- A saved **venue** that matches an event's `venueName` contributes to the **`venuePreference`** base; a saved **artist** that matches the event's `artistName` contributes to the **`artistAffinity`** base. Reuse `getCustomSignalMatchStrength` / `fieldMatchStrength` for matching (same normalization as saving).
- The resulting bases are tuned by the **already-shipped** `venuePreference` / `artistAffinity` weights in `scorePreferenceTuning` — no new control in `LISTENER_PREFERENCE_CONTROLS`.
- **Bounding:** keep favorite contributions within the existing component ceilings (e.g. `venuePreference` is already `min(36, …)`) and ensure a favorite plus an equivalent ad-hoc custom signal don't stack beyond a sensible cap, to avoid double-counting.

### Reasons (`lib/discovery.ts` reason strings)

- When a favorite drives a boost, add a compact reason such as `saved venue` / `saved artist` to the event's recommendation reasons, consistent with existing reason formatting and without exposing anything private.

### Admin observability (reuse, light extension)

- Ensure favorite-driven contributions appear in the **Recommendation Insight** (`components/admin/InsightSection.tsx`, `lib/admin/insight.ts`) component breakdown and in the **Listener Trace** (`components/admin/ListenerGraphSection.tsx`, `lib/admin/listener-graph.ts`) per-listener attribution, so a scoring change is validated against real output rather than guesswork. Extend the signal mix labeling if needed so "saved venue/artist" is distinguishable from ad-hoc custom signals.

### Real-time feel (optional, consistent with prior art)

- Where practical, reuse the existing client preference-change broadcast pattern (`LISTENER_PREFERENCE_CHANGE_EVENT`) so saving/un-saving a venue or artist can re-rank the board without a full reload, matching the V2 real-time behavior for fire/remove.

## Dependencies

- **C1 (PRD 12):** `saved_items` + saved-items accessors.
- `lib/discovery.ts`: `getPreferenceComponentBases`, `scorePreferenceTuning`, `getCustomSignalMatchStrength`, `fieldMatchStrength`, reason formatting.
- `lib/listener-preferences.ts`: existing `venuePreference` / `artistAffinity` controls and weights.
- Admin Phase 7 surfaces: PRD 09 (Insight), PRD 10 (Listener Trace).

## Risks

- **Over-boosting / double-counting** with ad-hoc custom signals — mitigated by capping within existing component ceilings and verifying in Insight.
- **Sparse favorites = no visible effect** — acceptable; the effect scales with how much a person saves, and reasons make any effect legible.
- **Hot-path cost** — saved venues/artists for the current listener must be loaded once per scoring pass, not per event.
- **Attribution confusion** in admin — mitigated by labeling favorite-driven contributions distinctly.

## Acceptance Criteria

- For a signed-in listener, saving a venue raises matching upcoming events' scores via `venuePreference`, and saving an artist raises matching events via `artistAffinity`, bounded by existing ceilings.
- Boosted cards show a truthful "saved venue"/"saved artist" reason.
- Favorite contributions are visible in Recommendation Insight and attributable in Listener Trace.
- The `venuePreference` / `artistAffinity` weights still tune the effect; no new control was added.
- Anonymous browsing/ranking is unaffected; new code passes Snyk; $0.

## Test Scenarios

- Save a venue → upcoming events at that venue move up; un-save → effect reverts.
- Save an artist → other events by that artist (or matching the artist name) move up.
- Set `venuePreference` weight to 0 → saved-venue boost disappears; restore → returns.
- A favorite plus an equivalent ad-hoc custom signal do not stack past the component cap.
- Recommendation Insight shows the favorite contribution in the breakdown; Listener Trace attributes it to that listener.
- A signed-in listener with no saves sees unchanged ranking.
