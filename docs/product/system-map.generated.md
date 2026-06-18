<!-- GENERATED FILE — do not edit by hand. Source of truth: lib/system-registry.ts. Regenerate with `npm run generate:system-map`. -->

# AVL Music Companion — System Map

Authoritative, generated architecture reference. It is rendered from the typed System Registry (`lib/system-registry.ts`) that also powers the `/admin` visual graph and the `GET /api/admin/system-map` JSON export, so this document, the portal, and the API cannot drift apart.

A new developer or AI agent can read this file alone to understand how data flows from AVLgo into a ranked homepage card, and where each piece's source of truth lives. Live row counts are omitted here (they are shown live in the portal); everything else is the real wiring.

## The Spine: AVLgo → Homepage

```
AVLgo Export ─▶ Event Ingestion ─▶ Deduplication ─▶ events table
                                                       │
                                  Discovery Scoring ◀──┘
                                         │
                                  Event Board ─▶ Homepage
```

## Nodes by Layer

### Sources

_Where raw data originates._

#### AVLgo Export  `src-avlgo`

Primary upstream event feed (avlgo.com JSON export). Read on a daily schedule and on demand.

- **Kind:** External source
- **Source of truth:** `lib/events.ts`
- **Access:** public
- **Ownership:** automated
- **Env vars (names only):** `AVLGO_API_URL`
- **Health probe:** `avlgo-feed` (PRD 07)
- **Reference:** https://www.avlgo.com
- **Flows to / depends on:**
  - → Event Ingestion (flowsTo) — daily JSON export

#### Seed Events  `src-seed`

Hardcoded fallback events used when the AVLgo feed is unreachable, so the board never renders empty.

- **Kind:** External source
- **Source of truth:** `lib/events.ts`
- **Access:** public
- **Ownership:** manual
- **Flows to / depends on:**
  - → Event Ingestion (flowsTo) — fallback when feed down

#### Spotify Web API  `int-spotify`

Optional. Supplies a signed-in listener's top artists/tracks for taste and powers event artist matching.

- **Kind:** Integration
- **Source of truth:** `lib/music.ts`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `AUTH_SPOTIFY_ENABLED`, `AUTH_SPOTIFY_ID`, `AUTH_SPOTIFY_SECRET`
- **Health probe:** `spotify-api` (PRD 07)
- **Reference:** https://developer.spotify.com/documentation/web-api
- **Flows to / depends on:**
  - → Music Taste Sync (flowsTo) — top artists/tracks
  - → Shared Listening (flowsTo) — artist top tracks

### Processing

_Normalize, dedupe, rank._

#### Event Ingestion  `svc-events`

Fetches the AVLgo feed, normalizes fields, filters to music events, applies the 21-day rolling window, and upserts into the events table.

- **Kind:** Service
- **Source of truth:** `lib/events.ts`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `AVLGO_API_URL`
- **Flows to / depends on:**
  - → Deduplication (flowsTo) — normalized rows
  - → Vercel Blob (flowsTo) — cache images
- **Fed by / required by:**
  - ← AVLgo Export (flowsTo) — daily JSON export
  - ← Seed Events (flowsTo) — fallback when feed down
  - ← AVLgo Sync (cron) (dependsOn) — scheduled trigger

#### Deduplication  `svc-event-dedupe`

Groups near-identical events and picks a canonical record, hiding the rest. Surfaces the audit in the admin Gaps tab.

- **Kind:** Service
- **Source of truth:** `lib/event-dedupe.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → events (flowsTo) — upsert canonical
- **Fed by / required by:**
  - ← Event Ingestion (flowsTo) — normalized rows

#### Music Taste Sync  `svc-music`

Pulls a connected listener's Spotify profile into music_connections and music_profile_items, and matches event artists to Spotify.

- **Kind:** Service
- **Source of truth:** `lib/music.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → music_connections (flowsTo) — connection state
  - → music_profile_items (flowsTo) — taste items
- **Fed by / required by:**
  - ← Spotify Web API (flowsTo) — top artists/tracks
  - ← spotify_event_match_corrections (flowsTo) — refines matching
  - ← Listener (me) API (dependsOn) — sync taste

#### Shared Listening  `svc-shared-songs`

When a signed-in listener Goes/Fires an event, resolves the artist's Spotify top tracks and seeds them into the public event_shared_songs list (read-only Spotify; no writes). Computes the per-viewer 'you already love this one' overlap.

- **Kind:** Service
- **Source of truth:** `lib/shared-songs.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → event_shared_songs (flowsTo) — upsert shared songs
- **Fed by / required by:**
  - ← Spotify Web API (flowsTo) — artist top tracks
  - ← Discovery Action API (flowsTo) — seed on going/fire

#### Discovery Scoring  `svc-discovery`

Ranks events per request by blending taste profile, behavioral signals, and listener-configured weights — including the off-by-default, hard-capped socialCircle component (PRD 26): a viewer's own followed-and-opted-in friends/curators, distinct from anonymous socialHeat. Anonymous visitors get public-signal-only ranking (socialCircle contributes 0).

- **Kind:** Service
- **Source of truth:** `lib/discovery.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → Event Board (flowsTo) — ranked order
  - → Signal Memory (dependsOn) — reads signals
- **Fed by / required by:**
  - ← events (flowsTo) — candidate events
  - ← music_profile_items (flowsTo) — taste weights
  - ← listener_discovery_preferences (flowsTo) — custom weights
  - ← Genre Taxonomy (flowsTo) — genre matching

