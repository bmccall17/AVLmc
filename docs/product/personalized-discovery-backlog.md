# Personalized Discovery Backlog

Updated: June 16, 2026

## Current Baseline

Production URL: `https://avlmc.vercel.app/`.

Anonymous usage remains the default. Browsing, reactions, and contributions work without login through the server-issued `avl_anonymous_session` cookie.

## Completed Goal

Build optional personalized discovery on top of the public AVLgo music board: anonymous users get a better best-bet browsing experience, and Spotify-connected users get best-match recommendations boosted by synced taste data. Authentication should improve ranking and music-linking, not become a gate for browsing, reacting, or contributing.

Success for this phase means a visitor can answer "which upcoming show is most worth checking out for me?" from the homepage using clear filters, sort modes, and recommendation signals.

## Completed Auth Foundation

Optional Spotify auth is live:

- Auth provider: Spotify through Auth.js.
- Deployed fix: commit `dcf9632`.
- Requested scopes: `user-read-private`, `user-read-email`, `user-top-read`.
- Production callback path: `/api/auth/callback/spotify`.
- Verified signed-in account route: `/api/me`.
- Verified sync route: `POST /api/me/music-profile` with `{ "provider": "spotify" }`.

Neon production (Postgres 17, pooled) has the required auth and music schema:

- Auth.js tables: `users`, `accounts`, `sessions`, `verification_token`.
- Music tables: `music_connections`, `music_profile_items`.
- Community user links: nullable `user_id` on `contributions` and `reactions`.

The first verified Spotify sync stored:

- 20 `top_artist` rows.
- 20 `top_track` rows.
- `music_connections.last_synced_at` updated after sync.
- Server-side access and refresh tokens present in `accounts`, with no token values exposed publicly.

## Personalized Discovery V1

Implemented in this pass:

- `lib/discovery.ts` scores events for anonymous Best Bets and Spotify-backed Best Match.
- Homepage scoring uses public event/community signals for everyone and normalized Spotify profile rows when available.
- `components/EventBoard.tsx` now has ranked venue/tag chips, intent chips, long-tail selects, Best Bets, and Best Match.
- Event cards show short recommendation reasons without exposing private Spotify profile values.
- `MusicAccountPanel` and `MusicConnectionActions` support sync, pause/resume Best Match, and delete Spotify data.
- Event detail song recommendations support Spotify track search/select while preserving manual URL submission.
- Contribution rows can store optional provider metadata for linked tracks.

## Personalized Discovery V2

Goal to achieve: make Personalized Discovery feel like the app knows the person using it. The homepage should surface the most likely best bets, learn from every meaningful interaction, and let a person remove events from their listings in a way that improves future matchmaking.

Implemented in this pass:

- Hidden design sandbox at `/sandbox/discovery-actions` compares primary inline homepage actions with a compact icon-row treatment. The route is intentionally unlinked and noindex.
- Homepage cards expose first-class `I'm planning to go`, `Fire`, and `Remove` controls.
- `Remove` hides the exact event from that person's homepage and records a negative learning signal from the event artist, venue, tags, timing, and recommendation context.
- Anonymous and signed-in personalization use a merged memory model: cookie-backed session signals continue to work without login, while signed-in users also read and write account-backed signals.
- `event_interaction_events` stores an append-only learning stream for homepage impressions, detail opens, AVLgo clicks, planning, fire, remove, undo remove, and contribution actions.
- `event_person_event_state` stores the current per-person fire, planning, and removed state for each event.
- `POST /api/discovery/event-action` centralizes homepage/detail learning actions and returns updated public counts plus the person's current event state. **Database failures strictly return 500 errors to prevent silent failures.**
- Discovery scoring now uses recent personal signals in addition to public community signals and optional Spotify taste rows. Positive interactions can boost similar shows; removed-event patterns can downrank similar future shows without hiding them automatically.
- **Real-Time Client Feedback:** Actions like removing or firing an event immediately update local `preferenceSignals`, causing the `EventBoard` to instantly re-rank similar events without a page reload.
- Direct event URLs remain accessible after removal and include a restore affordance.

