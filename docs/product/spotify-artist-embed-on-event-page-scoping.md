# Scoping: Spotify artist embed on every event page

Status: **Superseded by [PRD 46](prds/prd-46-spotify-artist-embed-and-hover-listening.md).** Created 2026-07-04.

## The ask

Match the Orange Peel experience — a directly playable Spotify artist player on the event
page (e.g. [Watchhouse at Hellbender](https://theorangepeel.net/event/watchhouse-3/hellbender-by-the-orange-peel/asheville-north-carolina/))
— on the corresponding AVLmc event page, automatically, for every event with a matchable
artist.

## How Orange Peel does it (verified 2026-07-04)

Their event page contains plain iframes, one per act:

```
https://open.spotify.com/embed/artist/675tsBPpaZtqyiBwEf3ZEP?utm_source=generator  (Watchhouse)
https://open.spotify.com/embed/artist/6Qm9stX6XO1a4c7BXQDDgc?utm_source=generator  (Fruit Bats)
https://open.spotify.com/embed/artist/4pMqJEcrPoNT1QZgIUKBWg?utm_source=generator  (Two Runner)
```

That's the whole trick. The Spotify **iframe embed requires no API key, no OAuth, no
allowlist, and costs $0**. The artist embed renders Spotify's own "top tracks" mini-player:
30-second previews for anonymous visitors, full tracks when the visitor is logged into
Spotify in their browser. All Orange Peel stores is the **Spotify artist ID** per event.

## What AVLmc already has

- **Track embeds on the event page** — PRD 17 Shared Listening renders
  `https://open.spotify.com/embed/track/{id}` iframes (`components/SharedListening.tsx`),
  with the Snyk-approved pattern: base62-validated ID, URL built at the sink. An artist
  embed is the same pattern with `/embed/artist/`.
- **Artist → Spotify matching logic** — `getSpotifyArtistTopTracks` in `lib/music.ts`
  (PRD 17 / Phase 9 C1) already searches Spotify for an event's artist and picks the best
  match (`pickBestArtistMatch`: exact case-insensitive name, else top hit). **But it runs
  on a signed-in user's access token**, so it only works for allowlisted, Spotify-connected
  users (Development Mode gate, PRD 43).
- **A correction store** — `spotify_event_match_corrections` (reject/replace wrong
  matches, keyed per event + term).
- **App credentials** — `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET` are already configured
  (used for token refresh in `lib/music.ts`).

## The one real gap

Events store `artist_name` (text) but **no Spotify artist ID**, and today nothing can
resolve names → IDs without a signed-in user. That's the entire feature: a server-side
resolver plus a place to store the result.

**Key unlock: Client Credentials flow.** The same `AUTH_SPOTIFY_ID`/`SECRET` can mint an
app-only token (`grant_type=client_credentials`) and call `GET /v1/search?type=artist`.
Development Mode's 25-user allowlist gates **user authorization**, not app-token catalog
reads — so this works today, for all events, with zero user involvement and no new
Spotify approvals. (Verify once in Story A; it's the only assumption in this doc.)

## Recommended design

This is **one PRD-sized feature, not an epic**. MVP is stories A–C.

### Story A — App-token Spotify client (S)
`lib/spotify-app-token.ts`: client-credentials token fetch + in-memory/DB cache
(tokens last 1h). Confirm catalog search works under Development Mode.

### Story B — Artist matcher + storage + backfill (M)
- New table `event_artist_matches`:
  `(event_id, artist_name, normalized_name, spotify_artist_id, spotify_name, confidence, status, matched_at)`
  — status: `auto | needs_review | rejected | replaced`.
- Matcher reuses/refactors `pickBestArtistMatch` to be token-agnostic (shared with the
  PRD 17 user-token path). Confidence rules: exact normalized match → `auto`; fuzzy top
  hit → `needs_review` (no embed until confirmed). Cache by `normalized_name` so repeat
  artists match once.
- Hook into event ingestion for new events + `scripts/backfill-artist-matches.ts` for the
  existing catalog. Record runs in `system_job_runs`.

### Story C — Event page embed (S)
`components/ArtistEmbed.tsx` (server-renderable, anonymous-visible): for a confident
match, render

```html
<iframe src="https://open.spotify.com/embed/artist/{base62-validated-id}?utm_source=generator"
        width="100%" height="352" loading="lazy" style="border:0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
```

Placed on `app/event/[id]/page.tsx` above/beside Shared Listening. No match → section
absent (graceful nothing). Same sink-validation discipline as PRD 17.

### Story D — Correction + review loop (S–M)
- Listener-facing "not the right artist?" affordance reusing the
  `spotify_event_match_corrections` reject/replace model; a reject hides the embed, a
  replace (via existing artist search for connected users) fixes it for everyone.
- Admin view of `needs_review` matches (fits the existing admin portal patterns).

### Story E — Support acts (later, optional)
AVLmc's Watchhouse record holds only "Watchhouse"; Orange Peel shows three embeds because
their CMS knows the openers. Options when wanted: parse "with special guests X / plus Y"
from source listings during ingestion, or store `support_artists text[]` upstream. The
matcher/embed pipeline from B–C then applies per artist unchanged.

## Risks

- **Wrong-artist matches** (common names, tribute acts) — the classic failure. Mitigated
  by exact-match-only auto-embedding, `needs_review` holding pen, and the Story D
  correction loop. A wrong embed is worse than no embed.
- **Client-credentials-under-dev-mode assumption** — verify first in Story A. Fallback if
  ever restricted: resolve via already-connected users' tokens opportunistically (slower
  coverage), or hand-curate IDs for the top venues' calendars.
- **Anonymous playback is 30-second previews** — that matches the Orange Peel experience
  exactly; full playback needs the visitor's own Spotify login in-browser (not our gate).
- **Rate limits** — negligible: one search per *unique* artist name, cached forever,
  nightly batch for new events.

## Effort

MVP (A + B + C): ~2–4 focused days. D: ~1–2 days. E: separate, depends on ingestion.