#### Signal Memory  `svc-discovery-memory`

Persists and reads per-listener behavioral signals (impressions, opens, fire, planning, removals) that feed discovery scoring.

- **Kind:** Service
- **Source of truth:** `lib/discovery-memory.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → event_interaction_events (flowsTo) — append log
  - → event_person_event_state (flowsTo) — per-event state
- **Fed by / required by:**
  - ← Discovery Scoring (dependsOn) — reads signals
  - ← Discovery Action API (flowsTo) — logs actions

#### Community Service  `svc-community`

Validates and stores community contributions, reactions, and ticket/going intents; powers moderation status.

- **Kind:** Service
- **Source of truth:** `lib/community.ts`
- **Access:** internal
- **Ownership:** hybrid
- **Flows to / depends on:**
  - → contributions (flowsTo) — songs/notes/voices
  - → reactions (flowsTo) — fire
  - → event_intents (flowsTo) — going/ticket
- **Fed by / required by:**
  - ← Community API (dependsOn)

#### Listener Preferences  `svc-listener-prefs`

Reads and writes a signed-in listener's configurable discovery weights and custom taste signals.

- **Kind:** Service
- **Source of truth:** `lib/listener-preferences.ts`
- **Access:** internal
- **Ownership:** manual
- **Flows to / depends on:**
  - → listener_discovery_preferences (flowsTo) — saved weights
- **Fed by / required by:**
  - ← Listener (me) API (dependsOn) — save settings

#### Genre Taxonomy  `svc-genre-taxonomy`

In-code source of truth for genre understanding: canonical genres, alias/synonym maps, and parent/child relationships. Feeds richer, explainable genre matching for everyone and is the vocabulary Spotify genres map onto.

- **Kind:** Service
- **Source of truth:** `lib/genre-taxonomy.ts`
- **Access:** public
- **Ownership:** manual
- **Flows to / depends on:**
  - → Discovery Scoring (flowsTo) — genre matching

#### Saved Items  `svc-saved-items`

Reads and writes a signed-in listener's private Saved/Favorites (events, venues, artists); normalized-name identity for venues/artists shared with discovery scoring.

- **Kind:** Service
- **Source of truth:** `lib/saved-items.ts`
- **Access:** internal
- **Ownership:** manual
- **Flows to / depends on:**
  - → saved_items (flowsTo) — persist saves
  - → Saved Space (flowsTo) — grouped saved lists
- **Fed by / required by:**
  - ← Saved Items API (dependsOn) — save/list/remove

#### Social Graph  `svc-social-graph`

Reads and writes a signed-in listener's private, one-way follow edges (PRD 23). Entitlement-scoped: exposes who the caller follows and their aggregate follower count, never a regular listener's follower identities. Owns canViewActivityOf (follow edge AND the followee's sharing opt-in) for later cycles. Never wired into any public/community/OG response.

- **Kind:** Service
- **Source of truth:** `lib/social-graph.ts`
- **Access:** internal
- **Ownership:** manual
- **Flows to / depends on:**
  - → listener_follows (flowsTo) — persist follow edges
  - → listener_discovery_preferences (dependsOn) — activity-sharing opt-in gate
- **Fed by / required by:**
  - ← Follows API (dependsOn) — follow/unfollow/list

#### Social Activity (Inner-Circle)  `svc-social-activity`

Inner-circle attribution (PRD 24): a live READ layer that joins the C1 follow graph against existing going/firing (event_person_event_state) and shared-song seeders (event_shared_songs.seeded_by_user_id), returning only activity of followees the viewer follows AND who opted into sharing. No new table — attribution is gated at the SQL join and seeded_by_user_id is resolved to a name server-side, never shipped raw. Empty for anonymous callers; never in any public/community/OG response.

- **Kind:** Service
- **Source of truth:** `lib/social-activity.ts`
- **Access:** internal
- **Ownership:** manual
- **Flows to / depends on:**
  - → listener_follows (dependsOn) — follow edges (gate)
  - → event_person_event_state (dependsOn) — going/firing source
  - → event_shared_songs (dependsOn) — seeder attribution (gated)
  - → Event Board (flowsTo) — circle badge (signed-in)
  - → Event Detail (flowsTo) — people-you-follow strip + attribution
- **Fed by / required by:**
  - ← Circle Activity API (dependsOn) — your-people going/firing
  - ← Circle Share API (dependsOn) — share with circle

#### Curators  `svc-curators`

Admin-promoted curator personas + per-show picks (PRD 25). Public reads expose only the persona + visible picks (never private going/firing, never a non-curator listener, never tokens/PII); admin writes promote/demote/hide and manage picks. Following a curator reuses the C1 listener_follows edge.

- **Kind:** Service
- **Source of truth:** `lib/curators.ts`
- **Access:** public
- **Ownership:** hybrid
- **Flows to / depends on:**
  - → curators (flowsTo) — persona persistence
  - → curator_picks (flowsTo) — per-show picks
  - → Curator Profile (flowsTo) — profile + top-list + picks
  - → Event Board (flowsTo) — curated-by board signal
  - → Event Detail (flowsTo) — curated-by detail signal
- **Fed by / required by:**
  - ← Curators API (dependsOn) — directory + profile
  - ← Curator Application API (dependsOn) — apply + my status (self-serve)
  - ← Curator Self-Management API (dependsOn) — self-manage persona + picks
  - ← Admin Curators API (dependsOn) — promote/hide + picks + review queue

### Data Stores

_Postgres tables of record._

#### events  `db-events`

Canonical normalized music events shown on the board and detail pages.

- **Kind:** Data store
- **Source of truth:** `events`
- **Access:** internal
- **Ownership:** automated
- **Health probe:** `event-data` (PRD 07)
- **Live count:** `events` (resolved in portal/API)
- **Flows to / depends on:**
  - → Discovery Scoring (flowsTo) — candidate events
  - → Event Board (flowsTo) — event rows
  - → Event Detail (flowsTo) — event by id
- **Fed by / required by:**
  - ← Deduplication (flowsTo) — upsert canonical
  - ← Admin Data Loader (dependsOn) — reads counts

#### system_job_runs  `db-job-runs`

Append-only record of scheduled job outcomes (start, finish, success/failure, items) for cron observability.

- **Kind:** Data store
- **Source of truth:** `system_job_runs`
- **Access:** admin
- **Ownership:** automated
- **Live count:** `system_job_runs` (resolved in portal/API)
- **Fed by / required by:**
  - ← AVLgo Sync (cron) (flowsTo) — records outcome
  - ← Image Cleanup (cron) (flowsTo) — records outcome

#### admin_resources  `db-admin-resources`

Curated partner/resource directory — sources, playlists, venue partners, sponsors, community orgs — managed in the Stewardship tab.

- **Kind:** Data store
- **Source of truth:** `admin_resources`
- **Access:** admin
- **Ownership:** manual
- **Live count:** `admin_resources` (resolved in portal/API)
- **Flows to / depends on:**
  - → Ryan's Playlist (flowsTo) — catalogs
- **Fed by / required by:**
  - ← Admin Portal (flowsTo) — manages directory

#### contributions  `db-contributions`

Community songs, notes, and voice memos attached to events; carries moderation status.

- **Kind:** Data store
- **Source of truth:** `contributions`
- **Access:** internal
- **Ownership:** hybrid
- **Live count:** `contributions` (resolved in portal/API)
- **Fed by / required by:**
  - ← Community Service (flowsTo) — songs/notes/voices
  - ← Admin Data Loader (dependsOn) — reads counts

#### feedback  `db-feedback`

Listener feedback (notes from the 404 detour + general). Anonymous-friendly capture: message, optional email, the path they came from, and the submitter's user id when signed in. Private to the admin; never surfaced publicly.

- **Kind:** Data store
- **Source of truth:** `feedback`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `feedback` (resolved in portal/API)
- **Flows to / depends on:**
  - → users (dependsOn) — optional submitter (set null)
- **Fed by / required by:**
  - ← Feedback API (flowsTo) — stores listener feedback

#### reactions  `db-reactions`

Lightweight per-session reactions (fire) on events.

- **Kind:** Data store
- **Source of truth:** `reactions`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `reactions` (resolved in portal/API)
- **Fed by / required by:**
  - ← Community Service (flowsTo) — fire

#### event_intents  `db-event-intents`

Going / ticket-click intents per identity, sourced from avlmc, spotify, or ticket clicks.

- **Kind:** Data store
- **Source of truth:** `event_intents`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `event_intents` (resolved in portal/API)
- **Fed by / required by:**
  - ← Community Service (flowsTo) — going/ticket

#### event_interaction_events  `db-interaction-events`

Append-only behavioral log (impressions, opens, clicks, fire, planning) feeding discovery.

- **Kind:** Data store
- **Source of truth:** `event_interaction_events`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `event_interaction_events` (resolved in portal/API)
- **Fed by / required by:**
  - ← Signal Memory (flowsTo) — append log

#### event_person_event_state  `db-person-event-state`

Per-identity, per-event state (fire / planning / removed) used to personalize and de-duplicate signals.

- **Kind:** Data store
- **Source of truth:** `event_person_event_state`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `event_person_event_state` (resolved in portal/API)
- **Fed by / required by:**
  - ← Signal Memory (flowsTo) — per-event state
  - ← Social Activity (Inner-Circle) (dependsOn) — going/firing source

#### users  `db-users`

Auth.js user records for signed-in listeners.

- **Kind:** Data store
- **Source of truth:** `users`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `users` (resolved in portal/API)
- **Fed by / required by:**
  - ← Auth.js (flowsTo) — user records
  - ← user_emails (dependsOn) — emails per account (cascade)
  - ← spotify_access_requests (dependsOn) — request per user (cascade)
  - ← saved_items (dependsOn) — owned by user (cascade)
  - ← listener_follows (dependsOn) — follower/followee (cascade)
  - ← feedback (dependsOn) — optional submitter (set null)
  - ← curators (dependsOn) — persona over a user (cascade)

#### accounts  `db-accounts`

Auth.js OAuth account links (provider tokens live here; never exposed to the admin).

- **Kind:** Data store
- **Source of truth:** `accounts`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `accounts` (resolved in portal/API)
- **Fed by / required by:**
  - ← Auth.js (flowsTo) — oauth links

#### user_emails  `db-user-emails`

Multiple verified emails per account (PRD 35): the magic-link email plus the email each linked music platform returns. Global UNIQUE on lower(email) so any email resolves to one identity; users.email stays the primary/display value. Never exposed publicly.

- **Kind:** Data store
- **Source of truth:** `user_emails`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `user_emails` (resolved in portal/API)
- **Flows to / depends on:**
  - → users (dependsOn) — emails per account (cascade)
- **Fed by / required by:**
  - ← Auth.js (flowsTo) — records provider email
  - ← Account Links API (dependsOn) — linked providers + emails

#### spotify_access_requests  `db-spotify-access-requests`

Spotify tester-slot access requests (PRD 36): a not-yet-approved listener's Spotify email + status (pending/slot_added/approved/rejected) while Spotify is in Development Mode (25-user allowlist). One open request per user; the slot add is an external dashboard action this only tracks. The Spotify email is private to listener + admin — never exposed publicly.

- **Kind:** Data store
- **Source of truth:** `spotify_access_requests`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `spotify_access_requests` (resolved in portal/API)
- **Flows to / depends on:**
  - → users (dependsOn) — request per user (cascade)
- **Fed by / required by:**
  - ← Spotify Access Request API (dependsOn) — submit + my status
  - ← Admin Spotify Access API (dependsOn) — review queue + slot-added

#### music_connections  `db-music-connections`

A listener's connected music providers, scopes, sync state, and taste opt-out.

- **Kind:** Data store
- **Source of truth:** `music_connections`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `music_connections` (resolved in portal/API)
- **Fed by / required by:**
  - ← Music Taste Sync (flowsTo) — connection state
  - ← Admin Data Loader (dependsOn) — reads counts

#### music_profile_items  `db-music-profile-items`

A listener's top artists/tracks pulled from their provider (incl. per-artist genres captured at sync); the raw material of taste.

- **Kind:** Data store
- **Source of truth:** `music_profile_items`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `music_profile_items` (resolved in portal/API)
- **Flows to / depends on:**
  - → Discovery Scoring (flowsTo) — taste weights
- **Fed by / required by:**
  - ← Music Taste Sync (flowsTo) — taste items

#### listener_discovery_preferences  `db-listener-prefs`

Per-listener discovery weights and custom signals that tune ranking.

- **Kind:** Data store
- **Source of truth:** `listener_discovery_preferences`
- **Access:** internal
- **Ownership:** manual
- **Live count:** `listener_discovery_preferences` (resolved in portal/API)
- **Flows to / depends on:**
  - → Discovery Scoring (flowsTo) — custom weights
- **Fed by / required by:**
  - ← Listener Preferences (flowsTo) — saved weights
  - ← Social Graph (dependsOn) — activity-sharing opt-in gate

#### spotify_event_match_corrections  `db-spotify-corrections`

Listener corrections to Spotify artist matches (reject / replace) that refine future matching.

- **Kind:** Data store
- **Source of truth:** `spotify_event_match_corrections`
- **Access:** internal
- **Ownership:** hybrid
- **Live count:** `spotify_event_match_corrections` (resolved in portal/API)
- **Flows to / depends on:**
  - → Music Taste Sync (flowsTo) — refines matching
- **Fed by / required by:**
  - ← Discovery Action API (flowsTo) — match corrections

#### saved_items  `db-saved-items`

Private, polymorphic Saved/Favorites for signed-in listeners: events, venues, and artists. Never exposed in public responses.

- **Kind:** Data store
- **Source of truth:** `saved_items`
- **Access:** internal
- **Ownership:** manual
- **Live count:** `saved_items` (resolved in portal/API)
- **Flows to / depends on:**
  - → users (dependsOn) — owned by user (cascade)
- **Fed by / required by:**
  - ← Saved Items (flowsTo) — persist saves

#### listener_follows  `db-listener-follows`

Private, one-way follow edges (follower → followee) for the Social / Curator Graph (PRD 23). Unfollowing deletes the row; on delete cascade keeps it clean. Never exposed in any public/community/OG response.

- **Kind:** Data store
- **Source of truth:** `listener_follows`
- **Access:** internal
- **Ownership:** manual
- **Live count:** `listener_follows` (resolved in portal/API)
- **Flows to / depends on:**
  - → users (dependsOn) — follower/followee (cascade)
- **Fed by / required by:**
  - ← Social Graph (flowsTo) — persist follow edges
  - ← Social Activity (Inner-Circle) (dependsOn) — follow edges (gate)

#### curators  `db-curators`

Admin-promoted public curator personas layered on a user (PRD 25). One row per promoted user; handle is URL-safe + unique. Public persona only — no private/account fields exposed.

- **Kind:** Data store
- **Source of truth:** `curators`
- **Access:** public
- **Ownership:** hybrid
- **Live count:** `curators` (resolved in portal/API)
- **Flows to / depends on:**
  - → users (dependsOn) — persona over a user (cascade)
- **Fed by / required by:**
  - ← Curators (flowsTo) — persona persistence

#### curator_picks  `db-curator-picks`

A curator's deliberate, attributed per-show picks (PRD 25). No FK to events (events re-ingest daily) — snapshots event_title and resolves live metadata via a tolerant join at read time.

- **Kind:** Data store
- **Source of truth:** `curator_picks`
- **Access:** public
- **Ownership:** hybrid
- **Live count:** `curator_picks` (resolved in portal/API)
- **Fed by / required by:**
  - ← Curators (flowsTo) — per-show picks

#### event_shared_songs  `db-shared-songs`

Public, deduped per-event song list seeded when a signed-in Spotify listener Goes/Fires. Outside discovery scoring. seeded_by_user_id is server-only and never exposed.

- **Kind:** Data store
- **Source of truth:** `event_shared_songs`
- **Access:** public
- **Ownership:** hybrid
- **Live count:** `event_shared_songs` (resolved in portal/API)
- **Flows to / depends on:**
  - → Event Detail (flowsTo) — shared listening
  - → Event Board (flowsTo) — compact affordance
- **Fed by / required by:**
  - ← Shared Listening (flowsTo) — upsert shared songs
  - ← Social Activity (Inner-Circle) (dependsOn) — seeder attribution (gated)

### Public Experience

_What listeners see._

#### Homepage  `ui-homepage`

The public landing page that renders the ranked event board.

- **Kind:** Surface
- **Source of truth:** `app/page.tsx`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Event Detail (flowsTo) — navigates to
- **Fed by / required by:**
  - ← Event Board (flowsTo) — renders into
  - ← Umami Analytics (dependsOn) — tracks usage

#### Event Board  `ui-eventboard`

Card grid of events with date/venue/tags, reactions, community, and discovery ordering.

- **Kind:** Surface
- **Source of truth:** `components/EventBoard.tsx`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Homepage (flowsTo) — renders into
  - → Discovery Action API (flowsTo) — interaction events
  - → Saved Items API (flowsTo) — save events/venues/artists
  - → Listener Profile (flowsTo) — sign-in entry
  - → Ryan's Playlist (flowsTo) — features
- **Fed by / required by:**
  - ← Discovery Scoring (flowsTo) — ranked order
  - ← events (flowsTo) — event rows
  - ← event_shared_songs (flowsTo) — compact affordance
  - ← Social Activity (Inner-Circle) (flowsTo) — circle badge (signed-in)
  - ← Curators (flowsTo) — curated-by board signal

#### Event Detail  `ui-event-detail`

Per-event page with full context, community panel, and share metadata.

- **Kind:** Surface
- **Source of truth:** `app/event/[id]/page.tsx`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Community Panel (flowsTo) — embeds
  - → Saved Items API (flowsTo) — save from detail
- **Fed by / required by:**
  - ← Homepage (flowsTo) — navigates to
  - ← events (flowsTo) — event by id
  - ← event_shared_songs (flowsTo) — shared listening
  - ← Social Activity (Inner-Circle) (flowsTo) — people-you-follow strip + attribution
  - ← Curators (flowsTo) — curated-by detail signal

#### Curators API  `api-curators`

Public curator directory + per-handle profile (PRD 25). Active curators + visible picks only; no private data, no non-curator listeners, no tokens/PII.

- **Kind:** Surface
- **Source of truth:** `app/api/curators/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Curators (dependsOn) — directory + profile

