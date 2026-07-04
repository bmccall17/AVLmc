# PRD 46: Spotify Artist Embed + Board Hover Listening

Satisfies the desired outcome: *every event page leads with a directly playable Spotify
player for the matched artist — like The Orange Peel's own event pages — with no sign-in,
no engagement prerequisite; and the board tells listeners a show is listenable, letting
hover intent fade the music in before they ever click through.*

Supersedes the scoping note
`docs/product/spotify-artist-embed-on-event-page-scoping.md`.

## Summary

Two connected deliverables:

1. **Artist embed (event detail page).** Resolve every event's `artist_name` to a Spotify
   artist ID **server-side with an app-only (Client Credentials) token** — no user, no
   allowlist seat, no new scopes — persist the match, and render Spotify's artist
   mini-player (`https://open.spotify.com/embed/artist/{id}`) on the event page for
   **everyone, including anonymous visitors**. Verified reference: theorangepeel.net event
   pages are exactly this — one stored artist ID per act, one iframe each.
2. **Hover listening (board cards).** Cards whose event has playable songs show a live
   **"♫ N songs"** state. Hovering the songs affordance with sustained intent shows a
   **"music coming"** indicator, then **fades the event's playlist in over 2–3 s**
   (30-second track previews via `<audio>`, volume-ramped). Mouse-away fades out. Click
   behavior is unchanged: the card still navigates to the event detail page.

Read-only, $0, no new OAuth scopes, no re-auth. Complements PRD 17 (Shared Listening):
shared songs remain the community layer; the artist embed is the always-on floor so no
event page is silent.

## Goals

- Every event whose artist confidently matches a Spotify artist gets a playable artist
  embed on its detail page — anonymous-visible, zero engagement required.
- Matching is automatic (ingestion hook + full backfill), cached per artist, and safe:
  **only exact-normalized matches auto-publish**; fuzzy matches are held for review. A
  wrong artist is worse than no embed.
- Listeners can correct a wrong match ("not the right artist?"), reusing the
  `spotify_event_match_corrections` model; corrections fix the embed for everyone.
- Board cards advertise listenability (song count) and reward hover intent with faded-in
  audio; the interaction never blocks or hijacks navigation, never plays two events at
  once, and degrades gracefully where autoplay is blocked or previews are unavailable.
- Keep the PRD 17 security discipline: iframe/audio `src` built at the sink from
  validated IDs/URLs only.

## Non-Goals

- **No Spotify writes** (parked Outcome 9). No user OAuth involvement at all — this path
  is app-token catalog reads only.
- **No support-act parsing this cycle.** Events store one `artist_name`; multi-act embeds
  (Orange Peel shows headliner + openers) need upstream ingestion of support acts — a
  follow-up PRD.
- **No discovery-scoring change.** Matches and hover-plays don't feed `lib/discovery.ts`.
- **No autoplay-with-sound hacks.** Where the browser blocks unmuted playback before a
  user gesture, we show the intent indicator and a "click ♫ to listen" nudge — we do not
  fight the policy.
- **No full-track playback on hover.** Hover preview uses Spotify's 30-second preview
  MP3s; full tracks stay in the embeds (full playback there requires the visitor's own
  in-browser Spotify login, same as Orange Peel).

## Requirements

### A. App-token Spotify client — `lib/spotify-app-token.ts`

- Client Credentials flow against `https://accounts.spotify.com/api/token` using the
  existing `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET`; cache the token (~1 h) in memory
  with expiry-aware refresh; retry-once on 401.
- **Spike gate (first task):** confirm `GET /v1/search?type=artist` and
  `GET /v1/artists/{id}/top-tracks?market=US` succeed under Development Mode with an
  app token. (Dev mode's 25-user allowlist gates *user authorization*, not app-token
  catalog reads.) If this ever regresses, fallback: opportunistic resolution through
  already-connected users' tokens + manual curation for top venues.

### B. Data — `event_artist_matches` (+ preview cache)

Additive table (schema + `migrate-missing-tables.sql`, PRD 17 precedent):

- `id`, `event_id`, `artist_name`, `normalized_name`, `provider` (`'spotify'`),
  `spotify_artist_id`, `spotify_artist_name`, `spotify_artist_image_url`,
  `confidence` (`exact | fuzzy`), `status`
  (`auto | needs_review | confirmed | rejected | replaced`), `matched_at`, `updated_at`.
