# Architecture Reference

Updated: June 3, 2026

## App Shape

- Framework: Next.js App Router.
- Homepage: `app/page.tsx`.
- Event detail: `app/event/[id]/page.tsx`.
- Admin moderation: `app/admin/page.tsx`.
- Global styles: `app/globals.css`.

## Data Flow

### Events

- `lib/events.ts` fetches AVLgo's public JSON export.
- Default query uses `dateFilter=custom`, today through 21 days out, and `tagsInclude=Live Music`.
- Events are normalized into `EventRecord`.
- Homepage and detail pages fall back to seed events if AVLgo fetch fails.
- `/api/sync/avlgo` returns the current normalized event set and is scheduled daily in `vercel.json`.

### Discovery Board

- `components/EventBoard.tsx` handles client-side search, venue filter, tag filter, and sorting.
- Sort modes: soonest, hottest, most discussed, and venue.
- Homepage cards show songs, notes, going, and fire counts.
- The `AVLgo source` button opens AVLgo with the same Live Music rolling date window.

### Community

- `lib/community.ts` is the current local JSON store.
- Local development store: `data/community.json`.
- Public contribution API: `/api/community/contributions`.
- Reaction API: `/api/community/reactions`.
- Event detail UI: `components/CommunityPanel.tsx`.
- Public pages only show `visible` contributions.

### Voice Memos

- Browser recording uses `MediaRecorder` when supported.
- Upload fallback accepts `audio/*`.
- API cap: 3 MB max file size.
- UI cap: 60 seconds max duration.
- Local development uploads save to `public/uploads/voice`.
- Public deployment should move audio storage to Supabase Storage before launch.

### Admin

- Admin page: `/admin`.
- Login route: `/api/admin/login`.
- Moderation route: `/api/admin/contributions`.
- Auth model: single password plus an opaque session token from environment.
- Required production env vars: `ADMIN_PASSWORD` and `ADMIN_SESSION_TOKEN`.

## Current Local Store

The local JSON/file store is useful for the playable prototype but should not be treated as production persistence on serverless hosting.

Production `$0` migration target:

- Supabase Postgres for contributions and reactions.
- Supabase Storage for voice memo files.
- Keep the public UI and API contracts stable while swapping the persistence layer.

## Acceptance Coverage

- PRD 01: live 21-day AVLgo board, detail pages, source links, daily sync route.
- PRD 02: song recs, text notes, going/fire reactions, counts on homepage/detail, anonymous session IDs, spam controls.
- PRD 03: password-protected admin, recent contribution list, visible/hidden/pending filters, hide/unhide controls.
- PRD 04: 60-second voice memo UX, upload fallback, playback, admin moderation.
- PRD 05: `$0` deployment/auth decision memo in `docs/product/deployment-auth-investigation.md`.

## Known Follow-Up

Personalized discovery is intentionally future backlog:

- Connect Spotify, YouTube Music, or Apple Music only after privacy and auth are designed.
- Start with filters/sorts and explicit user preferences before importing listening history.
