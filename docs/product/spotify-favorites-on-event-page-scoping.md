# Scoping: Auto-populate a listener's favorite songs on the event page

Status: **Scoping only — no build.** Created 2026-06-16.

## What this is (and what it is NOT)

When a **signed-in, Spotify-connected** listener engages with an event (clicks **Going /
Fire / Save**), the AVLmc event page should **auto-populate their favorite songs** — a
read-and-display surface that makes the page feel personal and immediately listenable.

This is a **read/display** feature. It is **not** the parked
[Outcome 9](saved-favorites-genre_desiredoutcomes.md) (Spotify library/playlist *write*
actions). Nothing here writes to Spotify, follows artists, or modifies playlists.

| | This feature (read) | Parked Outcome 9 (write) |
| --- | --- | --- |
| Direction | Read user's taste, render on our page | Write to user's Spotify account |
| New OAuth scopes | **None** | `playlist-modify-*`, `user-library-modify`, `user-follow-modify` |
| Re-auth of connected users | **No** | Yes (all of them) |
| Status | Buildable today | Parked behind a product decision |

## Feasibility: buildable now, $0, no new scopes

The data already exists. The `user-top-read` sync stores each connected user's top 20
tracks in `music_profile_items` (`db/schema.sql:88`) with display-ready fields
(`name`, `artist_names[]`, `external_url`, `image_url`, `genres[]`). `listMusicProfileItems`
(`lib/music.ts:200`) already loads them. Live artist-track lookups reuse the existing
`searchSpotifyArtists` / `searchSpotifyTracks` read calls (current scopes). Cost stays $0
(reuses synced rows + occasional cached Spotify read calls).

## Product decisions (settled 2026-06-16)

### 1. Which songs counts as "their favorite songs"? — **DECIDED: hybrid**

Lead with **the artist's own top tracks** so the page is immediately playable for the act
you're hyped about, and **highlight any overlap with the listener's actual favorites**
("you already love this one"). Mechanics:

- **Lead list:** search the event artist → fetch the artist's top tracks → render a
  playable list. Always relevant to the show.
- **Overlap highlight:** cross-reference the signed-in listener's synced `top_track` rows
  (`music_profile_items`, matched on `artist_names` / track identity) and badge matches.
- **Fallback:** artist top-tracks alone when there's no overlap; a connect/sync nudge when
  the listener has no synced data.

### 2. Public or private? — **DECIDED: shared/public, attribution deferred**

The point is for a signed-in listener to **share their love for the music out to everyone**.
So engaging seeds a **shared, public** song surface on the event — not a private panel.

- The shared songs **do not need to be attached to the listener right now** — render the
  shared list **unattributed** for the current phase.
- The lead list is the **artist's own top tracks** (public Spotify data), so there's little
  real taste-exposure. The only private element is the **"you already love this one"
  overlay**, which is shown **only to the signed-in viewer** about their own matches —
  never to anonymous viewers.
- **Forward direction (future phase, not now):** an **inner-circle community** layer —
  friend groups, audiophiles, and influencers sharing their top lists, with attribution
  surfacing **once the viewer is also signed in**. This note's deferred-attribution model is
  the on-ramp to that. Worth promoting to its own desired-outcome when it's time.

### 3. What triggers it? — **DECIDED: Going / Fire only, never Save**

Trigger on **Going (planning)** and **Fire** — never on **Save**. This aligns with the
existing public/private split: Going/Fire already flow through the **public**
`POST /api/discovery/event-action` path, while Save flows through the **private**
`POST /api/me/saved-items`. Sharing on the public reactions and keeping Save private is
architecturally consistent — Save stays the listener's quiet, personal bookmark.

## Proposed minimal slice (for when a plan is greenlit)

1. **Seed shared songs on Going/Fire.** When a signed-in connected listener fires or plans
   (the public `POST /api/discovery/event-action` path), resolve the artist's top tracks
   (`searchSpotifyArtists` → artist top-tracks) and persist them as a **shared, unattributed**
   song list for the event (a small `event_shared_songs`-style store; dedup by track id;
   strengthened, not duplicated, when more fans engage). Save is **not** wired in.
2. **Public render** on `app/event/[id]/page.tsx`: a playable shared list (cover art +
   "Open in Spotify" / optional embed), visible to **everyone** — no attribution this phase.
3. **Per-viewer overlay** (signed-in only): cross-reference the viewer's synced `top_track`
   rows and badge matches with "you already love this one." Never sent to anonymous viewers.
4. **Empty/degraded states:** connected-but-not-synced → sync nudge for the actor; no artist
   match found → skip seeding gracefully; not connected → no seeding, page unchanged.
5. **Security-at-inception (Snyk)** on any new route; keep the per-viewer overlay out of
   public/anonymous responses.

## Risks / constraints to carry into planning

- **Spotify limited/dev mode.** The codebase already handles `SPOTIFY_LIMITED_BETA_*`
  errors (`lib/spotify-limited-access.ts`) — Spotify restricts API access to allowlisted
  users in dev mode. Live artist-track lookups inherit this constraint; the synced
  `top_track` rows used for the overlap overlay do not, since they're already in our DB.
- **Stale/empty taste data.** `top_track` rows exist only after a sync; `genres[]` may be
  empty until a re-sync. Needs graceful empty states (see slice step 4).
- **Public sharing is a deliberate posture choice.** Going/Fire now publish a shared song
  list. The lead list is the artist's *public* top tracks (low taste-exposure); the only
  private element — the "you already love this one" overlay — stays per-viewer. Keep
  attribution off until the inner-circle phase intentionally turns it on (decision 2).
- **Moderation surface.** Shared songs are a new public surface; confirm it inherits the
  existing admin hide/stewardship controls so it can't become a spam vector.
- **Scope discipline.** Stays read-only. It must not drift toward the parked Outcome 9
  (writing back to Spotify).
