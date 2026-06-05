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
- Auth later: real accounts only after saved preferences or stronger abuse controls are clearly needed.
- MVP auth now: anonymous public contributions plus one admin password.

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
| Public auth | None for MVP | Best friction/cost profile. | Personalization, history sync, abuse controls, saved preferences. |
| Admin auth | Single password secret | Good enough for one trusted admin. | Multiple admins, audit logs, role-based moderation. |

## Auth Feasibility

| Auth Path | Feasible? | Notes |
| --- | --- | --- |
| Google | Yes, later | Requires an OAuth app and an auth provider decision. |
| Plain email | Yes, later | Passwordless or password auth can be added after accounts create clear value. |
| Spotify | Yes, later | Useful for optional taste/persona features, but requires Spotify app setup and scopes. |
| Apple identity | Yes, later | Separate from Apple Music library access. |
| Apple Music | Risky/defer | MusicKit/Apple Music API requires user permission plus Apple developer tokens/keys. |
| YouTube Music | Risky/defer | YouTube Data API does not expose watch history through normal API access. |
| AVLgo auth | Unknown/defer | No public auth integration is confirmed. Ask AVLgo directly before planning around it. |

## Decision

Keep the MVP anonymous. Use session IDs for reactions, a honeypot plus rate limits for submissions, and one admin password for moderation. Add real accounts only when the product needs saved taste preferences, connected listening history, or stronger abuse controls.

## Production State

Aiven tables:

- `events`: normalized AVLgo event records keyed by stable AVLgo-derived IDs.
- `contributions`: song and comment rows with `status` for admin moderation.
- `reactions`: one row per event/session/reaction type.

Voice memo storage:

- Deferred for first production release.
- No active upload route writes audio files.
- No playback surface is shown in the public event detail UI.

Environment variables:

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_TOKEN`
- `AVLGO_API_URL` optional override; usually leave unset.