#### Curator Profile  `ui-curator-profile`

Public curator profile page (/curator/[handle]) — persona, top-list, per-show picks, and a Follow button (C1 edge). Plus the /curators directory. Regular listeners never get a public profile.

- **Kind:** Surface
- **Source of truth:** `app/curator/[handle]/page.tsx`
- **Access:** public
- **Ownership:** manual
- **Flows to / depends on:**
  - → Follows API (flowsTo) — follow a curator (C1 edge)
- **Fed by / required by:**
  - ← Curators (flowsTo) — profile + top-list + picks

### Community

_Listener-contributed signal._

#### Community Panel  `ui-community-panel`

Lets listeners add songs, notes, and voices to an event.

- **Kind:** Surface
- **Source of truth:** `components/CommunityPanel.tsx`
- **Access:** public
- **Ownership:** manual
- **Flows to / depends on:**
  - → Community API (flowsTo) — writes
- **Fed by / required by:**
  - ← Event Detail (flowsTo) — embeds

#### Community API  `api-community`

Write endpoints for contributions, reactions, and ticket intents.

- **Kind:** Surface
- **Source of truth:** `app/api/community/contributions/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Community Service (dependsOn)
- **Fed by / required by:**
  - ← Community Panel (flowsTo) — writes

#### Feedback API  `api-feedback`

Public (anonymous-friendly) feedback write, used by the 404 detour and general feedback. Stores a short note + optional email + originating path; attaches the user id from the session when signed in, never from the body. Resilient — degrades gracefully if the table isn't provisioned. Feedback is private to the admin.

- **Kind:** Surface
- **Source of truth:** `app/api/feedback/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → feedback (flowsTo) — stores listener feedback