## Personalized Discovery V3: Configurable Taste and Match Corrections

Goal achieved: let a person tune *how* discovery weighs signals, and correct bad Spotify artist matches — explicit taste control that does not depend on imported Spotify rows.

Implemented in this pass:

- **Configurable preference weights.** `lib/listener-preferences.ts` defines nine weighted controls (`LISTENER_PREFERENCE_CONTROLS`): artist affinity, genre match, venue preference, date availability, social heat, local relevance, novelty, free/paid preference, and outdoor/indoor preference. Each is a per-`ListenerPreferenceKey` weight applied as a `preferenceAdjustment` in `lib/discovery.ts`.
- **Custom signals.** Listeners can add ad-hoc boost/lower rules (`ListenerCustomSignal`: kind = `artist | venue | tag | keyword`, direction = `boost | lower`, weight) to nudge specific shows up or down without touching Spotify.
- **Persistence + merged model.** Anonymous preferences live in `localStorage` (`LISTENER_PREFERENCE_STORAGE_KEY`); signed-in preferences persist to `listener_discovery_preferences` (`weights jsonb`, `custom_signals jsonb`) via `lib/listener-preferences-store.ts` and `GET`/`PUT /api/me/listener-preferences`. The control UI is in `components/ListenerProfileButton.tsx`, broadcasting changes via `LISTENER_PREFERENCE_CHANGE_EVENT` for instant re-ranking.
- **Spotify match corrections.** `spotify_event_match_corrections` records per-person `reject`/`replace` corrections to artist matches; `lib/discovery.ts` consumes `spotifyMatchCorrections` so a rejected match no longer boosts and a replacement match does. Recorded via `/api/discovery/spotify-match-correction`.

Schema added for V2/V3 (additive, in `db/schema.sql` + `db/migrate-missing-tables.sql`): `event_intents`, `event_interaction_events`, `event_person_event_state`, `listener_discovery_preferences`, `spotify_event_match_corrections`.

## Observing Discovery (Admin Portal)

The Admin Portal (Phase 7) now provides tools to inspect and debug discovery while iterating here:

- **Recommendation Insight** tab — why each event ranks (live weighted components + reasons), anonymous-vs-signed-in comparison via a synthetic taste profile, and diversity/local-value/signal-mix/coverage metrics.
- **Listener Trace** tab — a per-listener walk from identity → connected data → preferences → behavioral signals → taste settings → surfaced events, with the score breakdown attributed to *that* listener's inputs vs. the anonymous baseline.

Use these to validate any scoring change against real ranking output rather than guesswork.

## Product Direction

Build personalized discovery as an optional layer over the public board, not as an account gate.

The first personalized version should make the existing event feed easier to scan with:

- Better filters for time, venue, tags, popularity, and community activity.
- A best-match sort that can work anonymously from public signals.
- Optional taste boosts when a signed-in Spotify profile exists.
- Clear controls for sync, disconnect, delete data, and opt out.

## First Scoring Inputs

Use existing event/community data for everyone:

- Event date and start time.
- Venue.
- Tags.
- Contribution counts.
- Going and fire reaction counts.
- Recentness and density of community notes.

Use Spotify rows only when signed in:

- Top artist names from `music_profile_items`.
- Top track artist names from `music_profile_items.artist_names`.
- `music_connections.last_synced_at` for freshness.
- `music_connections.disconnected_at` to disable taste scoring when disconnected.

Do not use raw Spotify OAuth tokens in client code or ranking responses. Discovery should consume normalized rows from Neon.

## Completed Build

1. Discovery scoring layer.
   - Server-side scoring accepts events, community counts, active music connections, and Spotify profile rows.
   - Anonymous scoring uses timing, community heat, and contribution activity.
   - Spotify scoring boosts plausible matches against event artist, title, venue, and tag text.
   - OAuth tokens stay out of ranking responses and client code.

