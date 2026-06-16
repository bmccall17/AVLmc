# Architecture Reference

Updated: June 6, 2026

## App Shape

- Framework: Next.js App Router.
- Homepage: `app/page.tsx`.
- Event detail: `app/event/[id]/page.tsx`.
- Admin moderation: `app/admin/page.tsx`.
- Global styles: `app/globals.css`.

## Data Flow

### Events

- `lib/events.ts` reads upcoming events from Neon Postgres.
- If the rolling window has no stored events, `lib/events.ts` fetches AVLgo's public JSON export and upserts normalized events into Neon.
- Default query uses `dateFilter=custom`, today through 21 days out, and `tagsInclude=Live Music`.
- Events are normalized into `EventRecord`.
- Homepage and detail pages fall back to seed events only if Neon has no matching records and AVLgo fetch fails.
- `/api/sync/avlgo` forces an AVLgo refresh/upsert and is scheduled daily in `vercel.json`.

### Discovery Board

- `lib/discovery.ts` scores events for anonymous Best Bets and optional Spotify-backed Best Match using public event/community signals plus normalized Spotify profile rows.
- `lib/discovery-memory.ts` records per-person discovery state and recent interaction signals used by scoring.
- `components/EventBoard.tsx` handles client-side search, ranked venue/tag chips, intent chips, long-tail venue/tag selects, and sorting.
- Sort modes: Best Bets, Best Match when Spotify taste rows are available, soonest, hottest, most discussed, and venue.
- Homepage cards show short recommendation reasons without exposing private profile item names.
- Homepage cards can record impressions, planning, fire, remove, and AVLgo-click learning actions through `/api/discovery/event-action`.
- Homepage cards show songs, notes, going, and fire counts.
- The `AVLgo source` button opens AVLgo with the same Live Music rolling date window.
- Hidden design sandbox: `/sandbox/discovery-actions`, unlinked and noindex.

### Community

- `lib/community.ts` reads/writes Neon Postgres.
- Production tables: `contributions` and `reactions`.
- Public contribution API: `/api/community/contributions`.
- Reaction API: `/api/community/reactions`.
- Event detail UI: `components/CommunityPanel.tsx`.
- Public pages only show `visible` contributions.
- Public actions use a server-issued HTTP-only `avl_anonymous_session` cookie; client-provided `sessionId` values are deprecated and ignored.
- Signed-in users are optional and stored as nullable `user_id` links on contributions and reactions.

### Optional Music Auth

- Auth route: `/api/auth/*`, backed by Auth.js and the Neon Postgres adapter tables.
- Account status route: `/api/me`.
- Music connection route: `/api/me/music-connections`.
- Music profile route: `/api/me/music-profile`.
- Spotify track search route: `/api/me/spotify-tracks`.
- Homepage account surface: `components/MusicAccountPanel.tsx`.
- Spotify is the first implemented provider and syncs normalized top artists/tracks into `music_profile_items`.
- Signed-in Spotify users can pause/resume Best Match, delete Spotify profile/token data, and search Spotify tracks for song recommendations.
- Live Spotify verification completed June 6, 2026 on `https://avlmc.vercel.app/`: callback succeeds, `/api/me` returns the signed-in user and Spotify connection, and profile sync stores 20 top artists plus 20 top tracks.
- Spotify scopes currently requested: `user-read-private`, `user-read-email`, and `user-top-read`.
- Spotify concert-event save/write support is not treated as available in v1; the shared intent bridge stores AVLmc, Spotify-attributed, and ticket-click signals in AVLmc instead of promising true Spotify event sync.
- Google/YouTube and Apple Music flags are reserved for later connector work and do not currently create music profiles.

### Voice Memos

- Deferred for the first production release.
- No voice memo form, upload path, local file writes, storage bucket, or playback surface is active.
- The database schema keeps nullable audio fields for a later storage-backed release.

### Admin

- Admin page: `/admin`.
- Login route: `/api/admin/login`.
- Moderation route: `/api/admin/contributions`.
- Auth model: single password plus an opaque session token from environment.
- Required production env vars: `ADMIN_PASSWORD` and `ADMIN_SESSION_TOKEN`.
- Production no longer falls back to local admin secrets.

## Production Persistence

The app now uses Neon Postgres for production persistence.

- `events`: normalized AVLgo event records.
- `users`, `accounts`, `sessions`, `verification_token`: Auth.js-managed account/session data.
- `contributions`: songs and notes with moderation `status`, anonymous `session_id`, optional `user_id`, and optional music-provider metadata for linked tracks.
- `reactions`: anonymous session-based going/fire signals with optional `user_id`.
- `event_intents`: shared saved/thinking-of-going intent rows keyed by event plus signed-in user or anonymous session, with source values `avlmc`, `spotify`, and `ticket_click`.
- `event_interaction_events`: append-only per-person discovery learning stream for homepage impressions, detail opens, AVLgo clicks, planning, fire, remove, undo remove, and contribution actions.
- `event_person_event_state`: current per-person event state for fire, planning, and removed listings.
- `music_connections` and `music_profile_items`: optional provider connection state, `taste_opt_out_at`, and normalized taste data.
- OAuth provider tokens are stored server-side in `accounts`; public/profile APIs must not return token values.
- `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN`, and `DATABASE_URL` are required in production.
- `NEXT_PUBLIC_AUTH_ENABLED=false` keeps optional auth hidden.
- `AUTH_SECRET`, `AUTH_SPOTIFY_ENABLED`, `AUTH_SPOTIFY_ID`, and `AUTH_SPOTIFY_SECRET` are required to enable Spotify sign-in.
- `AVLGO_API_URL` is optional and should usually be unset so the built-in AVLgo JSON export URL is used.

Schema setup note:

- Production auth requires the Auth.js tables and music tables from `db/schema.sql`.
- If community tables already exist before auth is introduced, add nullable `user_id` columns and `contributions_user_id_idx` / `reactions_user_id_idx` after the Auth.js `users` table exists.
- Personalized discovery adds `music_connections.taste_opt_out_at` and optional contribution metadata columns: `music_provider`, `music_provider_item_id`, and `music_provider_url`.
- Shared event intent adds `event_intents` and backfills existing `going` reactions as `avlmc` source rows.
- Personalized discovery V2 adds `event_interaction_events` and `event_person_event_state`.

## Acceptance Coverage

- PRD 01: live 21-day AVLgo board, detail pages, source links, daily sync route.
- PRD 02: song recs, text notes, going/fire reactions, counts on homepage/detail, anonymous session IDs, spam controls.
- PRD 03: password-protected admin, recent contribution list, visible/hidden/pending filters, hide/unhide controls.
- PRD 04: deferred for production until an object-storage path is selected.
- PRD 05: `$0` deployment/auth decision memo in `docs/product/deployment-auth-investigation.md`, updated for Neon.
- Phase 5: anonymous Best Bets, Spotify-backed Best Match, ranked filters, recommendation reasons, privacy controls, and Spotify-linked song selection.
- Phase 6: per-person learning actions, hidden card-action sandbox, removed-event memory, and account-plus-cookie discovery state.

## Known Follow-Up

Personalized discovery is intentionally incremental:

- Spotify sign-in now provides a first optional taste-profile and provider-linking path.
- Add Google/YouTube and Apple Music only after provider-specific privacy and API constraints are confirmed.
- Add explicit saved venue/tag preferences only after the first score/filter UX proves useful.