#### Discovery Action API  `api-discovery`

Logs event interactions and Spotify match corrections that train discovery.

- **Kind:** Surface
- **Source of truth:** `app/api/discovery/event-action/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Signal Memory (flowsTo) — logs actions
  - → spotify_event_match_corrections (flowsTo) — match corrections
  - → Shared Listening (flowsTo) — seed on going/fire
- **Fed by / required by:**
  - ← Event Board (flowsTo) — interaction events

### Identity & Taste

_Optional sign-in & personalization._

#### Auth.js  `int-authjs`

Optional sign-in backed by the Postgres adapter: email magic link (Resend, branded dark-mode email — lib/auth-email.ts) plus optional Spotify OAuth.

- **Kind:** Integration
- **Source of truth:** `auth.ts`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `NEXT_PUBLIC_AUTH_ENABLED`, `AUTH_SECRET`
- **Health probe:** `auth-provider` (PRD 07)
- **Flows to / depends on:**
  - → users (flowsTo) — user records
  - → accounts (flowsTo) — oauth links
  - → user_emails (flowsTo) — records provider email
- **Fed by / required by:**
  - ← Auth API (dependsOn)

#### Auth API  `api-auth`

Auth.js route handler for sign-in, callback, and session.

- **Kind:** Surface
- **Source of truth:** `app/api/auth/[...nextauth]/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Auth.js (dependsOn)