2. Filter UX.
   - Large venue/tag dropdown reliance is replaced with compact default chips plus long-tail selects.
   - Add quick filters for Tonight, This weekend, Free, Dance, Jazz, Rock, Local, and Outdoor if the data supports them.
   - Keep the existing broad search box.
   - Rank visible venue and tag suggestions by upcoming event count, then suppress generic duplicate tags.

3. Best Bets and Best Match sorting.
   - `Best Bets` works for everyone from public event/community signals.
   - `Best Match` appears when a signed-in Spotify profile exists.
   - If auth is disabled or no profile rows exist, the homepage falls back to Best Bets without a broken state.
   - Event cards can show compact labels such as "popular soon", "high community signal", "Spotify artist match", or "tag match".

4. Taste profile view.
   - Show connection state, last synced time, and a short preview of top artists/tracks.
   - Keep management controls in `MusicAccountPanel` / `MusicConnectionActions`.
   - Avoid building public user profiles.
   - Add a clear empty state when Spotify is connected but profile rows have not been synced yet.

5. Privacy/data controls.
   - Delete Spotify data keeps the account session but marks the connection disconnected, clears profile rows, and clears token values.
   - Opt out should disable taste scoring even if the user stays signed in.
   - Sign out should not delete anonymous contributions.

6. Provider-backed song linking.
   - Keep manual URL submission as the baseline for all users.
   - For signed-in Spotify users, add a provider search/select flow that fills song title, artist, provider, provider item ID, and canonical URL.
   - No additional Spotify write/library scopes are requested in this version.

## Remaining Follow-Up

