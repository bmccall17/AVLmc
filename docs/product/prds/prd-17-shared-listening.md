# PRD 17: Shared Listening — auto-populate songs on Going/Fire

First cycle (**C1**) of **Phase 9: Social Music Sharing**. Satisfies the new desired outcome:
*a signed-in, Spotify-connected listener who clicks **Going** or **Fire** on an event makes
the event page auto-populate with a playable, shared song list for that show — broadcasting
their love for the music to everyone and making the page immediately listenable.*

Supersedes the scoping note `docs/product/spotify-favorites-on-event-page-scoping.md`.

## Summary

When a signed-in, Spotify-connected listener **Goes** (plans) or **Fires** an event, the app
resolves the **event artist's own top tracks** from Spotify and publishes them as a **shared,
public, unattributed** song list on the event page. The list leads with the artist's tracks
(always relevant, instantly playable as Spotify embeds) and, for a signed-in viewer, badges
any track that is already in *their* top tracks with **"you already love this one."**

This is a **read + share** feature. It is **not** the parked Outcome 9 (Spotify library/
playlist *writes*): it reads taste already synced under `user-top-read` and resolves artist
catalog via the existing Spotify Search/top-tracks read APIs. **No new OAuth scope, no
re-auth, $0.**

## Implementation Status

**Shipped.** Delivered:

- **Schema** — additive `event_shared_songs` table (`db/schema.sql` + `db/migrate-missing-tables.sql`): deduped per-event song list with `share_count`, a server-only `seeded_by_user_id` (never selected into app types), and a `status` moderation column; unique on `(event_id, provider, provider_track_id)`.
- **Spotify read** — `getSpotifyArtistTopTracks` (`lib/music.ts`) resolves the artist via search → `GET /v1/artists/{id}/top-tracks?market=from_token`, reusing the existing token helpers and `SpotifyLimitedBetaAccessError` handling. No new scope, no re-auth.
- **Service** — `lib/shared-songs.ts` (`seedSharedSongsForEvent`, `listPublicSharedSongs`, `getSharedSongSummariesByEvent`, admin `listSharedSongsForAdmin`/`setSharedSongStatus`) over a pure, unit-tested `lib/shared-songs-core.ts` (`mapArtistTopTracksToSeeds`, `computeViewerOverlap`, `toPublicSharedSong`, `isSafeSpotifyTrackId`). The public path never exposes `seeded_by_user_id`.
- **Seeding** — `app/api/discovery/event-action/route.ts` seeds on `fire`/`planning` for a signed-in, connected listener, awaited but fully failure-safe (a Spotify error, incl. limited-beta, never breaks the reaction).
- **APIs** — public `GET /api/events/[id]/shared-songs` (unattributed, with the per-viewer overlap badge when signed in) and admin-gated `POST /api/admin/shared-songs` (hide/visible), mirroring the contributions moderation route.
- **Frontend** — a **Shared listening** section on the event detail page (`components/SharedListening.tsx`) rendering Spotify embeds + "Open in Spotify" links + the "you already love this one" badge, and a compact, lazy-loaded board-card affordance (`components/SharedSongsCard.tsx`). Both refresh on a `SHARED_SONGS_REFRESH_EVENT` dispatched after Going/Fire. Homepage feeds summaries via `getSharedSongSummariesByEvent`.
- **Security** — Snyk-clean: iframe `src` and the "Open in Spotify" `href` are built at the sink from a base62-validated track id via `encodeURIComponent`, never from fetched URL fields, removing the DOM-XSS taint path.
- **Architecture & validation** — registered `svc-shared-songs` + `db-shared-songs` (with `countKey`) and the sharing flow in `lib/system-registry.ts`; count query in `lib/admin/registry.ts`; system map regenerated. `npm run test:registry`, `npm run test:shared-songs`, typecheck, lint, and `next build` all green. $0.

## Goals

