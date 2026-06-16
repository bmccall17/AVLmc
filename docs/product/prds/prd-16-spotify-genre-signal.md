# PRD 16: Spotify Genre Signal for Connected Listeners

Part of the [Saved/Favorites & Genre Initiative](../saved-favorites-genre-prd.md). Cycle **C5** (Track B). Satisfies desired outcome **7 (Real taste signal for connected listeners)** and completes **8 (Explainable and tunable)**.

## Summary

Turn a connected listener's actual Spotify taste into genre signal. Spotify already returns a `genres[]` array on each top artist under the **current** `user-top-read` scope — but the app discards it. This cycle captures those genres at sync, maps them onto the C4 taxonomy, and feeds them into the genre side of discovery scoring so signed-in Spotify users get noticeably more relevant Best Match, layered on top of the public taxonomy matching. It requires **no new OAuth scope and no re-authentication**.

## Implementation Status

**Planned.** Depends on C4 (`lib/genre-taxonomy.ts`). Final cycle of Track B.

## Goals

- Capture Spotify **top-artist genres** during sync without requesting any new scope.
- Persist them alongside existing profile rows and map them onto the C4 taxonomy into a per-listener genre affinity.
- Use that affinity to enrich genre matching for connected listeners (a `genreMatch` boost when an event's genres align with the listener's Spotify genres), tuned by the existing `genreMatch` weight.
- Keep reasons explainable without echoing private genre values verbatim (e.g. "matches your top genres", not a dump of the user's genre list).
- Degrade gracefully when genres are sparse/absent or the connection is disconnected/opted-out.

## Non-Goals

- **No new OAuth scopes and no re-auth** (that is the parked Outcome 9 — library/playlist writes).
- No Spotify *write* actions of any kind.
- No new preference control (reuse `genreMatch`).
- No public exposure of a listener's Spotify genres; no raw token use in scoring.
- No change to the public taxonomy matching from C4 (this layers on top, for connected users only).

## Requirements

### Capture genres at sync (`lib/music.ts`)

- Extend `SpotifyTopArtistsResponse` (currently `lib/music.ts:80`) to include `genres?: string[]` on each artist item.
- Update `normalizeArtists` (`lib/music.ts:611`) to keep `genres` (it currently sets `artistNames: []` and drops genres).
- Add an additive `genres text[] not null default '{}'` column to `music_profile_items` (`db/schema.sql` + `db/migrate-missing-tables.sql`), and persist genres in `replaceSpotifyProfileItems` (`lib/music.ts:651`) for `top_artist` rows.
- Verify at the start of the cycle that genres are present under the current scope; if Spotify returns them sparsely, treat as optional.

### Per-listener genre affinity (`lib/music.ts` or a small reader in `lib/discovery.ts`)

- Derive a connected listener's genre affinity by collecting `genres` across their `top_artist` rows and resolving them through `lib/genre-taxonomy.ts` (`resolveGenres`), producing a weighted set of canonical genres (e.g. by frequency/rank).
- Expose this as a normalized input to discovery scoring (consistent with the existing pattern of consuming **normalized rows**, never raw tokens).

### Feed genre matching for connected users (`lib/discovery.ts`)

- When a listener has a Spotify genre affinity, raise the **`genreMatch`** base for events whose taxonomy-resolved genres align with that affinity (using `genreRelationStrength` for near matches), layered on the C4 public match.
- Respect the existing `genreMatch` weight in `scorePreferenceTuning`; honor `taste_opt_out_at` / `disconnected_at` on `music_connections` to disable taste scoring exactly like other Spotify signals.
- Keep within the calibrated `genreMatch` output range so weighting stays sound.

### Explainable, private-safe reasons (`lib/discovery.ts`)

- Add a compact reason like `matches your top genres` (or naming a shared canonical genre that is *also* public on the event, never a private-only value) when Spotify genre affinity drives a boost. Never expose the listener's full genre list or any token-derived value in client/ranking responses.

### Admin observability & profile preview

- Ensure the Spotify-genre contribution is visible in **Recommendation Insight** and attributable in **Listener Trace** (Phase 7), distinct from public taxonomy matching and from artist-name affinity.
- Optionally surface a small "top genres" preview in the taste profile view (`MusicAccountPanel`) consistent with the existing top-artists/tracks preview and privacy posture.

### Architecture & validation

- Update the `music_profile_items` node `sourceOfTruth` notes if needed and keep the Spotify integration node accurate in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` passes.
- Unit-test genre capture/affinity derivation and the connected-listener boost; validate ranking via Insight/Trace.

## Dependencies

- **C4 (PRD 15):** `lib/genre-taxonomy.ts` (`resolveGenres`, `genreRelationStrength`).
- `lib/music.ts`: `syncSpotifyMusicProfile`, `SpotifyTopArtistsResponse`, `normalizeArtists`, `replaceSpotifyProfileItems`; `music_profile_items`, `music_connections` (`taste_opt_out_at`, `disconnected_at`).
- `lib/discovery.ts`: genre base + `genreMatch` weighting; existing normalized-rows-in-scoring contract.
- Admin PRD 09 (Insight) / PRD 10 (Listener Trace).

## Risks

- **Sparse/absent genres** for some artists — mitigated by treating genres as optional and falling back to C4 taxonomy-only matching.
- **Privacy leakage** of a listener's genres — mitigated by surfacing only shared/public-on-the-event genres in reasons, server-side scoring, no tokens, Snyk scan.
- **Re-sync required to populate genres** for already-connected users — acceptable: existing users get genres on their next sync; the column defaults empty and degrades gracefully until then.
- **Score inflation** by stacking public + Spotify genre signal — mitigated by keeping within the `genreMatch` ceiling and validating in Insight.
- **Spotify limited beta access** (`SpotifyLimitedBetaAccessError`) — existing handling applies; genre capture must not introduce a new failure path.

## Acceptance Criteria

- Spotify top-artist `genres` are captured at sync and stored on `music_profile_items` with no new scope and no re-auth.
- A connected listener's genres resolve onto the C4 taxonomy into a genre affinity used to enrich `genreMatch` for aligned events.
- The `genreMatch` weight still tunes the effect; opt-out/disconnect disables it.
- Reasons explain the boost without exposing the listener's private genre list or any token value.
- The contribution is visible in Insight and attributable in Listener Trace; `npm run test:registry` passes; new code passes Snyk; $0.

## Test Scenarios

- Connect Spotify and sync → `music_profile_items.top_artist` rows carry `genres`; the taste profile preview (if shown) reflects top genres.
- A listener whose Spotify genres skew jazz/soul sees aligned events gain `genreMatch` boost with a "matches your top genres" reason.
- Set `genreMatch` weight to 0, or opt out / disconnect → the Spotify genre boost disappears; public C4 matching still works.
- An already-connected user before re-sync (empty `genres`) sees no errors and gets C4 taxonomy matching until next sync.
- Ranking responses and reasons contain no raw token and no private-only genre dump.
- Recommendation Insight distinguishes Spotify-genre contribution from public taxonomy match and artist-name affinity.