- ~~Explicit taste preferences outside imported Spotify profile rows.~~ **Done — see Personalized Discovery V3** (configurable weights + custom boost/lower signals).
- **Saved/Favorites + richer genre matching — planned as Phase 8.** Direction is captured in [`saved-favorites-genre_desiredoutcomes.md`](saved-favorites-genre_desiredoutcomes.md) and decomposed into the [Saved/Favorites & Genre Initiative (Epic)](saved-favorites-genre-prd.md) — five cycle PRDs (12–16) across two tracks: **Saved/Favorites** (PRD 12 foundation + save actions, PRD 13 Saved space + sign-in nudges, PRD 14 favorites strengthen recommendations) and **Richer Genre** (PRD 15 taxonomy + public matching, PRD 16 Spotify genre signal). Decisions: favoritable **events, venues, and artists** (each its own list); **signed-in only**, with sign-in nudges when an anonymous user fires/plans/removes; genre matching gets **both** a curated taxonomy + aliases (helps everyone) **and** captured **Spotify artist genres** (no new scope; richer signal for connected users). Today only *partially* covered by V3 custom signals; no dedicated saved/favorites UI yet, and `scoreGenreMatch()` still scores a hardcoded ~15-term list against flat `events.tags[]`. See [`master-roadmap.md`](master-roadmap.md) Phase 8 for sequencing.
- **Spotify save-to-library / playlist actions — PARKED for a future phase.** Not ready to write to Spotify yet. Requires new OAuth write scopes (`user-library-modify`, `user-follow-modify`, `playlist-modify-public`/`playlist-modify-private`) and **re-authentication of existing connected users**; revisit when the product is ready to write to Spotify. **Note:** the read-only *Shared Listening* feature (Going/Fire auto-populates the event page with the artist's Spotify top tracks) shipped as **Phase 9 / [PRD 17](prds/prd-17-shared-listening.md)** — it reads taste/catalog only and is explicitly **not** this parked write work. Next on this track: a future **inner-circle** attribution layer (friends/influencers sharing top lists, attribution shown to signed-in viewers).
- Google/YouTube can add identity plus limited YouTube Data API signals only after scope setup is explicit (feature flags `AUTH_GOOGLE_YOUTUBE_ENABLED` exist but the provider is not implemented).
- Do not claim YouTube Music listening history.
- Apple identity is separate from Apple Music.
- Apple Music requires MusicKit/developer-token setup before planning library access (`AUTH_APPLE_MUSIC_ENABLED` flag exists; not implemented).

## Future Direction — Deeper Personalization (planned, not yet scoped)

Personalization today is intentionally shallow: scoring reads only a person's **most recent
240 explicit, meaningful actions** (`detail_open`, `avlgo_click`, `fire`, `planning`, `remove`,
contributions) from `event_interaction_events` (`lib/discovery-memory.ts` →
`listDiscoveryPreferenceSignals`), and **ignores `impression` rows entirely**. The full
behavioral stream is captured but mostly unused. This is the next big investment area.

- **Implicit / behavioral signals from impressions.** An impression that never converts is a
  soft *negative*; repeatedly showing an artist/venue/genre a person never engages should
  gently cool it. Conversely, dwell/return patterns are soft positives. Design carefully:
  impressions are high-volume and noisy, so weight them far below explicit actions, decay
  them over time, and guard against feedback loops (don't bury everything a person hasn't
  clicked yet). When built, this also changes the retention story — impressions become
  signal, not just bloat (see the impression-prune note: only prune beyond the signal window).
- **Richer signal model.** Move past the flat "recent 240" cap toward time-decayed,
  per-dimension affinities (artist / venue / genre / time-of-week / price / indoor-outdoor)
  with confidence weighting; separate short-term intent from long-term taste.
- **Cold-start & anonymity.** Strengthen anonymous personalization from session behavior
  before sign-in, and a graceful hand-off when a session links to an account.
- **Transparency & control.** Keep every learned signal explainable and correctable (extends
  the V3 weights / custom-signal / match-correction model), so behavioral inference never
  feels creepy or unaccountable.

Acceptance for a first cut: a signed-in listener's ranking measurably reflects what they
*skip*, not just what they tap, validated in the admin Recommendation-Insight / Listener-Trace
tabs against real behavior — without runaway feedback loops.

## Future Direction — Social, Curators & Influencers (planned, not yet scoped)

A larger theme beyond solo personalization: turn AVLmc into a place where taste is *shared*.
Builds on **Phase 9 (Social Music Sharing)** — the shipped Shared Listening surface (PRD 17)
is step one; the noted **inner-circle attribution layer** is step two.

- **Listener-to-listener connection.** Optional follow / friend graph so people can see what
  friends are going to / firing, and share shows and song lists — privacy-first and opt-in.
- **Curators & influencers.** First-class curator/influencer profiles with public top-lists
  and per-show picks; surface "curated by" signal on the board and let listeners follow
  curators' taste. This is the natural home for attribution that Shared Listening defers today.
- **Social signal in discovery.** Let trusted-circle / followed-curator activity become an
  optional ranking input (clearly distinct from anonymous public heat), without making the
  board pay-to-play or letting influence drown out local discovery.
- **Scope guardrails.** Stays $0 and privacy-first; no public social graph by default; no
  Spotify *write* actions (still the parked Outcome 9). Likely its own multi-cycle epic with a
  desired-outcomes doc when prioritized.

Both directions are **large and unscoped** — flagged here so `/orchestrator` can surface them
and a desired-outcomes doc + epic can be written when they come up the priority list.

## Auth Delay Fallback

If Auth or Spotify sync is delayed, still ship the discovery pass with anonymous Best Bets, ranked filters, and manual song links. The same scoring interface should accept Spotify rows later without changing the public board contract.

## Acceptance Coverage

- Anonymous users can still browse, filter, react, and contribute with no login.
- Signed-out `/api/me` returns `authenticated: false` while showing enabled feature flags.
- Signed-in `/api/me` returns user identity and music connection metadata without token values.
- Spotify-connected users can sync and see `music_profile_items` update.
- Best Bets works with no account.
- Best Match is available when Spotify profile rows are present and gracefully falls back when they are not.
- Event cards expose short recommendation reasons without leaking private profile data.
- Public contribution and reaction responses do not expose `session_id` or `user_id`.
- Existing admin moderation still works after signed-in user links are present.
- `db/schema.sql` includes additive migration statements for new privacy and provider-linking columns.
