# Deployment and Auth Investigation

Updated: June 6, 2026

## Recommendation

Launch the first public prototype lean and low-cost with:

- Hosting: Vercel Hobby for the Next.js app.
- Source control/deploys: GitHub repo connected to Vercel.
- Scheduled sync: Vercel Cron once daily at `/api/sync/avlgo`.
- Database: Aiven Free PostgreSQL for events, contributions, reactions, moderation state, Auth.js sessions, and optional music taste data.
- Storage: none for the first production release.
- Voice memos: deferred until an object-storage path is selected.
- Optional auth: anonymous public use remains default; Spotify sign-in is live for future personalized discovery.
- MVP auth now: server-issued anonymous sessions for public actions plus one admin password.

The deployed production path should use Aiven for persistent event/community data. Do not rely on local JSON or local file uploads on Vercel.

## Source Notes

- Vercel Hobby is the current `$0` hosting target for this personal prototype.
- Vercel Cron supports the daily AVLgo refresh cadence used by this app.
- Aiven Free PostgreSQL is the current `$0` database target.
- Aiven Free has no connection pooling and a low connection cap, so the app keeps a tiny Node Postgres pool and short queries.

## Cost Table

| Area | `$0` Choice | Free Fit | Upgrade Trigger |
| --- | --- | --- | --- |
| App hosting | Vercel Hobby | Good for a personal prototype Next.js app. | Commercial launch, traffic limits, team workflow, or paid observability. |
| Daily sync | Vercel Cron | Good because the app only needs once-daily AVLgo refresh. | More frequent or precise sync timing. |
| Database | Aiven Free PostgreSQL | Good for normalized event/community records with low early traffic. | Connection pressure, more storage, backups/branching needs, or sustained usage. |
| Audio storage | Deferred | Best fit for launch because voice memos are excluded. | Add Vercel Blob, S3, Cloudflare R2, or similar when audio returns. |
| Public auth | Optional Spotify | Anonymous remains default; Spotify can seed taste profiles when enabled. | Google/YouTube signals, Apple Music, saved preferences, stronger abuse controls. |
| Admin auth | Single password secret | Good enough for one trusted admin. | Multiple admins, audit logs, role-based moderation. |

## Auth Feasibility

| Auth Path | Feasible? | Notes |
| --- | --- | --- |
| Google | Yes, later | Useful for identity and limited YouTube account signals; not treated as YouTube Music listening history. |
| Plain email | Later fallback | Passwordless or password auth can be added if music-provider auth excludes too many users. |
| Spotify | Implemented as optional v1 | Uses Auth.js plus Spotify OAuth scopes for private profile, email, and top artists/tracks. |
| Apple identity | Yes, later | Separate from Apple Music library access. |
| Apple Music | Risky/defer | MusicKit/Apple Music API requires user permission plus Apple developer tokens/keys. |
| YouTube Music | Risky/defer | YouTube Data API does not expose watch history through normal API access. |
| AVLgo auth | Unknown/defer | No public auth integration is confirmed. Ask AVLgo directly before planning around it. |

## Decision

Keep the MVP anonymous by default. Use server-issued anonymous session cookies for reactions and rate limits, a honeypot for submissions, and one admin password for moderation. Enable Spotify sign-in only when personalized discovery needs real taste data.

## Production State

Live production URL: `https://avlmc.vercel.app/`.

Verified June 6, 2026:

- Commit `dcf9632` fixed the Spotify Auth.js provider configuration by preserving Spotify's authorize URL and passing the Spotify client credentials explicitly.
- `NEXT_PUBLIC_AUTH_ENABLED` and `AUTH_SPOTIFY_ENABLED` are enabled in Vercel production.
- Spotify OAuth reaches the provider, returns through `/api/auth/callback/spotify`, creates an Auth.js user/session, and records a Spotify music connection.
- `/api/me` remains anonymous by default for public visitors and returns authenticated account/music connection state only inside a signed-in session.
- Spotify profile sync via `/api/me/music-profile` stores 20 top artists and 20 top tracks for the signed-in test account.

Aiven tables:

- `events`: normalized AVLgo event records keyed by stable AVLgo-derived IDs.
- `users`, `accounts`, `sessions`, `verification_token`: Auth.js adapter-owned tables.
- `contributions`: song and comment rows with `status`, anonymous `session_id`, and nullable `user_id`.
- `reactions`: one row per event/session/reaction type, with nullable `user_id`.
- `music_connections` and `music_profile_items`: normalized provider connection and taste-profile data.

Operational notes:

- Aiven production initially had only `events`, `contributions`, and `reactions`; Auth.js callback failed with `relation "users" does not exist` until the schema was applied.
- Apply `db/schema.sql` before enabling auth on a fresh database.
- If `contributions` or `reactions` already exist before auth is added, also add nullable `user_id` columns and their indexes because `create table if not exists` will not alter existing tables.
- Keep OAuth access and refresh tokens server-only in Auth.js `accounts`. Do not expose token values through `/api/me`, music profile routes, or personalized discovery responses.
- Future schema work should be formalized as migrations before the next production database reset or environment clone.

Personalized discovery handoff:

- The first available taste signal is normalized Spotify `music_profile_items`, not raw Spotify API responses.
- `music_connections.last_synced_at` is the freshness indicator for discovery scoring.
- Phase 5 should build filters and ranking on top of existing anonymous event/community data plus optional Spotify profile rows.
- Google/YouTube and Apple Music remain later connectors; do not plan around YouTube Music listening history or Apple Music library access until provider setup is explicitly confirmed.

Voice memo storage:

- Deferred for first production release.
- No active upload route writes audio files.
- No playback surface is shown in the public event detail UI.

Environment variables:

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_TOKEN`
- `NEXT_PUBLIC_AUTH_ENABLED` optional, default `false`
- `AUTH_SECRET` required when auth is enabled in production
- `AUTH_SPOTIFY_ENABLED`, `AUTH_SPOTIFY_ID`, `AUTH_SPOTIFY_SECRET` for Spotify sign-in
- `AUTH_GOOGLE_YOUTUBE_ENABLED` and `AUTH_APPLE_MUSIC_ENABLED` reserved for later provider work
- `AVLGO_API_URL` optional override; usually leave unset.
