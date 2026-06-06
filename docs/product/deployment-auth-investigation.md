# Deployment and Auth Investigation

Updated: June 5, 2026

## Recommendation

Launch the first public prototype lean and low-cost with:

- Hosting: Vercel Hobby for the Next.js app.
- Source control/deploys: GitHub repo connected to Vercel.
- Scheduled sync: Vercel Cron once daily at `/api/sync/avlgo`.
- Database: Aiven Free PostgreSQL for events, contributions, reactions, and moderation state.
- Storage: none for the first production release.
- Voice memos: deferred until an object-storage path is selected.
- Optional auth: anonymous public use remains default; Spotify sign-in can be enabled for future personalized discovery.
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

Aiven tables:

- `events`: normalized AVLgo event records keyed by stable AVLgo-derived IDs.
- `users`, `accounts`, `sessions`, `verification_token`: Auth.js adapter-owned tables.
- `contributions`: song and comment rows with `status`, anonymous `session_id`, and nullable `user_id`.
- `reactions`: one row per event/session/reaction type, with nullable `user_id`.
- `music_connections` and `music_profile_items`: normalized provider connection and taste-profile data.

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