#### Listener Profile  `ui-listener-profile`

Sign-in, connected accounts, and the taste/discovery settings a listener controls.

- **Kind:** Surface
- **Source of truth:** `components/ListenerProfileButton.tsx`
- **Access:** public
- **Ownership:** manual
- **Flows to / depends on:**
  - → Listener (me) API (flowsTo) — reads/writes
- **Fed by / required by:**
  - ← Event Board (flowsTo) — sign-in entry

#### Listener (me) API  `api-me`

Authenticated endpoints for the current listener: connections, profile, preferences, tracks.

- **Kind:** Surface
- **Source of truth:** `app/api/me/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Music Taste Sync (dependsOn) — sync taste
  - → Listener Preferences (dependsOn) — save settings
- **Fed by / required by:**
  - ← Listener Profile (flowsTo) — reads/writes

#### Saved Items API  `api-saved-items`

Signed-in-only endpoints to list, save, and un-save events, venues, and artists. Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/saved-items/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Saved Items (dependsOn) — save/list/remove
- **Fed by / required by:**
  - ← Event Board (flowsTo) — save events/venues/artists
  - ← Event Detail (flowsTo) — save from detail
  - ← Saved Space (flowsTo) — inline un-save

#### Follows API  `api-follows`

Signed-in-only endpoints to follow, unfollow, and list who the caller follows (+ their own follower count). Returns 401 when anonymous. Never exposes another listener's follower identities or any follow data in a public response.

- **Kind:** Surface
- **Source of truth:** `app/api/me/follows/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Social Graph (dependsOn) — follow/unfollow/list
- **Fed by / required by:**
  - ← Curator Profile (flowsTo) — follow a curator (C1 edge)