- On **Going**/**Fire** by a signed-in, Spotify-connected listener, seed the event's artist
  top tracks into a shared, public song list (deduped; engagement strengthens, not duplicates).
- Render the shared list on the event detail page as **Spotify embed players** with a per-row
  **"Open in Spotify"** link fallback, and a compact, lazy-loaded affordance on board cards.
- For a signed-in viewer, badge tracks already in their top tracks ("you already love this
  one") — computed per-viewer, server-side, never sent to anonymous viewers.
- Keep the shared list **unattributed** in this cycle; store who seeded it server-side only,
  as the on-ramp to a future inner-circle attribution layer.
- Degrade safely: a Spotify failure, limited-beta gate, or not-connected actor must never
  break the Going/Fire action.

## Non-Goals

- **No Spotify writes** of any kind (that is the parked Outcome 9). No new OAuth scopes, no
  re-auth.
- **Not triggered by Save** — Save stays the listener's private bookmark
  (`/api/me/saved-items`); only the public reactions (Going/Fire) share.
- **No public attribution** of who shared a song this cycle (inner-circle is a later phase).
- **No discovery-scoring change.** Shared songs are a presentation/social surface; they do
  **not** feed `lib/discovery.ts` (avoids inflating rankings the way auto-seeded
  `contributions` would). Going/Fire counts already feed scoring, unchanged.

## Requirements

### Data — `event_shared_songs` (`db/schema.sql` + `db/migrate-missing-tables.sql`)

A dedicated table (not `contributions`, whose `song` rows feed discovery scoring):

- Columns: `id`, `event_id`, `event_title`, `provider` (`'spotify'`), `provider_track_id`,
  `name`, `artist_names text[]`, `external_url`, `image_url`, `preview_url`,
  `share_count int default 1`, `seeded_by_user_id int null references users(id) on delete set null`,
  `first_shared_at`, `last_shared_at`, `status text default 'visible' check (visible/hidden/pending)`.
- `unique (event_id, provider, provider_track_id)`; index on `(event_id, status)`.
- Additive; follows the C5 `migrate-missing-tables.sql` precedent.

### Spotify read — `getSpotifyArtistTopTracks(userId, artistName)` (`lib/music.ts`)

- Resolve the artist via the existing `searchSpotifyArtists` flow → call
  `GET /v1/artists/{id}/top-tracks?market=from_token` (the `user-read-private` scope makes
  `from_token` valid).
- Reuse `getSpotifyAccount`, `getUsableSpotifyAccessToken`, `throwSpotifyApiError`, and the
  existing `SpotifyLimitedBetaAccessError` handling. Return `SpotifyTrackSearchResult`-shaped
  rows (id, name, artistNames, externalUrl, imageUrl, album).

### Service — `lib/shared-songs.ts` (+ pure `lib/shared-songs-core.ts`)

- `seedSharedSongsForEvent({ event, userId })`: gate on an active (non-disconnected) Spotify
  connection; resolve artist top tracks; upsert each track (`on conflict (event_id, provider,
  provider_track_id) do update set share_count = share_count + 1, last_shared_at = now()`),
  storing `seeded_by_user_id`. Best-effort: all failures swallowed by the caller.
- `listSharedSongs(eventId)`: visible-only, ordered by `share_count desc, first_shared_at`,
  **never** returns `seeded_by_user_id`.
- Pure core (testable, no DB): `mapArtistTopTracksToSharedSongs`, `computeViewerOverlap`
  (match viewer `top_track` rows by `provider_track_id`, fallback normalized name+artist),
  `toPublicSharedSong` (strips `seeded_by_user_id`).
- Admin: `listSharedSongsForAdmin(eventId?)`, `setSharedSongStatus(id, status)`.

### APIs

- **Seed (fire-and-forget):** in `app/api/discovery/event-action/route.ts`, after a
  successful `fire`/`planning` with a signed-in `userId`, call `seedSharedSongsForEvent`
  inside try/catch — it must never block or 500 the action.
- **Public read:** `GET /api/events/[id]/shared-songs` → `{ songs }` (visible, unattributed),
  with the viewer-overlap badge applied when the requester is signed-in + connected.
- **Admin moderation:** `POST /api/admin/shared-songs` (admin-cookie gated, mirrors
  `app/api/admin/contributions/route.ts`) to set `visible`/`hidden`.

### Frontend

- **Detail** (`app/event/[id]/page.tsx`): a **Shared listening** section rendering visible
  shared songs as Spotify embed players (`https://open.spotify.com/embed/track/{id}`) with a
  per-row "Open in Spotify" link, plus the "you already love this one" badge for the viewer's
  matches. Re-fetches `/api/events/[id]/shared-songs` after the viewer fires/plans.
- **Board cards** (`components/EventBoard.tsx`): a compact "▶ N shared songs" affordance with
  cover thumbnails that expands to lazy-loaded embeds. **Do not** render iframes for every
  card on initial paint (respects the board's `force-dynamic`/lazy posture).

### Architecture & quality

- Register `event_shared_songs` (+ the sharing flow node/edges) in `lib/system-registry.ts`
  with a `countKey`; add the count query in `lib/admin/registry.ts`; regenerate
  `docs/product/system-map.generated.md`; `npm run test:registry` passes.
- Unit-test the pure core (`tests/shared-songs.test.ts`): artist-track mapping, viewer
  overlap, public stripping.
- Snyk scan on new routes/code; confirm no `seeded_by_user_id` in public responses; $0.

## Dependencies

- `lib/music.ts` Spotify read helpers + `music_connections` (`disconnected_at`);
  `listMusicProfileItems` for the viewer overlap.
- `app/api/discovery/event-action/route.ts` (Going/Fire path); `lib/community.ts`
  reaction/intent recording (unchanged).
- Admin moderation pattern (`app/api/admin/contributions/route.ts`, `lib/admin`).

## Risks

- **Spotify limited/dev mode** (`SpotifyLimitedBetaAccessError`) gates the live artist
  top-tracks read — handled: seed is best-effort and silently no-ops; the Going/Fire action
  still succeeds.
- **Public sharing posture** — deliberate. The lead list is the artist's *public* top tracks
  (low taste-exposure); the only private element (the "you already love" badge) stays
  per-viewer and never reaches anonymous responses.
- **New public surface** → inherits admin hide so it can't become a spam vector.
- **Score inflation** — avoided by a dedicated table outside discovery scoring.

## Acceptance Criteria

- Signed-in + Spotify-connected → Fire/Going → the artist's top tracks appear as a playable
  shared list on the detail page; a track in the viewer's top tracks shows "you already love
  this one".
- Anonymous viewer sees the same shared list with **no** attribution and **no** badge.
- Spotify failure / limited-beta / not-connected actor → the Fire/Going action still
  succeeds; no error surfaced; no songs seeded.
- Going/Fire from a board card seeds; the detail page shows it; the board affordance is
  compact and lazy.
- Admin can hide a shared song; hidden songs vanish from public responses.
- No `seeded_by_user_id` in any public response. `npm run test:registry` + the new unit
  tests pass; new code is Snyk-clean; $0.

## Test Scenarios

- Fire an event while connected → `event_shared_songs` rows created; re-firing bumps
  `share_count`, no duplicate rows.
- A viewer whose top tracks include one of the artist's songs sees exactly that row badged.
- Disconnect Spotify → firing seeds nothing; the reaction still succeeds.
- Force a Spotify 403 (limited beta) → no seed, no error to the actor.
- Hit `GET /api/events/[id]/shared-songs` as anonymous → unattributed, no badge, hidden rows
  excluded.
- Admin hides a row → it disappears from the public list and the board count.
