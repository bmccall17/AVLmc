# Personalized Discovery Backlog

Updated: June 6, 2026

## Current Baseline

Production URL: `https://avlmc.vercel.app/`.

Anonymous usage remains the default. Browsing, reactions, and contributions work without login through the server-issued `avl_anonymous_session` cookie.

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

## Candidate Backlog

1. Improve filter UX.
   - Replace large venue/tag dropdowns with compact default chips plus search or More.
   - Add quick filters for Tonight, This weekend, Free, Dance, Jazz, Rock, Local, and Outdoor if the data supports them.
   - Keep the existing broad search box.

2. Add best-match sort.
   - Anonymous score: event timing, community reaction counts, contribution counts, and tag/venue matches.
   - Spotify score: boost events whose artist/title/tag text plausibly matches synced top artists or track artist names.
   - Keep the score explainable in code, even if the UI does not expose a detailed explanation yet.

3. Add a lightweight taste profile view.
   - Show connection state, last synced time, and a short preview of top artists/tracks.
   - Keep management controls in `MusicAccountPanel` / `MusicConnectionActions`.
   - Avoid building public user profiles.

4. Add privacy/data controls.
   - Disconnect should keep the account session but mark the connection disconnected and clear profile rows.
   - Delete music data should remove profile rows and token values.
   - Sign out should not delete anonymous contributions.

5. Keep later connectors separate.
   - Google/YouTube can add identity plus limited YouTube Data API signals only after scope setup is explicit.
   - Do not claim YouTube Music listening history.
   - Apple identity is separate from Apple Music.
   - Apple Music requires MusicKit/developer-token setup before planning library access.

## Acceptance Targets For Next Plan

- Anonymous users can still browse, filter, react, and contribute with no login.
- Signed-out `/api/me` returns `authenticated: false` while showing enabled feature flags.
- Signed-in `/api/me` returns user identity and music connection metadata without token values.
- Spotify-connected users can sync and see `music_profile_items` update.
- Best-match sorting works with no account and improves when Spotify profile rows are present.
- Public contribution and reaction responses do not expose `session_id` or `user_id`.
- Existing admin moderation still works after signed-in user links are present.
- The plan includes a migration path for any new tables or columns before touching production.