- `unique (event_id, provider)`; index on `(normalized_name)` so repeat artists
  (weekly residencies, multi-night runs) resolve from cache without a new API call.
- **Preview tracks:** persist the matched artist's top tracks (id, name, `preview_url`,
  `image_url`, `external_url`) — either reusing `event_shared_songs` rows marked with a
  distinct seed source or a sibling `event_artist_tracks` table (implementer's choice;
  keep it out of discovery scoring either way). These rows power both the hover-play
  playlist and a track-list fallback if the artist iframe is ever undesirable.

### C. Matcher service — `lib/artist-match.ts` (+ pure core)

- Refactor `pickBestArtistMatch` / normalization out of `lib/music.ts` into a shared,
  token-agnostic core (unit-tested; PRD 17's user-token path reuses it).
- Rules: exact normalized (case/diacritics/whitespace-folded) name match →
  `confidence='exact'`, `status='auto'` (publishes). Anything else → `fuzzy` /
  `needs_review` (no embed until confirmed). No match → no row or `rejected`.
- Entry points: hook on event ingestion for new events; `scripts/backfill-artist-matches.ts`
  for the existing catalog (batched, rate-respectful, resumable); record runs in
  `system_job_runs`. Re-run only for events without a row (matches are stable).

### D. Event detail — `components/ArtistEmbed.tsx`

- Server-rendered for `status in (auto, confirmed, replaced)`:
  `https://open.spotify.com/embed/artist/{id}?utm_source=generator` — id base62-validated
  at the sink (`isSafeSpotifyArtistId`, mirroring `isSafeSpotifyTrackId`), `height=352`,
  `loading="lazy"`, `allow="autoplay; clipboard-write; encrypted-media; fullscreen;
  picture-in-picture"`.
- Placement: top of the listening column, above PRD 17's Shared Listening (artist floor
  first, community layer under it). No confident match → section absent entirely.
- **Correction affordance:** a quiet "Not the right artist?" control. Any signed-in
  listener can flag (→ `needs_review`, embed hidden pending review); a Spotify-connected
  listener can search-and-replace (existing `searchSpotifyArtists` UI pattern) →
  `replaced` + a `spotify_event_match_corrections`-style audit row. Admin sees a
  `needs_review` queue in the portal (mirrors contributions moderation).

### E. Board cards — songs state + hover listening (`components/EventBoard.tsx` + a new `useHoverPlayer`)

- **Songs state:** the card's songs affordance reflects **playable** songs =
  community-contributed songs + shared songs + matched-artist tracks. When > 0, the chip
  renders in an "listenable" style (distinct from the current `0 songs` neutral chip) so
  listenable shows are scannable on the board.
- **Hover intent:** pointer dwell of **~700 ms** over the songs affordance (not the whole
  card) arms playback. On arm: show an unmistakable **pre-play indicator** — pulsing ♫ /
  filling progress ring with `aria-label="music will play soon"` — for the remainder of
  the dwell.
- **Fade-in:** play the event's playlist (ordered: shared songs first, then artist top
  tracks; preview MP3s only) through a single shared `<audio>` element, ramping volume
  0 → 1 over **2–3 s** (rAF or Web Audio gain ramp). Advance through previews while the
  pointer stays. **Mouse-leave:** fade out ~400 ms, pause. Only one card plays at a time;
  arming a second card fades the first out.
- **Click is sacred:** any click on the card — including mid-fade — still navigates to
  the event detail page (playback stops; no preventDefault on the link).
- **Autoplay policy reality:** browsers block unmuted playback before a user
  gesture (hover is not a gesture). First hover before any page interaction: catch
  `NotAllowedError` from `audio.play()`, keep the indicator, and show "click ♫ to
  listen" (that click plays — it *is* the gesture — and unlocks hover-play for the rest
  of the session). After any prior interaction, hover-play works.
- **Degradations:** no `preview_url` on any track (Spotify has removed previews for
  newer apps — verify what our app receives in the Story A spike) → chip stays, hover
  shows "open to listen", no broken player. Touch devices: no hover — chip keeps its
  current tap behavior. `prefers-reduced-motion`: skip the pulse animation (fade still
  fine). A visible stop/mute control appears while audio plays; Escape stops playback.
- Respect the board's lazy posture: no iframes, no audio elements, no preview fetches on
  initial paint — everything mounts on first arm.

### F. Architecture & quality