#### Circle Activity API  `api-circle-activity`

Signed-in-only endpoint returning the viewer's followed-and-opted-in people going to / firing given events (PRD 24). Returns 401/empty when anonymous; never exposes anyone outside the caller's circle.

- **Kind:** Surface
- **Source of truth:** `app/api/me/circle-activity/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Social Activity (Inner-Circle) (dependsOn) — your-people going/firing

#### Circle Share API  `api-circle-share`

Signed-in-only, idempotent, best-effort endpoint to share a show/song-list with your circle (PRD 24). Reuses existing going state; no Spotify write, no ranking change.

- **Kind:** Surface
- **Source of truth:** `app/api/me/circle-share/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Social Activity (Inner-Circle) (dependsOn) — share with circle

#### Account Links API  `api-me-account-links`

Signed-in-only, self-scoped (PRD 35): returns the caller's linked sign-in providers (tokens stripped) and the emails associated with their one account. Backs the profile UI's "sign in with magic link AND Spotify, one account" view. Resolves the id from the session, never the body; 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/account-links/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → user_emails (dependsOn) — linked providers + emails

#### Spotify Access Request API  `api-me-spotify-access-request`

Signed-in-only listener plane (PRD 36): submit/refresh your OWN Spotify tester-slot access request (your Spotify email → `pending`) and read its status. Exactly one open request per user; the acting id comes from the session, never the body. The Spotify email is private to the listener + admin. Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/spotify-access-request/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → spotify_access_requests (dependsOn) — submit + my status

#### Curator Application API  `api-me-curator-application`

Signed-in-only listener plane (PRD 29): submit a self-authored curator application and read your OWN curator standing. Promoted instantly under the self-serve gate, else `pending` for admin review. The acting user id comes from the session, never the body; applications are private to the applicant + admin (never public, no pay-to-play). Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/curator-application/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Curators (dependsOn) — apply + my status (self-serve)

#### Curator Self-Management API  `api-me-curator`

Signed-in-only, self-scoped curator self-management (PRD 31): edit your OWN persona and add / show-hide / remove your OWN picks. The curator + pick ids are resolved from the session and checked in SQL, so a caller can never read or modify another curator. Admin moderation overrides — a non-active row is read-only here. Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/curator/route.ts`
- **Access:** public
- **Ownership:** automated
- **Flows to / depends on:**
  - → Curators (dependsOn) — self-manage persona + picks

#### Saved Space  `ui-saved-space`

Signed-in-only /saved view with three private lists (events, venues, artists), inline un-save, and empty states. Anonymous visitors are redirected to sign-in.

- **Kind:** Surface
- **Source of truth:** `app/saved/page.tsx`
- **Access:** public
- **Ownership:** manual
- **Flows to / depends on:**
  - → Saved Items API (flowsTo) — inline un-save
- **Fed by / required by:**
  - ← Saved Items (flowsTo) — grouped saved lists

### Operations

_Jobs, admin, observability._

#### Admin Spotify Access API  `api-admin-spotify-access`

Admin-cookie-gated Spotify tester-slot review (PRD 36): list the open request queue with each listener's Spotify email and mark slot_added/approved/rejected after adding them in the Spotify Developer Dashboard (≤25 users / Extended Quota). The slot add is an external action this only tracks. Admin-only — no self-serve.

- **Kind:** Surface
- **Source of truth:** `app/api/admin/spotify-access/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → spotify_access_requests (dependsOn) — review queue + slot-added

#### Admin Curators API  `api-admin-curators`

Admin-cookie-gated curator management (PRD 25): promote/demote/hide curators, add/hide picks. Admin-only — no self-serve, no pay-to-play.

- **Kind:** Surface
- **Source of truth:** `app/api/admin/curators/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Flows to / depends on:**
  - → Curators (dependsOn) — promote/hide + picks + review queue

#### AVLgo Sync (cron)  `job-avlgo-sync`

Daily scheduled refresh of events from the AVLgo feed (10:00 UTC).

- **Kind:** Scheduled job
- **Source of truth:** `app/api/sync/avlgo/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Health probe:** `cron-avlgo-sync` (PRD 07)
- **Flows to / depends on:**
  - → Event Ingestion (dependsOn) — scheduled trigger
  - → system_job_runs (flowsTo) — records outcome

