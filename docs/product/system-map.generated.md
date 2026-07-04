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
- **Implementation notes:**
  - _SQL fallback:_ On a non-OK response or any fetch/parse error the loader returns hardcoded seed events with shouldPersist=false, so the board never renders empty and a bad fetch never overwrites stored rows.
  - _Note:_ Tolerates three payload shapes — a top-level array, { events: [] }, or { data: [] }.
- **Flows to / depends on:**
  - → Event Ingestion (flowsTo) — daily JSON export

#### Seed Events  `src-seed`

Hardcoded fallback events used when the AVLgo feed is unreachable, so the board never renders empty.

- **Kind:** External source
- **Source of truth:** `lib/events.ts`
- **Access:** public
- **Ownership:** manual
- **Implementation notes:**
  - _Note:_ Hardcoded in lib/events.ts; used only when the live feed is unreachable and never persisted (shouldPersist=false).
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
- **Implementation notes:**
  - _Param mapping:_ Requests only read scopes (user-read-private, user-read-email, user-top-read); no write/library scope is requested.
  - _Runtime gotcha:_ OAuth tokens stay server-side in the Auth.js accounts row and are never read by discovery scoring or exposed in any response.
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
- **Implementation notes:**
  - _Note:_ Only a successful, non-empty fetch triggers upsertEvents; a failed fetch returns seed events without persisting.
  - _SQL fallback:_ upsertEvents writes in batches (EVENT_UPSERT_BATCH_SIZE) with `on conflict (id) do update`, so the daily re-ingest updates rows in place rather than duplicating.
- **Flows to / depends on:**
  - → Deduplication (flowsTo) — normalized rows
  - → Vercel Blob (flowsTo) — cache images
- **Fed by / required by:**
  - ← AVLgo Export (flowsTo) — daily JSON export
  - ← Seed Events (flowsTo) — fallback when feed down
  - ← AVLgo Sync (cron) (dependsOn) — scheduled trigger

#### Deduplication  `svc-event-dedupe`

Groups near-identical events with fuzzy time bucketing — start times within FUZZY_START_WINDOW_MINUTES (90) of a cluster's earliest member merge — and picks a canonical record, hiding the rest. Surfaces the audit in the admin Gaps tab.