- Register `svc-artist-match`, `db-event-artist-matches` (+ `countKey`), and the
  flows (matcher → event detail; matcher → board hover player) in
  `lib/system-registry.ts`; count query in `lib/admin/registry.ts`; regenerate the system
  map; `npm run test:registry` green.
- Unit tests: matcher core (normalization, exact-vs-fuzzy, cache hits), artist-id sink
  validation, hover-player state machine (arm/disarm/fade/single-player/autoplay-block)
  as a pure reducer.
- Snyk on all new routes/components; no user tokens anywhere in this path; typecheck,
  lint, `next build` green; $0 (client-credentials calls are free-tier; one search + one
  top-tracks call per *unique* artist, cached indefinitely).
- Apply the migration to production before/with the deploy (PRD 17 lesson: reads must
  tolerate a missing table via the `42P01` degrade pattern).

## Dependencies

- `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET` (already configured; reused for the app token).
- PRD 17 surfaces: `event_shared_songs`, `SharedListening`, `SharedSongsCard`, the
  base62-at-sink pattern, admin moderation precedent.
- `spotify_event_match_corrections` table (reject/replace correction model).
- Event ingestion path (for the new-event matcher hook) + `system_job_runs`.

## Risks

- **Wrong-artist matches** (common names, tribute acts — the board itself lists "Red NOT
  Chili Peppers"). Mitigated: exact-match-only auto-publish, `needs_review` holding pen,
  listener flag/replace loop, admin queue.
- **Client-credentials-under-dev-mode assumption** — de-risked first by the Story A
  spike; documented fallback if Spotify tightens it.
- **Preview URL availability** — Spotify stopped issuing `preview_url` to apps created
  after Nov 2024; our app's actual behavior is confirmed in the same spike. Hover-play
  ships only if previews flow; the embed deliverable is unaffected either way.
- **Autoplay-on-hover expectations** — first-interaction blocking is handled honestly
  (indicator + click nudge), not hacked around. Unexpected audio can annoy: dwell
  threshold + fade-in + instant fade-out + visible stop control keep it polite.
- **Board performance** — everything lazy; a single shared audio element; no per-card
  players.

## Acceptance Criteria

- Watchhouse event page (`/event/6d8060c8-…`) shows a playable Watchhouse artist embed to
  an anonymous visitor — visually equivalent floor to the Orange Peel reference page.
- Backfill matches the existing catalog; only `exact` matches render; `fuzzy` land in the
  admin `needs_review` queue; repeat artist names hit the cache (no duplicate API calls).
- "Not the right artist?" flag hides the embed pending review; a connected listener's
  replace fixes it for everyone and leaves an audit row.
- Board: an event with playable songs shows the listenable chip; ~700 ms hover shows the
  pre-play indicator, then audio fades in over 2–3 s; leaving fades out; hovering another
  card hands playback off; clicking the card mid-anything navigates to the detail page.
- First-ever hover with no prior page interaction shows "click ♫ to listen" instead of
  silent failure; after one interaction, hover-play works for the session.
- No previews / touch device / reduced-motion → graceful variants per E; no console
  errors, no broken UI.
- No iframes or audio mounted on initial board paint. New tables registered; registry,
  unit, typecheck, lint, build all green; Snyk-clean; $0.

## Test Scenarios

- Exact name ("Watchhouse") → `auto` match, embed renders anonymously. Ambiguous name
  ("Spoon" vs. tribute-band strings) → exact normalized still auto; a fuzzy top-hit-only
  result → `needs_review`, no embed.
- Backfill run twice → second run is a no-op (rows exist); new event at ingestion gets a
  row without a manual step; `system_job_runs` records both.
- Flag a match → embed disappears; admin confirms → returns; replace → new artist renders.
- Hover 500 ms and leave → nothing plays. Hover 700 ms+ → indicator, then fade-in;
  leave at any point → ≤400 ms fade-out. Hover card B while A plays → A fades out, B in.
- Fresh page load, no clicks, hover → `NotAllowedError` path → click-to-listen nudge;
  click it → playback starts; subsequent hovers autoplay.
- All `preview_url` null → chip + "open to listen" fallback; no `audio.play()` attempts.
- Keyboard: focus dwell on the chip arms the same indicator; Escape stops audio.
- Simulate 429/5xx from Spotify during backfill → batch backs off and resumes; partial
  progress persisted.