#### Image Cleanup (cron)  `job-cleanup`

Daily scheduled cleanup of stale cached event images from blob storage (11:00 UTC).

- **Kind:** Scheduled job
- **Source of truth:** `app/api/sync/cleanup/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Health probe:** `cron-cleanup` (PRD 07)
- **Flows to / depends on:**
  - → Vercel Blob (flowsTo) — delete stale images
  - → system_job_runs (flowsTo) — records outcome

#### Vercel Blob  `int-blob`

Stores cached event images so cards stay fast and the upstream feed isn't hammered.

- **Kind:** Integration
- **Source of truth:** `lib/blob-storage.ts`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `BLOB_READ_WRITE_TOKEN`
- **Health probe:** `blob-storage` (PRD 07)
- **Fed by / required by:**
  - ← Event Ingestion (flowsTo) — cache images
  - ← Image Cleanup (cron) (flowsTo) — delete stale images

#### Umami Analytics  `int-umami`

Privacy-friendly web analytics. The tracking script runs on public pages; traffic/referrer/page stats are read back into the admin Analytics tab server-side via the Umami Cloud API.

- **Kind:** Integration
- **Source of truth:** `app/layout.tsx`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- **Health probe:** `umami` (PRD 07)
- **Reference:** https://umami.is
- **Flows to / depends on:**
  - → Admin Portal (flowsTo) — stats read back
  - → Homepage (dependsOn) — tracks usage

#### Admin Data Loader  `svc-admin-data`

Aggregates counts, completeness, gaps, and stats for the admin portal (read-only).

- **Kind:** Service
- **Source of truth:** `lib/admin-data.ts`
- **Access:** admin
- **Ownership:** automated
- **Flows to / depends on:**
  - → events (dependsOn) — reads counts
  - → contributions (dependsOn) — reads counts
  - → music_connections (dependsOn) — reads counts
- **Fed by / required by:**
  - ← Admin Portal (dependsOn)

#### System Registry  `svc-registry`

This model. The hand-authored source of truth for the architecture graph, agent export, and health overlays.

- **Kind:** Service
- **Source of truth:** `lib/system-registry.ts`
- **Access:** admin
- **Ownership:** manual
- **Fed by / required by:**
  - ← Admin Portal (dependsOn) — renders graph

#### Admin Portal  `ui-admin`

Password-gated operating console: health, architecture, knowledge graph, stewardship, insight, analytics.

- **Kind:** Surface
- **Source of truth:** `components/AdminPortal.tsx`
- **Access:** admin
- **Ownership:** manual
- **Env vars (names only):** `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN`
- **Flows to / depends on:**
  - → Admin Data Loader (dependsOn)
  - → System Registry (dependsOn) — renders graph
  - → admin_resources (flowsTo) — manages directory
- **Fed by / required by:**
  - ← Umami Analytics (flowsTo) — stats read back

### Partners

_Ecosystem relationships._

#### Ryan's Playlist  `partner-ryan-playlist`

Curated Spotify playlist featured in the navigation — the first ecosystem partner connection.

- **Kind:** Partner
- **Source of truth:** `components/EventBoard.tsx`
- **Access:** public
- **Ownership:** manual
- **Reference:** https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM
- **Fed by / required by:**
  - ← Event Board (flowsTo) — features
  - ← admin_resources (flowsTo) — catalogs

## Data Flows & Dependencies

| From | → | To | Kind | What moves |
| --- | --- | --- | --- | --- |
| AVLgo Export | → | Event Ingestion | flowsTo | daily JSON export |
| Seed Events | → | Event Ingestion | flowsTo | fallback when feed down |
| AVLgo Sync (cron) | → | Event Ingestion | dependsOn | scheduled trigger |
| Event Ingestion | → | Deduplication | flowsTo | normalized rows |
| Deduplication | → | events | flowsTo | upsert canonical |
| Event Ingestion | → | Vercel Blob | flowsTo | cache images |
| events | → | Discovery Scoring | flowsTo | candidate events |
| Discovery Scoring | → | Event Board | flowsTo | ranked order |
| events | → | Event Board | flowsTo | event rows |
| Event Board | → | Homepage | flowsTo | renders into |
| Homepage | → | Event Detail | flowsTo | navigates to |
| events | → | Event Detail | flowsTo | event by id |
| Discovery Scoring | → | Signal Memory | dependsOn | reads signals |
| Signal Memory | → | event_interaction_events | flowsTo | append log |
| Signal Memory | → | event_person_event_state | flowsTo | per-event state |
| Discovery Action API | → | Signal Memory | flowsTo | logs actions |
| Discovery Action API | → | spotify_event_match_corrections | flowsTo | match corrections |
| Event Board | → | Discovery Action API | flowsTo | interaction events |
| Spotify Web API | → | Music Taste Sync | flowsTo | top artists/tracks |
| Music Taste Sync | → | music_connections | flowsTo | connection state |
| Music Taste Sync | → | music_profile_items | flowsTo | taste items |
| music_profile_items | → | Discovery Scoring | flowsTo | taste weights |
| Listener Preferences | → | listener_discovery_preferences | flowsTo | saved weights |
| listener_discovery_preferences | → | Discovery Scoring | flowsTo | custom weights |
| Genre Taxonomy | → | Discovery Scoring | flowsTo | genre matching |
| spotify_event_match_corrections | → | Music Taste Sync | flowsTo | refines matching |
| Spotify Web API | → | Shared Listening | flowsTo | artist top tracks |
| Discovery Action API | → | Shared Listening | flowsTo | seed on going/fire |
| Shared Listening | → | event_shared_songs | flowsTo | upsert shared songs |
| event_shared_songs | → | Event Detail | flowsTo | shared listening |
| event_shared_songs | → | Event Board | flowsTo | compact affordance |
| Community Panel | → | Community API | flowsTo | writes |
| Community API | → | Community Service | dependsOn |  |
| Community Service | → | contributions | flowsTo | songs/notes/voices |
| Community Service | → | reactions | flowsTo | fire |
| Community Service | → | event_intents | flowsTo | going/ticket |
| Event Detail | → | Community Panel | flowsTo | embeds |
| Auth API | → | Auth.js | dependsOn |  |
| Auth.js | → | users | flowsTo | user records |
| Auth.js | → | accounts | flowsTo | oauth links |
| Auth.js | → | user_emails | flowsTo | records provider email |
| user_emails | → | users | dependsOn | emails per account (cascade) |
| Account Links API | → | user_emails | dependsOn | linked providers + emails |
| spotify_access_requests | → | users | dependsOn | request per user (cascade) |
| Spotify Access Request API | → | spotify_access_requests | dependsOn | submit + my status |
| Admin Spotify Access API | → | spotify_access_requests | dependsOn | review queue + slot-added |
| Listener Profile | → | Listener (me) API | flowsTo | reads/writes |
| Listener (me) API | → | Music Taste Sync | dependsOn | sync taste |
| Listener (me) API | → | Listener Preferences | dependsOn | save settings |
| Saved Items API | → | Saved Items | dependsOn | save/list/remove |
| Saved Items | → | saved_items | flowsTo | persist saves |
| saved_items | → | users | dependsOn | owned by user (cascade) |
| Event Board | → | Saved Items API | flowsTo | save events/venues/artists |
| Event Detail | → | Saved Items API | flowsTo | save from detail |
| Saved Items | → | Saved Space | flowsTo | grouped saved lists |
| Saved Space | → | Saved Items API | flowsTo | inline un-save |
| Follows API | → | Social Graph | dependsOn | follow/unfollow/list |
| Social Graph | → | listener_follows | flowsTo | persist follow edges |
| listener_follows | → | users | dependsOn | follower/followee (cascade) |
| Social Graph | → | listener_discovery_preferences | dependsOn | activity-sharing opt-in gate |
| Circle Activity API | → | Social Activity (Inner-Circle) | dependsOn | your-people going/firing |
| Circle Share API | → | Social Activity (Inner-Circle) | dependsOn | share with circle |
| Social Activity (Inner-Circle) | → | listener_follows | dependsOn | follow edges (gate) |
| Social Activity (Inner-Circle) | → | event_person_event_state | dependsOn | going/firing source |
| Social Activity (Inner-Circle) | → | event_shared_songs | dependsOn | seeder attribution (gated) |
| Social Activity (Inner-Circle) | → | Event Board | flowsTo | circle badge (signed-in) |
| Social Activity (Inner-Circle) | → | Event Detail | flowsTo | people-you-follow strip + attribution |
| Curators API | → | Curators | dependsOn | directory + profile |
| Curator Application API | → | Curators | dependsOn | apply + my status (self-serve) |
| Curator Self-Management API | → | Curators | dependsOn | self-manage persona + picks |
| Admin Curators API | → | Curators | dependsOn | promote/hide + picks + review queue |
| Feedback API | → | feedback | flowsTo | stores listener feedback |
| feedback | → | users | dependsOn | optional submitter (set null) |
| Curators | → | curators | flowsTo | persona persistence |
| Curators | → | curator_picks | flowsTo | per-show picks |
| curators | → | users | dependsOn | persona over a user (cascade) |
| Curators | → | Curator Profile | flowsTo | profile + top-list + picks |
| Curators | → | Event Board | flowsTo | curated-by board signal |
| Curators | → | Event Detail | flowsTo | curated-by detail signal |
| Curator Profile | → | Follows API | flowsTo | follow a curator (C1 edge) |
| Event Board | → | Listener Profile | flowsTo | sign-in entry |
| Image Cleanup (cron) | → | Vercel Blob | flowsTo | delete stale images |
| AVLgo Sync (cron) | → | system_job_runs | flowsTo | records outcome |
| Image Cleanup (cron) | → | system_job_runs | flowsTo | records outcome |
| Umami Analytics | → | Admin Portal | flowsTo | stats read back |
| Umami Analytics | → | Homepage | dependsOn | tracks usage |
| Admin Data Loader | → | events | dependsOn | reads counts |
| Admin Data Loader | → | contributions | dependsOn | reads counts |
| Admin Data Loader | → | music_connections | dependsOn | reads counts |
| Admin Portal | → | Admin Data Loader | dependsOn |  |
| Admin Portal | → | System Registry | dependsOn | renders graph |
| Admin Portal | → | admin_resources | flowsTo | manages directory |
| Event Board | → | Ryan's Playlist | flowsTo | features |
| admin_resources | → | Ryan's Playlist | flowsTo | catalogs |

---

_70 nodes, 94 edges. Regenerate with `npm run generate:system-map` after editing `lib/system-registry.ts`._