- **Kind:** Service
- **Source of truth:** `lib/event-dedupe.ts`
- **Access:** internal
- **Ownership:** automated
- **Implementation notes:**
  - _Param mapping:_ The grouping key is normalizeVenueKey(venue) + normalizeTitleCore(title) — article/plural-stripped word tokens — not the raw strings, so 'The Orange Peel' and 'Orange Peel' collapse.
  - _Note:_ getCanonicalEvents picks one winner per normalized (venue, title-core, date) signature — clustering start times within a 90-minute fuzzy window so cross-source doors-vs-showtime copies collapse — and hides the rest; the audit feeds the admin Gaps tab.
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
- **Implementation notes:**
  - _SQL fallback:_ listMusicConnections / listMusicProfileItems retry a legacy query when the optional taste_opt_out_at / genres columns are absent (runWithMissingColumnFallback).
  - _Runtime gotcha:_ The legacy fallbacks substitute explicitly-typed placeholders (null::timestamptz, '{}'::text[]) because Postgres can't infer a bare null/array's type in the select list.
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
- **Implementation notes:**
  - _SQL fallback:_ Every read is 42P01 (undefined_table) tolerant and degrades to empty, so the public board survives a not-yet-migrated DB.
  - _Param mapping:_ Batch reads bind $1::text[] of event ids; the single-event filter uses `$1::text is null or event_id = $1`.
  - _Note:_ Seeding upserts `on conflict (event_id, provider, provider_track_id) do update` (dedup per track) and is best-effort, so a Spotify failure never breaks the reaction.
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
- **Implementation notes:**
  - _Note:_ Pure (no DB); SCORER_VERSION ('12.4') versions ranking output for the Insight baseline. Best partial match wins across the artist/venue/genre taste maps.
  - _Runtime gotcha:_ Anonymous (and dial-0) callers get socialCircle = 0, keeping the anonymous board byte-for-byte unchanged.
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
- **Implementation notes:**
  - _Param mapping:_ Signal reads bind $1::text[] identity keys and a window via make_interval(days => $2::int); the implicit-signal window is 90 days.
  - _Runtime gotcha:_ Per-dimension unions use explicit casts ('artist'::text as dimension) and tags are unnested via unnest(coalesce(tags, '{}'::text[])) to avoid null-array errors.
  - _Note:_ migrateSessionSignalsToUser re-keys a browser's anonymous rows to the user inside a transaction; per-event state (unique (event_id, identity_key)) merges with GREATEST timestamps; a second run is a no-op.
  - _Note:_ writePersonEventState has toggle semantics: it reads the merged current state once, then writes the same explicit next value (fire_at / planning_at set or cleared) to every identity row, so a signed-in user's user: and session: rows can never desync into a stuck ON.
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
- **Implementation notes:**
  - _Runtime gotcha:_ Count rollups use `count(*) filter (where ...)::int`; a legacy fallback synthesizes the going/fire/source columns when the newer source column is absent.
  - _Note:_ Reactions/intents upsert `on conflict (event_id, identity_key) do update`; user_id is nullable so anonymous participation works. Reactions and Going intents are true toggles: toggleReaction takes an explicit on direction (off deletes the caller's reaction) and removeEventIntent deletes a Going intent — deletes match by session and, for signed-in users, any rows under their user id; external intent sources (spotify / ticket_click) stay set-once.
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
- **Implementation notes:**
  - _Note:_ Pure preference model — nine weighted 0–200 controls (weight 0 fully cancels a dimension) plus ad-hoc custom boost/lower signals; persisted as weights jsonb / custom_signals jsonb.
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
- **Implementation notes:**
  - _Note:_ Pure and client-safe (no server-only import): 20 canonical genres + an alias/synonym map that resolves alias tags (rnb→soul, singer-songwriter→folk) and symmetric parent/child links.
- **Flows to / depends on:**
  - → Discovery Scoring (flowsTo) — genre matching

#### Saved Items  `svc-saved-items`

Reads and writes a signed-in listener's private Saved/Favorites (events, venues, artists); normalized-name identity for venues/artists shared with discovery scoring.

- **Kind:** Service
- **Source of truth:** `lib/saved-items.ts`
- **Access:** internal
- **Ownership:** manual
- **Implementation notes:**
  - _Param mapping:_ For venues/artists (no entity table) item_key = normalizeText(name) — the same normalization discovery scoring uses — so a saved venue/artist matches scoring identity.
  - _SQL fallback:_ Reads are 42P01-tolerant and degrade to empty.
  - _Note:_ saveItem is idempotent via `on conflict (user_id, item_type, item_key) do nothing`.
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
- **Implementation notes:**
  - _SQL fallback:_ Reads tolerate both 42P01 (missing table) and 42703 (missing column) and degrade to empty/false.
  - _Note:_ Follow writes upsert `on conflict (follower_user_id, followee_user_id) do nothing`; activity visibility is gated by coalesce(share_activity, false).
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
- **Implementation notes:**
  - _Note:_ going/firing are derived in the SQL join (planning_at/fire_at present and not superseded by removed_at), gated by the active edge AND the followee's share_activity — so unfollowing or turning sharing off removes visibility instantly (no new table).
  - _Runtime gotcha:_ Reads tolerate 42P01/42703; seeded_by_user_id is resolved to a name server-side and never shipped raw.
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
- **Implementation notes:**
  - _Note:_ curator_picks carry NO FK to events (daily re-ingest would cascade-delete them): event_title is snapshotted and live metadata is resolved via `left join public.events`.
  - _Param mapping:_ The board signal binds $1::text[] event ids and filters status='visible'; promote upserts `on conflict (user_id) do update`.
  - _SQL fallback:_ Reads tolerate 42P01 and degrade to empty.
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
- **Implementation notes:**
  - _Param mapping:_ The window read (listUpcomingEventsFromDatabase) binds $1/$2 = rolling-window start/end as YYYY-MM-DD and $3 = now as ISO.
  - _Note:_ Rows order by coalesce(starts_at, event_date::timestamp + 23:59) so date-only events sort to the end of their day.
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
- **Implementation notes:**
  - _Note:_ Append-only; written by the sync routes via recordJobRun (a start row, then a finish/failure row) and read by the cron health probes.
- **Fed by / required by:**
  - ← AVLgo Sync (cron) (flowsTo) — records outcome
  - ← Image Cleanup (cron) (flowsTo) — records outcome
  - ← Hero Image Backfill (manual) (flowsTo) — records outcome

#### admin_resources  `db-admin-resources`

Curated partner/resource directory — sources, playlists, venue partners, sponsors, community orgs — managed in the Stewardship tab.

- **Kind:** Data store
- **Source of truth:** `admin_resources`
- **Access:** admin
- **Ownership:** manual
- **Live count:** `admin_resources` (resolved in portal/API)
- **Implementation notes:**
  - _Param mapping:_ The live count excludes archived rows (`where status <> 'archived'`); admin-managed via the Stewardship tab.
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
- **Implementation notes:**
  - _Note:_ Nullable user_id (anonymous-first); voice rows exist in the schema but are excluded from the launch surface. Public reads never expose session_id/user_id.
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
- **Implementation notes:**
  - _SQL fallback:_ POST /api/feedback submit is 42P01-tolerant — a not-yet-provisioned table degrades to a friendly success rather than a 500, so the 404-detour form never errors.
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
- **Implementation notes:**
  - _Runtime gotcha:_ A legacy read fallback synthesizes going/fire from the `type` column when the newer `source` column is absent (see lib/community.ts).
- **Fed by / required by:**
  - ← Community Service (flowsTo) — fire

#### event_intents  `db-event-intents`

Going / ticket-click intents per identity, sourced from avlmc, spotify, or ticket clicks.

- **Kind:** Data store
- **Source of truth:** `event_intents`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `event_intents` (resolved in portal/API)
- **Implementation notes:**
  - _Note:_ Going/ticket-click intents per identity_key, tagged by source (avlmc / spotify / ticket_click); the rollup splits each source via `count(*) filter (...)::int`.
- **Fed by / required by:**
  - ← Community Service (flowsTo) — going/ticket

#### event_interaction_events  `db-interaction-events`

Append-only behavioral log (impressions, opens, clicks, fire, planning) feeding discovery.

- **Kind:** Data store
- **Source of truth:** `event_interaction_events`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `event_interaction_events` (resolved in portal/API)
- **Implementation notes:**
  - _Param mapping:_ Window reads bind $1::text[] identity keys + make_interval(days => $2::int).
  - _Note:_ Append-only, keyed by identity_key; the 90-day impression window drives implicit 'skip' cooling, so any prune job must not delete rows inside that window.
- **Fed by / required by:**
  - ← Signal Memory (flowsTo) — append log

#### event_person_event_state  `db-person-event-state`

Per-identity, per-event state (fire / planning / removed) used to personalize and de-duplicate signals.

- **Kind:** Data store
- **Source of truth:** `event_person_event_state`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `event_person_event_state` (resolved in portal/API)
- **Implementation notes:**
  - _Note:_ unique (event_id, identity_key); on the anonymous→account hand-off, rows are merged with GREATEST timestamps so the strongest/most-recent state wins.
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
- **Implementation notes:**
  - _Note:_ Auth.js user record; users.email is demoted to primary/display — multi-email resolution lives in user_emails (PRD 35).
- **Fed by / required by:**
  - ← Auth.js (flowsTo) — user records
  - ← user_emails (dependsOn) — emails per account (cascade)
  - ← spotify_access_requests (dependsOn) — request per user (cascade)
  - ← saved_items (dependsOn) — owned by user (cascade)
  - ← listener_follows (dependsOn) — follower/followee (cascade)
  - ← curator_recommendations (dependsOn) — submitter (cascade)
  - ← feedback (dependsOn) — optional submitter (set null)
  - ← curators (dependsOn) — persona over a user (cascade)

#### accounts  `db-accounts`

Auth.js OAuth account links (provider tokens live here; never exposed to the admin).

- **Kind:** Data store
- **Source of truth:** `accounts`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `accounts` (resolved in portal/API)
- **Implementation notes:**
  - _Runtime gotcha:_ Provider OAuth access/refresh tokens live here and are read server-side only; never surfaced to the admin portal, the API, or this registry.
- **Fed by / required by:**
  - ← Auth.js (flowsTo) — oauth links

#### user_emails  `db-user-emails`

Multiple verified emails per account (PRD 35): the magic-link email plus the email each linked music platform returns. Global UNIQUE on lower(email) so any email resolves to one identity; users.email stays the primary/display value. Never exposed publicly.

- **Kind:** Data store
- **Source of truth:** `user_emails`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `user_emails` (resolved in portal/API)
- **Implementation notes:**
  - _Param mapping:_ Global unique(lower(email)); inserts guard with `where not exists (select 1 ... where lower(email)=lower($2))`, and resolution matches `lower(email)=lower($1)`.
  - _SQL fallback:_ record/find are 42P01/42703-tolerant so a multi-email write never blocks sign-in.
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
- **Implementation notes:**
  - _Note:_ A partial unique index (spotify_access_requests_one_open_idx) enforces one OPEN request per user; status lifecycle is pending → slot_added → approved/rejected.
- **Flows to / depends on:**
  - → users (dependsOn) — request per user (cascade)
- **Fed by / required by:**
  - ← Spotify Access Request API (dependsOn) — submit + my status
  - ← Admin Spotify Access API (dependsOn) — review queue + slot-added
  - ← Admin Tester Requests API (dependsOn) — seat count spans both stores
  - ← Spotify Gate API (dependsOn) — seat check (signed-in loop)

#### tester_requests  `db-tester-requests`

Anonymous Spotify tester interest (PRD 42 / Phase 17): email-keyed, pre-redirect capture of would-be testers — applicants usually have no account yet; convergence happens when they sign in with the same email. One row per email (upsert-on-reapply, status never demoted); lifecycle pending → approved (owner allowlisted in the Spotify dashboard) → invited (invite email sent), or declined (can re-apply without re-notifying). Emails private to applicant + owner.

- **Kind:** Data store
- **Source of truth:** `tester_requests`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `tester_requests` (resolved in portal/API)
- **Implementation notes:**
  - _Note:_ UNIQUE(email), stored lowercased/trimmed; `(xmax = 0)` on the upsert distinguishes a fresh insert (notify the owner) from a re-apply (silent). The seated count spans this table AND spotify_access_requests as distinct emails.
- **Fed by / required by:**
  - ← Tester Request Capture API (dependsOn) — upsert + owner notification
  - ← Admin Tester Requests API (dependsOn) — queue + approve/invite
  - ← Spotify Gate API (dependsOn) — seat check (email loop)

#### music_connections  `db-music-connections`

A listener's connected music providers, scopes, sync state, and taste opt-out.

- **Kind:** Data store
- **Source of truth:** `music_connections`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `music_connections` (resolved in portal/API)
- **Implementation notes:**
  - _SQL fallback:_ listMusicConnections retries with a legacy query when the taste_opt_out_at column is absent, selecting null::timestamptz as taste_opt_out_at instead.
  - _Runtime gotcha:_ The fallback casts the bare null (null::timestamptz) because Postgres cannot infer a column type from an untyped null in the select list.
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
- **Implementation notes:**
  - _SQL fallback:_ listMusicProfileItems (runWithMissingColumnFallback) selects the genres column, then retries substituting '{}'::text[] as genres when the additive PRD-16 column has not been applied yet.
  - _Runtime gotcha:_ The empty-array fallback is explicitly typed ('{}'::text[]) so the driver maps it to string[] exactly like the real column.
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
- **Implementation notes:**
  - _Note:_ weights jsonb + custom_signals jsonb; one row per signed-in listener (anonymous prefs live in localStorage).
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
- **Implementation notes:**
  - _Note:_ Per-person reject/replace corrections consumed by discovery, so a rejected match no longer boosts and a replacement does.
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
- **Implementation notes:**
  - _Param mapping:_ item_key for venues/artists = normalizeText(name) (shared with discovery identity); idempotent insert `on conflict (user_id, item_type, item_key) do nothing`.
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
- **Implementation notes:**
  - _Note:_ One-way reversible edge; unfollowing deletes the row (on delete cascade). The live count filters status='active'.
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
- **Implementation notes:**
  - _Note:_ status includes pending/rejected for Phase 13 self-serve onboarding; handle is URL-safe + unique; promote upserts `on conflict (user_id) do update`.
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
- **Implementation notes:**
  - _Note:_ No FK to events (daily re-ingest would cascade-delete): event_title is snapshotted and live metadata resolved via a tolerant left join; the live count filters status='visible'.
- **Fed by / required by:**
  - ← Curators (flowsTo) — per-show picks

#### curator_recommendations  `db-curator-recommendations`

Listener nominations of someone who should curate ('I know someone') — distinct from a self-serve application where the user applies as themselves. The nominee is free text (no FK; they may not be a user yet); only the submitter is a real user. Private to submitter + admin (never public, no pay-to-play); the admin works the pending → reviewed/dismissed queue.

- **Kind:** Data store
- **Source of truth:** `curator_recommendations`
- **Access:** internal
- **Ownership:** automated
- **Live count:** `curator_recommendations` (resolved in portal/API)
- **Implementation notes:**
  - _Note:_ Signed-in-only submit (the user id comes from the session, never the body); 42P01/42703-tolerant reads. Lifecycle pending → reviewed/dismissed (both stamp resolved_at).
- **Flows to / depends on:**
  - → users (dependsOn) — submitter (cascade)
- **Fed by / required by:**
  - ← Curator Recommendation API (flowsTo) — stores recommendation
  - ← Admin Curators API (dependsOn) — recommendation review queue

#### event_shared_songs  `db-shared-songs`

Public, deduped per-event song list seeded when a signed-in Spotify listener Goes/Fires. Outside discovery scoring. seeded_by_user_id is server-only and never exposed.

- **Kind:** Data store
- **Source of truth:** `event_shared_songs`
- **Access:** public
- **Ownership:** hybrid
- **Live count:** `event_shared_songs` (resolved in portal/API)
- **Implementation notes:**
  - _Note:_ Upsert dedups per track via `on conflict (event_id, provider, provider_track_id)`; the live count filters status='visible'.
  - _Runtime gotcha:_ seeded_by_user_id is stored server-side only (the inner-circle attribution on-ramp) and never appears in the anonymous/public payload.
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
- **Implementation notes:**
  - _Note:_ Server component that resolves the anonymous session cookie and renders the ranked board; fully usable without an account.
- **Flows to / depends on:**
  - → Event Detail (flowsTo) — navigates to
- **Fed by / required by:**
  - ← Event Board (flowsTo) — renders into
  - ← Umami Analytics (dependsOn) — tracks usage

#### Event Board  `ui-eventboard`

Card grid of events with shareable URL-backed filters, custom date ranges, reactions, community, and discovery ordering.

- **Kind:** Surface
- **Source of truth:** `components/EventBoard.tsx`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Filters are URL-backed (deep-linkable); the client re-scores instantly on a local preference/signal change via LISTENER_PREFERENCE_CHANGE_EVENT without a page reload.
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
- **Implementation notes:**
  - _Note:_ Server-rendered per-event page that also generates OG/share metadata; resilient if community / shared-song data can't load.
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
- **Implementation notes:**
  - _Note:_ Public read; returns active curators + visible picks only (never private going/firing, never a non-curator listener, never tokens/PII).
- **Flows to / depends on:**
  - → Curators (dependsOn) — directory + profile

#### Curator Profile  `ui-curator-profile`

Public curator profile page (/curator/[handle]) — persona, top-list, per-show picks, and a Follow button (C1 edge). Plus the /curators directory. Regular listeners never get a public profile.

- **Kind:** Surface
- **Source of truth:** `app/curator/[handle]/page.tsx`
- **Access:** public
- **Ownership:** manual
- **Implementation notes:**
  - _Note:_ Resolves the curator by URL-safe handle; renders persona + top-list + visible picks + a Follow button (C1 edge). Regular listeners never get a public profile.
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
- **Implementation notes:**
  - _Runtime gotcha:_ Snyk flags a DOM-based XSS dataflow here (a useState value flowing into a rendered sink, ~line 567) — a tracked, pre-existing finding to harden.
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
- **Implementation notes:**
  - _Param mapping:_ Body parsed as Record<string, unknown> and validated in lib/community.ts; identity_key comes from the session or the anonymous session cookie, never raw client input.
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
- **Implementation notes:**
  - _Param mapping:_ Body parsed with `.catch(() => null)`; the user id is taken from the session when signed in, never from the body.
  - _SQL fallback:_ Tolerates a not-yet-provisioned table (returns a friendly success); only an unexpected error returns 500.
- **Flows to / depends on:**
  - → feedback (flowsTo) — stores listener feedback

#### Discovery Action API  `api-discovery`

Logs event interactions and Spotify match corrections that train discovery.

- **Kind:** Surface
- **Source of truth:** `app/api/discovery/event-action/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Runtime gotcha:_ Body parsed with `.catch(() => null)`; DB failures strictly return 500 (no silent success) so a corrupt learning signal can't be written.
- **Flows to / depends on:**
  - → Signal Memory (flowsTo) — logs actions
  - → spotify_event_match_corrections (flowsTo) — match corrections
  - → Shared Listening (flowsTo) — seed on going/fire
- **Fed by / required by:**
  - ← Event Board (flowsTo) — interaction events

### Identity & Taste

_Optional sign-in & personalization._

#### Auth.js  `int-authjs`

Optional sign-in backed by the Postgres adapter: email magic link (Resend, branded dark-mode email — lib/auth-email.ts) plus optional Spotify OAuth. One identity per person (PRD 44): the Spotify provider sets allowDangerousEmailAccountLinking — safe because BOTH doors verify email ownership — so matching emails converge on one account automatically; custom pages.signIn (/auth/signin, PRD 43) and pages.error keep every funnel state on product surfaces.

- **Kind:** Integration
- **Source of truth:** `auth.ts`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `NEXT_PUBLIC_AUTH_ENABLED`, `AUTH_SECRET`
- **Health probe:** `auth-provider` (PRD 07)
- **Implementation notes:**
  - _Note:_ Postgres adapter + database session strategy; the events.signIn callback runs migrateSessionSignalsToUser (best-effort, never blocks sign-in) and records each provider's email into user_emails.
  - _Runtime gotcha:_ getUserByEmail is wrapped (lib/auth-adapter.ts) for multi-email resolution, and the Spotify provider auto-links on a verified email match (PRD 44 — convergence proven in tests/one-identity.integration.mts). OAuthAccountNotLinked remains only for genuine edges (email mismatch), mapped to the duplicate_account recovery copy. Any NEW provider must re-justify the auto-link flag explicitly.
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
- **Implementation notes:**
  - _Note:_ Auth.js catch-all route handler ([...nextauth]) for sign-in / callback / session; no custom logic beyond the auth.ts config.
- **Flows to / depends on:**
  - → Auth.js (dependsOn)
- **Fed by / required by:**
  - ← Sign-In Chooser (dependsOn) — signIn (spotify/resend)

#### Listener Profile  `ui-listener-profile`

Sign-in, connected accounts, and the taste/discovery settings a listener controls.

- **Kind:** Surface
- **Source of truth:** `components/ListenerProfileButton.tsx`
- **Access:** public
- **Ownership:** manual
- **Implementation notes:**
  - _Note:_ Broadcasts preference changes via LISTENER_PREFERENCE_CHANGE_EVENT for instant re-ranking; the Spotify beta wall becomes Request-access → pending → retry (PRD 36).
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
- **Implementation notes:**
  - _Param mapping:_ Signed-out returns authenticated:false plus enabled feature flags (never tokens); signed-in returns identity + connection metadata with token values stripped.
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
- **Implementation notes:**
  - _Param mapping:_ Gated by requireUserId() (401 when anonymous); the acting user id comes from the session, never the body; body parsed with `.catch(() => null)`.
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
- **Implementation notes:**
  - _Param mapping:_ Gated by requireUserId() (401 when anonymous); the follower id is the session user, never the body; body parsed with `.catch(() => null)`.
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
- **Implementation notes:**
  - _Param mapping:_ Gated by requireUserId() (401/empty when anonymous); event ids bound as $2::text[], visibility resolved from the session user's circle — never anyone outside it.
- **Flows to / depends on:**
  - → Social Activity (Inner-Circle) (dependsOn) — your-people going/firing

#### Circle Share API  `api-circle-share`

Signed-in-only, idempotent, best-effort endpoint to share a show/song-list with your circle (PRD 24). Reuses existing going state; no Spotify write, no ranking change.

- **Kind:** Surface
- **Source of truth:** `app/api/me/circle-share/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Gated by requireUserId(); idempotent + best-effort, reuses existing going state (upsert with coalesce so an existing planning_at is kept), no Spotify write and no ranking change.
- **Flows to / depends on:**
  - → Social Activity (Inner-Circle) (dependsOn) — share with circle

#### Account Links API  `api-me-account-links`

Signed-in-only, self-scoped (PRD 35): returns the caller's linked sign-in providers (tokens stripped) and the emails associated with their one account. Backs the profile UI's "sign in with magic link AND Spotify, one account" view. Resolves the id from the session, never the body; 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/account-links/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Param mapping:_ Gated by requireUserId() (401 when anonymous); resolves the id from the session, never the body; returns linked providers with tokens stripped + the account's emails.
- **Flows to / depends on:**
  - → user_emails (dependsOn) — linked providers + emails

#### Spotify Access Request API  `api-me-spotify-access-request`

Signed-in-only listener plane (PRD 36): submit/refresh your OWN Spotify tester-slot access request (your Spotify email → `pending`) and read its status. Exactly one open request per user; the acting id comes from the session, never the body. The Spotify email is private to the listener + admin. Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/spotify-access-request/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Param mapping:_ Gated by requireUserId(); the acting id is the session user, never the body. One open request per user (partial unique); the Spotify email is private to the listener + admin.
- **Flows to / depends on:**
  - → spotify_access_requests (dependsOn) — submit + my status

#### Tester Request Capture API  `api-tester-requests`

Public, anonymous-accessible Spotify tester request capture (PRD 42 / Phase 17) — the applicants we most want to catch have no account yet. POST { email, note?, source? } upserts one row per email (re-applying never duplicates, never demotes a status) and fires the owner-notification email exactly once per genuine new interest, after the response. Honeypot + per-IP/per-email sliding-window rate limit.

- **Kind:** Surface
- **Source of truth:** `app/api/tester-requests/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Anonymous by design; `website` honeypot mirrors the community form; rate windows are per-warm-instance (pure logic in lib/tester-requests-core.ts). Owner notification via sendAdminNotificationEmail (ADMIN_NOTIFY_EMAIL, falls back to AUTH_EMAIL_FROM) inside next/server `after()` — never blocks the applicant's confirmation.
- **Flows to / depends on:**
  - → tester_requests (dependsOn) — upsert + owner notification
- **Fed by / required by:**
  - ← Spotify Access Request Page (dependsOn) — request form submit
  - ← Sign-In Chooser (dependsOn) — inline request form

#### Spotify Access Request Page  `ui-spotify-access-page`

Public /spotify-access page (PRD 42 / Phase 17): explains the invite-only Spotify beta in the product's voice, captures a tester request (email + optional taste note) through the capture API, and points at email sign-in as the always-works door. The landing spot for every 'Request Spotify access' affordance (the /auth/error beta notice; the PRD 43 sign-in chooser).

- **Kind:** Surface
- **Source of truth:** `app/spotify-access/page.tsx`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Anonymous-accessible; a signed-in visitor's email pre-fills. Renders in the auth-recovery shell so the dark route tokens apply (PRD 39 discipline).
- **Flows to / depends on:**
  - → Tester Request Capture API (dependsOn) — request form submit

#### Privacy Policy Page  `ui-privacy-page`

Public /privacy page (PRD 45 / Phase 17): plain-language, code-verified statement of data practices — email for magic links, read-only Spotify scopes with server-side tokens (PRD 27 leak-audit posture), per-listener activity rows, cookieless Umami analytics, no selling/ads/pay-to-play, contact + deletion path. A Spotify Extended Quota review prerequisite, linked from the site footer and /spotify-access. PRDs that change data practices must update it in the same cycle.

- **Kind:** Surface
- **Source of truth:** `app/privacy/page.tsx`
- **Access:** public
- **Ownership:** manual
- **Implementation notes:**
  - _Note:_ Static server component in the auth-recovery shell; every claim maps to a code path (scopes in auth.ts, disconnect/removal in lib/music.ts, analytics in app/layout.tsx). Dated; footer-linked site-wide.

#### Spotify Gate API  `api-spotify-gate`

The pre-redirect gate (PRD 43 / Phase 17): Spotify Development Mode 403s non-allowlisted users on Spotify's own domain, so the check runs BEFORE signIn('spotify'). GET returns chooser config (flags only, no DB); POST checks a stated/session email against BOTH request stores (tester_requests + spotify_access_requests, most-permissive-wins) → allowed | pending | declined | not_found | email_required. SPOTIFY_OPEN_ACCESS=true short-circuits to allowed with no store read.

- **Kind:** Surface
- **Source of truth:** `app/api/spotify-gate/route.ts`
- **Access:** public
- **Ownership:** automated
- **Env vars (names only):** `SPOTIFY_OPEN_ACCESS`
- **Implementation notes:**
  - _Note:_ Pure outcome matrix in lib/spotify-gate-core.ts (test:spotify-gate); reads via lib/spotify-gate.ts are 42P01-tolerant and degrade to the request path, never to an ungated redirect. Rate-limited per IP; outcomes reveal only beta-list membership.
- **Flows to / depends on:**
  - → tester_requests (dependsOn) — seat check (email loop)
  - → spotify_access_requests (dependsOn) — seat check (signed-in loop)
- **Fed by / required by:**
  - ← Sign-In Chooser (dependsOn) — pre-redirect gate + config

#### Sign-In Chooser  `ui-signin-chooser`

The three-door sign-in chooser (PRD 43 / Phase 17): Continue with Spotify (gated), sign in with email (always present), Request Spotify access (hidden under SPOTIFY_OPEN_ACCESS). One component, two shells — the in-page modal for action nudges and the custom pages.signIn full page (/auth/signin), so no funnel state shows NextAuth's unstyled default. The ONLY module allowed to call signIn('spotify') — guard-tested.

- **Kind:** Surface
- **Source of truth:** `components/SignInChooser.tsx`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Call sites route through useSignInChooser (modal) or SpotifyGateButton (Spotify-specific spots): SaveButton, FollowButton, EventBoard nudge, EmailSignInPanel, ListenerProfileButton, CuratorManagePanel, AuthRecovery retry, SpotifyAccessRequest retry, MusicAccountPanel. Each preserves its original callbackUrl (e.g. the EventBoard keep-intent param); an anonymous allowed email is remembered client-side so the one-field step happens once per browser.
- **Flows to / depends on:**
  - → Spotify Gate API (dependsOn) — pre-redirect gate + config
  - → Tester Request Capture API (dependsOn) — inline request form
  - → Auth API (dependsOn) — signIn (spotify/resend)

#### Curator Application API  `api-me-curator-application`

Signed-in-only listener plane (PRD 29): submit a self-authored curator application and read your OWN curator standing. Promoted instantly under the self-serve gate, else `pending` for admin review. The acting user id comes from the session, never the body; applications are private to the applicant + admin (never public, no pay-to-play). Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/curator-application/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Gated by requireUserId(); promoted instantly under the isSelfServeOpen gate (CURATOR_SELF_SERVE_GATE = 25 curators / 250 users), else `pending`. The acting id is the session user, never the body.
- **Flows to / depends on:**
  - → Curators (dependsOn) — apply + my status (self-serve)

#### Curator Recommendation API  `api-me-curator-recommendation`

Signed-in-only listener plane: nominate someone who should curate (free-text nominee + optional link/why). Distinct from the application API — here a listener recommends someone ELSE. The submitter id comes from the session, never the body; recommendations are private to submitter + admin (never public, no pay-to-play). Best-effort Resend admin notification on submit (never blocks the write). Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/curator-recommendation/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Gated by requireUserId(); the submitter id is the session user, never the body. Pure validation in lib/curator-recommendations-core.ts; the admin email (ADMIN_NOTIFY_EMAIL, falls back to AUTH_EMAIL_FROM) is fired best-effort and wrapped so a Resend failure can't fail the submit.
- **Flows to / depends on:**
  - → curator_recommendations (flowsTo) — stores recommendation

#### Curator Self-Management API  `api-me-curator`

Signed-in-only, self-scoped curator self-management (PRD 31): edit your OWN persona and add / show-hide / remove your OWN picks. The curator + pick ids are resolved from the session and checked in SQL, so a caller can never read or modify another curator. Admin moderation overrides — a non-active row is read-only here. Returns 401 when anonymous.

- **Kind:** Surface
- **Source of truth:** `app/api/me/curator/route.ts`
- **Access:** public
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Gated by requireUserId(); curator + pick ids are resolved from the session and re-checked in SQL ownership clauses, so a caller can never read or modify another curator. Admin moderation overrides.
- **Flows to / depends on:**
  - → Curators (dependsOn) — self-manage persona + picks

#### Saved Space  `ui-saved-space`

Signed-in-only /saved view with three private lists (events, venues, artists), inline un-save, and empty states. Anonymous visitors are redirected to sign-in.

- **Kind:** Surface
- **Source of truth:** `app/saved/page.tsx`
- **Access:** public
- **Ownership:** manual
- **Implementation notes:**
  - _Note:_ Signed-in-only; anonymous visitors are redirected to sign-in with a return path. Renders three private lists (events/venues/artists) with inline un-save.
- **Flows to / depends on:**
  - → Saved Items API (flowsTo) — inline un-save
- **Fed by / required by:**
  - ← Saved Items (flowsTo) — grouped saved lists

### Operations

_Jobs, admin, observability._

#### Admin Tester Requests API  `api-admin-tester-requests`

Admin-cookie-gated review of the anonymous tester-request queue (PRD 42 / Phase 17): list with the seat budget (distinct seated emails across both request stores vs. Spotify's 25-seat Development Mode cap), approve (sends the 'you're in' invite email; approved → invited once it sends), decline, re-open. Approval order is enforced by panel copy: allowlist in the Spotify dashboard FIRST.

- **Kind:** Surface
- **Source of truth:** `app/api/admin/tester-requests/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Admin-cookie-gated (ADMIN_SESSION_TOKEN). A failed invite send keeps the row `approved` (never rolls back) and the panel offers a resend; actions are verbs (approve/decline/reopen) so the email side effect stays server-side.
- **Flows to / depends on:**
  - → tester_requests (dependsOn) — queue + approve/invite
  - → spotify_access_requests (dependsOn) — seat count spans both stores

#### Admin Spotify Access API  `api-admin-spotify-access`

Admin-cookie-gated Spotify tester-slot review (PRD 36): list the open request queue with each listener's Spotify email and mark slot_added/approved/rejected after adding them in the Spotify Developer Dashboard (≤25 users / Extended Quota). The slot add is an external action this only tracks. Admin-only — no self-serve.

- **Kind:** Surface
- **Source of truth:** `app/api/admin/spotify-access/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Admin-cookie-gated (ADMIN_SESSION_TOKEN); the actual ≤25-slot add is an external Spotify Dashboard action this only tracks (status → slot_added/approved/rejected). No self-serve.
- **Flows to / depends on:**
  - → spotify_access_requests (dependsOn) — review queue + slot-added

#### Admin Curators API  `api-admin-curators`

Admin-cookie-gated curator management (PRD 25): promote/demote/hide curators, add/hide picks. Admin-only — no self-serve, no pay-to-play.

- **Kind:** Surface
- **Source of truth:** `app/api/admin/curators/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Implementation notes:**
  - _Note:_ Admin-cookie-gated (ADMIN_SESSION_TOKEN); promote/demote/hide + pick management. No self-serve, no pay-to-play.
- **Flows to / depends on:**
  - → Curators (dependsOn) — promote/hide + picks + review queue
  - → curator_recommendations (dependsOn) — recommendation review queue

#### AVLgo Sync (cron)  `job-avlgo-sync`

Daily scheduled refresh of events from the AVLgo feed (10:00 UTC).

- **Kind:** Scheduled job
- **Source of truth:** `app/api/sync/avlgo/route.ts`
- **Access:** internal
- **Ownership:** automated
- **Health probe:** `cron-avlgo-sync` (PRD 07)
- **Implementation notes:**
  - _Note:_ Scheduled 10:00 UTC; records a start + finish/failure row via recordJobRun. Supports an `?audit` query mode (searchParams) for a dry-run duplicate audit without persisting.
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
- **Implementation notes:**
  - _Note:_ Scheduled 11:00 UTC; records the run via recordJobRun. A failure returns 500 with success:false rather than throwing.
- **Flows to / depends on:**
  - → Vercel Blob (flowsTo) — delete stale images
  - → system_job_runs (flowsTo) — records outcome

#### Hero Image Backfill (manual)  `job-image-backfill`

Manual repair pass that re-ingests stored expiring Facebook CDN image URLs into Blob and clears dead ones to NULL (PRD 06).

- **Kind:** Scheduled job
- **Source of truth:** `app/api/sync/backfill-images/route.ts`
- **Access:** internal
- **Ownership:** manual
- **Implementation notes:**
  - _Note:_ Idempotent GET; scans rows with fbcdn image URLs, uploads still-live ones to Blob, nulls the rest so the initials fallback is intentional. Records the run via recordJobRun (job: image_backfill). Precedence rules live in lib/image-resilience.ts.
- **Flows to / depends on:**
  - → Vercel Blob (flowsTo) — re-ingest images
  - → system_job_runs (flowsTo) — records outcome

#### Vercel Blob  `int-blob`

Stores cached event images so cards stay fast and the upstream feed isn't hammered.

- **Kind:** Integration
- **Source of truth:** `lib/blob-storage.ts`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `BLOB_READ_WRITE_TOKEN`
- **Health probe:** `blob-storage` (PRD 07)
- **Implementation notes:**
  - _SQL fallback:_ Blob calls are wrapped in try/catch and degrade gracefully — a failed cache write or cleanup never breaks event rendering.
- **Fed by / required by:**
  - ← Event Ingestion (flowsTo) — cache images
  - ← Image Cleanup (cron) (flowsTo) — delete stale images
  - ← Hero Image Backfill (manual) (flowsTo) — re-ingest images

#### Umami Analytics  `int-umami`

Privacy-friendly web analytics. The tracking script runs on public pages; traffic/referrer/page stats are read back into the admin Analytics tab server-side via the Umami Cloud API.

- **Kind:** Integration
- **Source of truth:** `app/layout.tsx`
- **Access:** internal
- **Ownership:** automated
- **Env vars (names only):** `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
- **Health probe:** `umami` (PRD 07)
- **Reference:** https://umami.is
- **Implementation notes:**
  - _Runtime gotcha:_ The tracking script renders only when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set; the admin read-back uses the server-only UMAMI_API_KEY (never client-exposed) and degrades to 'not configured' when absent.
- **Flows to / depends on:**
  - → Admin Portal (flowsTo) — stats read back
  - → Homepage (dependsOn) — tracks usage

#### Admin Data Loader  `svc-admin-data`

Aggregates counts, completeness, gaps, and stats for the admin portal (read-only).

- **Kind:** Service
- **Source of truth:** `lib/admin-data.ts`
- **Access:** admin
- **Ownership:** automated
- **Implementation notes:**
  - _Runtime gotcha:_ Stewardship rollups bind window dates as $1::date and derive completeness via `count(*) filter (where ...)::int` (missing image/time, weak url, empty tags).
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
- **Implementation notes:**
  - _Note:_ Pure — no DB or server-only import — so the markdown generator and drift-guard test can run it without the app; each node's sourceOfTruth is drift-checked by test:registry.
- **Fed by / required by:**
  - ← Admin Portal (dependsOn) — renders graph

#### Admin Portal  `ui-admin`

Password-gated operating console: health, architecture, knowledge graph, stewardship, insight, analytics.

- **Kind:** Surface
- **Source of truth:** `components/AdminPortal.tsx`
- **Access:** admin
- **Ownership:** manual
- **Env vars (names only):** `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN`
- **Implementation notes:**
  - _Note:_ Gated by ADMIN_PASSWORD → an ADMIN_SESSION_TOKEN cookie; renders all admin tabs including this architecture graph.
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
- **Implementation notes:**
  - _Note:_ A static external link rendered in the EventBoard nav (no data flow); the first ecosystem-partner slot.
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
| Tester Request Capture API | → | tester_requests | dependsOn | upsert + owner notification |
| Spotify Access Request Page | → | Tester Request Capture API | dependsOn | request form submit |
| Admin Tester Requests API | → | tester_requests | dependsOn | queue + approve/invite |
| Admin Tester Requests API | → | spotify_access_requests | dependsOn | seat count spans both stores |
| Spotify Gate API | → | tester_requests | dependsOn | seat check (email loop) |
| Spotify Gate API | → | spotify_access_requests | dependsOn | seat check (signed-in loop) |
| Sign-In Chooser | → | Spotify Gate API | dependsOn | pre-redirect gate + config |
| Sign-In Chooser | → | Tester Request Capture API | dependsOn | inline request form |
| Sign-In Chooser | → | Auth API | dependsOn | signIn (spotify/resend) |
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
| Curator Recommendation API | → | curator_recommendations | flowsTo | stores recommendation |
| Admin Curators API | → | curator_recommendations | dependsOn | recommendation review queue |
| curator_recommendations | → | users | dependsOn | submitter (cascade) |
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
| Hero Image Backfill (manual) | → | Vercel Blob | flowsTo | re-ingest images |
| Hero Image Backfill (manual) | → | system_job_runs | flowsTo | records outcome |
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

_80 nodes, 108 edges. Regenerate with `npm run generate:system-map` after editing `lib/system-registry.ts`._
