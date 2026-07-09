# PRD 07: System Health & Connection Visibility

Part of the [Admin Portal Initiative](../admin-portal-prd.md). Cycle **C2**. Satisfies desired outcome **4 (System Health and Connection Visibility)**.

## Summary

Give the portal a true operational health view: whether the database, the AVLgo feed, the auth providers, the Spotify integration, the scheduled sync/cleanup jobs, blob storage, and Umami are connected and behaving — plus visibility into stale data, broken connections, and configuration conflicts. Today's `systemStatus` only reports whether env vars are *present*; this cycle makes the portal report whether things actually *work*.

Health is attached to the System Registry nodes from [PRD 06](prd-06-admin-portal-platform-and-architecture.md), so the same architecture map can show, per node, "connected / degraded / down / stale / misconfigured."

## Implementation Status

**Shipped.** Delivered:

- `lib/admin/health.ts` — `loadSystemHealth()` runs ten cheap, time-boxed, individually-degrading probes in parallel (`Promise.allSettled`), briefly cached (20s): database (`select 1` + latency), database schema drift (below), event-data freshness/empty-window, AVLgo feed reachability (status-only, body discarded), auth provider config consistency, Spotify (config conflict + 30-day profile staleness, metadata only), both cron jobs, blob storage, and Umami. Each probe returns `{ id, label, status, severity, detail, checkedAt, latencyMs? }`; one failure never breaks the page.
- Schema-drift probe (added Jul 9, 2026 after prod drift made the sharing/visibility preferences silently fail to save): `lib/admin/schema-drift.ts` parses the declared schema out of `db/schema.sql` itself (create-table bodies + `add column if not exists` migrations — no hand-kept manifest to drift) and diffs it against `information_schema` at runtime. Anything the live database is missing renders critical/misconfigured with the exact `table.column` list and the psql remediation. This surfaces the failure mode the store layers deliberately tolerate — their 42703 fallbacks keep saves "working" while dropping fields. `db/schema.sql` is traced into the `/admin` bundle via `outputFileTracingIncludes` in `next.config.mjs`.
- Cron observability: `system_job_runs` table (in `db/schema.sql` + `db/migrate-missing-tables.sql`), `lib/admin/job-runs.ts` (`recordJobRun` / `getRecentJobRuns`, both graceful), and recording wired into `/api/sync/avlgo` and `/api/sync/cleanup` (success and failure). The Health view shows last run/success next to the configured `vercel.json` schedule.
- Config-conflict detection (env *names* only): Spotify enabled without `AUTH_SPOTIFY_ID`/`AUTH_SPOTIFY_SECRET`; auth enabled without `AUTH_SECRET` or any provider.
- `components/admin/HealthSection.tsx` — a new **Health** tab with a severity-ranked "Needs Attention" list, a per-dependency status grid, and scheduled-job history; a calm all-green state. Health badges are overlaid on the PRD 06 architecture-graph nodes (via `healthProbeId`) and shown in the shared node-detail panel.

Probe ids map to the System Registry `healthProbeId` fields reserved in PRD 06. Original brownfield baseline (now superseded): `getSystemStatus()` only reported env-var presence — a config check, not a liveness check.

## Goals

- Report live, time-boxed health for each critical dependency, not just config presence.
- Detect and surface staleness (last successful sync, last event ingested, soon-to-expire OAuth tokens).
- Detect configuration conflicts (missing/contradictory env vars for an enabled feature).
- Surface scheduled-job outcomes (did the daily AVLgo sync and cleanup run, and succeed?).
- Present a single, severity-ranked "needs attention" surface, with drill-down per dependency.
- Attach status to the PRD 06 architecture graph so health is visible in context.

## Non-Goals

- No external uptime monitoring service or paid APM (stay $0; checks run in-app, on demand/cached).
- No paging/alerting/notifications in this cycle (a later follow-up may add a digest).
- No historical time-series of health (point-in-time status now; trend lines are a follow-up).
- No automatic remediation; the portal reports, the operator acts.

## Requirements

### Health Probes (`lib/admin/health.ts`)

Provide cheap, time-boxed, individually-failing probes for:

