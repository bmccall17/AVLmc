# Personalized Discovery Backlog

Updated: June 6, 2026

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

Aiven production now has the required auth and music schema:

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
- `POST /api/discovery/event-action` centralizes homepage/detail learning actions and returns updated public counts plus the person's current event state.
- Discovery scoring now uses recent personal signals in addition to public community signals and optional Spotify taste rows. Positive interactions can boost similar shows; removed-event patterns can downrank similar future shows without hiding them automatically.
- Direct event URLs remain accessible after removal and include a restore affordance.

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

Do not use raw Spotify OAuth tokens in client code or ranking responses. Discovery should consume normalized rows from Aiven.

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

- Explicit taste preferences outside imported Spotify profile rows.
- Saved/favorite venues or tags.
- More nuanced genre matching if AVLgo event metadata supports it.
- Spotify save-to-library or playlist actions, with additional scopes requested only when those features exist.
- Google/YouTube can add identity plus limited YouTube Data API signals only after scope setup is explicit.
- Do not claim YouTube Music listening history.
- Apple identity is separate from Apple Music.
- Apple Music requires MusicKit/developer-token setup before planning library access.

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
