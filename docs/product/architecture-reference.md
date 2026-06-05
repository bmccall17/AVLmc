# Architecture Reference

Updated: June 5, 2026

## App Shape

- Framework: Next.js App Router.
- Homepage: `app/page.tsx`.
- Event detail: `app/event/[id]/page.tsx`.
- Admin moderation: `app/admin/page.tsx`.
- Global styles: `app/globals.css`.

## Data Flow

### Events

- `lib/events.ts` reads upcoming events from Aiven Postgres.
- If the rolling window has no stored events, `lib/events.ts` fetches AVLgo's public JSON export and upserts normalized events into Aiven.
- Default query uses `dateFilter=custom`, today through 21 days out, and `tagsInclude=Live Music`.
- Events are normalized into `EventRecord`.
- Homepage and detail pages fall back to seed events only if Aiven has no matching records and AVLgo fetch fails.
- `/api/sync/avlgo` forces an AVLgo refresh/upsert and is scheduled daily in `vercel.json`.

### Discovery Board

- `components/EventBoard.tsx` handles client-side search, venue filter, tag filter, and sorting.
- Sort modes: soonest, hottest, most discussed, and venue.
- Homepage cards show songs, notes, going, and fire counts.
- The `AVLgo source` button opens AVLgo with the same Live Music rolling date window.

### Community

- `lib/community.ts` reads/writes Aiven Postgres.
- Production tables: `contributions` and `reactions`.
- Public contribution API: `/api/community/contributions`.
- Reaction API: `/api/community/reactions`.
- Event detail UI: `components/CommunityPanel.tsx`.
- Public pages only show `visible` contributions.

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

## Production Persistence

The app now uses Aiven Postgres for production persistence.

- `events`: normalized AVLgo event records.
- `contributions`: songs and notes with moderation `status`.
- `reactions`: anonymous session-based going/fire signals.
- `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN`, and `DATABASE_URL` are required in production.
- `AVLGO_API_URL` is optional and should usually be unset so the built-in AVLgo JSON export URL is used.

## Acceptance Coverage

- PRD 01: live 21-day AVLgo board, detail pages, source links, daily sync route.
- PRD 02: song recs, text notes, going/fire reactions, counts on homepage/detail, anonymous session IDs, spam controls.
- PRD 03: password-protected admin, recent contribution list, visible/hidden/pending filters, hide/unhide controls.
- PRD 04: deferred for production until an object-storage path is selected.
- PRD 05: `$0` deployment/auth decision memo in `docs/product/deployment-auth-investigation.md`, updated for Aiven.

## Known Follow-Up

Personalized discovery is intentionally future backlog:

- Connect Spotify, YouTube Music, or Apple Music only after privacy and auth are designed.
- Start with filters/sorts and explicit user preferences before importing listening history.
