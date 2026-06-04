# Deployment and Auth Investigation

Updated: June 3, 2026

## Recommendation

Launch the first public prototype at `$0` with:

- Hosting: Vercel Hobby for the Next.js app.
- Scheduled sync: Vercel Cron once daily at `/api/sync/avlgo`.
- Database: Supabase Free Postgres for events, contributions, reactions, and admin state when moving beyond local prototype storage.
- Storage: Supabase Free Storage for voice memos, capped well below the free-plan upload limit.
- Auth later: Supabase Auth, only after accounts unlock clear value.
- MVP auth now: anonymous public contributions plus one admin password.

The current code is playable locally with JSON/file storage. Before public deployment, migrate `lib/community.ts` from local files to Supabase tables/storage so contributions and voice memos persist across serverless deployments.

## Source Notes

- Vercel Hobby is a free tier for personal/non-commercial use; if limits are exceeded, usage may pause until the next period: <https://vercel.com/docs/plans/hobby>.
- Vercel Hobby Cron supports daily jobs only, which matches the roadmap daily AVLgo refresh: <https://vercel.com/docs/cron-jobs/usage-and-pricing>.
- Supabase Auth supports password, magic link, OTP, social login, and SSO, with providers including Apple, Google, and Spotify: <https://supabase.com/docs/guides/auth>.
- Supabase Free currently lists 500 MB database and 1 GB file storage on its pricing page: <https://supabase.com/pricing>.
- Supabase Storage Free file uploads cannot exceed 50 MB, far above this prototype's 3 MB voice memo cap: <https://supabase.com/docs/guides/storage/uploads/file-limits>.

## Cost Table

| Area | `$0` Choice | Free Fit | Upgrade Trigger |
| --- | --- | --- | --- |
| App hosting | Vercel Hobby | Good for a personal prototype Next.js app. | Commercial launch, traffic limits, team workflow, or paid observability. |
| Daily sync | Vercel Cron | Good because the app only needs once-daily AVLgo refresh. | More frequent or precise sync timing. |
| Database | Supabase Free Postgres | Good for normalized event/community records. | More than 500 MB DB, sustained high usage, backups/branching needs. |
| Audio storage | Supabase Free Storage | Good if voice memos stay short and capped. | More than 1 GB storage, bandwidth pressure, or larger files. |
| Public auth | None for MVP | Best friction/cost profile. | Personalization, history sync, abuse controls, saved preferences. |
| Admin auth | Single password secret | Good enough for one trusted admin. | Multiple admins, audit logs, role-based moderation. |

## Auth Feasibility

| Auth Path | Feasible? | Notes |
| --- | --- | --- |
| Google | Yes, later | Supported by Supabase Auth. Requires Google OAuth app configuration. |
| Plain email | Yes, later | Supabase Auth supports password, magic link, and OTP. Custom SMTP may become a cost/ops decision later. |
| Spotify | Yes, later | Supported by Supabase Auth and Spotify OAuth. Also useful for optional taste/persona features, but requires Spotify app setup and scopes. |
| Apple identity | Yes, later | Supabase supports Apple social login. This is different from Apple Music library access. |
| Apple Music | Risky/defer | MusicKit/Apple Music API can access music data with user permission, but Apple developer tokens and keys are required. Treat as a separate integration investigation. |
| YouTube Music | Risky/defer | YouTube Data API does not expose watch history through normal API access; use playlist import/manual preference capture before relying on listening history. |
| AVLgo auth | Unknown/defer | No public auth integration is confirmed. Ask AVLgo directly before planning around it. |

## Decision

Keep the MVP anonymous. Use session IDs for reactions, a honeypot plus rate limits for submissions, and one admin password for moderation. Add real accounts only when the product needs saved taste preferences, connected listening history, or stronger abuse controls.

## Production Migration Notes

Supabase tables needed before public deployment:

- `events`: normalized AVLgo event records keyed by stable AVLgo ID.
- `contributions`: song, comment, and voice rows with `status`.
- `reactions`: one row per event/session/reaction type.

Supabase storage bucket:

- `voice-memos`: private or public-read bucket with max upload size at or below 3 MB for this MVP.

Environment variables:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_TOKEN`
- `AVLGO_API_URL` optional override
- `NEXT_PUBLIC_SUPABASE_URL` later
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` later
- `SUPABASE_SERVICE_ROLE_KEY` later, server-only