- **Database (Neon Postgres):** a trivial `select 1` round-trip with latency; classify `connected` / `slow` / `down`.
- **AVLgo feed:** reachability of the configured feed source (`getAvlgoFeedSource()`), distinguishing the built-in export from a custom `AVLGO_API_URL`, without forcing a full ingest.
- **Auth providers:** whether Auth.js is enabled and, when Spotify is enabled, whether the required `AUTH_SECRET` / `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET` are configured and internally consistent.
- **Spotify integration:** presence of active `music_connections` and whether stored access tokens are expired/near-expiry (token *expiry metadata* only — never token values), so "Spotify connected but all tokens stale" is visible.
- **Scheduled jobs:** last-run/last-success visibility for `/api/sync/avlgo` and `/api/sync/cleanup` (see Cron Observability).
- **Blob storage:** configuration/availability check for Vercel Blob (used by voice memos, currently deferred) reported as `configured` / `not configured` rather than failing.
- **Umami:** whether `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set and the script is wired (deeper API health belongs to [PRD 11](prd-11-product-analytics-umami.md)).

Each probe returns `{ status, severity, detail, checkedAt, latencyMs? }`. Probes must be parallel, individually wrapped so one failure cannot break the page, and **briefly cached** (short TTL) so refreshes don't hammer providers.

### Staleness Detection

- **Event data freshness:** newest `events.updated_at` / most recent ingest vs. expected daily cadence; flag if the rolling window is empty or the last refresh is older than expected.
- **Sync freshness:** time since the last successful `/api/sync/avlgo`.
- **Token freshness:** count of `music_connections` whose tokens are expired/near-expiry.
- **Profile freshness:** `music_connections.last_synced_at` age for connected users.

### Cron Observability

- Record the outcome of `/api/sync/avlgo` and `/api/sync/cleanup` runs (start, finish, success/failure, items processed) so the portal can show "last run / last success / last error." Proposed lightweight store: a small `system_job_runs` table (append-only) or reuse of an existing log surface — chosen to stay within $0 and Neon free-tier limits.
- Show the configured schedule (from `vercel.json`: AVLgo `0 10 * * *`, cleanup `0 11 * * *`) next to actual last-run data so "scheduled but not running" is detectable.

### Configuration Conflict Detection

- Flag features that are half-configured: e.g., `AUTH_SPOTIFY_ENABLED` true but a Spotify secret missing; `NEXT_PUBLIC_AUTH_ENABLED` true with no provider configured; Umami ID set but script disabled.
- Surface required-but-missing env *names* (never values) per enabled feature, reusing the registry's `envVars` metadata from PRD 06.

### Health Surface (`components/admin/HealthSection.tsx`)

- A dedicated Health view (new tab or Overview module) with a severity-ranked "Needs Attention" list at top and a per-dependency status grid below.
- Each item drills down to its `detail`, `checkedAt`, and remediation hint.
- The PRD 06 architecture graph nodes show a status badge sourced from the same probes, so health is legible in context.
- Clear, non-alarming empty/healthy state when everything is green.

## Dependencies

- [PRD 06](prd-06-admin-portal-platform-and-architecture.md) System Registry (for node→probe attachment and `envVars` metadata).
- Existing `lib/events.ts` feed helpers (`getAvlgoFeedSource`, `isUsingCustomAvlgoFeed`), `lib/db.ts`, `lib/auth-flags.ts`.
- Cron endpoints `/api/sync/avlgo`, `/api/sync/cleanup` and `vercel.json` schedule.

## Risks

- **Probes adding latency or cost** to the admin page — mitigated by time-boxing, parallelism, and short-TTL caching.
- **Rate-limiting / side effects** from probing external providers — mitigated by reachability-only checks (no full ingest, no token refresh) and caching.
- **Cron observability storage** could grow — mitigated by append-only with retention/pruning (reuse the cleanup job) within Neon free-tier limits.
- **False positives** (e.g., transient feed blip shown as "down") — mitigated by severity levels and short retries within the time box.

## Acceptance Criteria

- The Health view shows live status for database, AVLgo feed, auth/Spotify, scheduled jobs, blob storage, and Umami — each with status, severity, and a timestamp.
- Staleness is detectable: an empty rolling window, an overdue sync, and expired Spotify tokens each surface as attention items.
- The last run and last success of both cron jobs are visible alongside their configured schedule.
- At least one configuration conflict (e.g., Spotify enabled without a secret) is detected and surfaced by env *name*, never value.
- Architecture-graph nodes display a status badge consistent with the Health view.
- One failing probe never breaks the admin page; the rest still render.
- No probe exposes a token value or env value; new code passes a Snyk scan; everything runs at $0.

## Test Scenarios

- With a valid `DATABASE_URL`, the DB probe reports `connected` with a latency; with a broken URL, it reports `down` and the page still loads.
- Point `AVLGO_API_URL` at an unreachable host → feed probe reports degraded/down without forcing an ingest.
- Empty the rolling window → "stale event data / sync overdue" attention item appears.
- Mark a `music_connections` token as expired → Spotify staleness item appears with a count and no token value shown.
- Run `/api/sync/avlgo` → its last-run/last-success updates in the Health view.
- Enable Spotify but remove its secret → a config-conflict item lists the missing env *name*.
- All green → Health view shows a calm healthy state with no false attention items.
