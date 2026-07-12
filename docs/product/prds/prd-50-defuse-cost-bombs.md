# PRD 50: Defuse the Cost Bombs

Part of the [Cost Containment & Scale Readiness initiative](../cost-containment-prd.md) (Phase 20).
Cycle **C1** — governed by [ADR 003](../adrs/0003-authenticated-internal-endpoints-and-abuse-controls.md).
No dependencies — do this first. Every item is effort-S and independently shippable.

Updated: July 12, 2026 (shipped)

## Goal

**No request, actor, or bot can generate unbounded spend or burn Spotify quota independent of
legitimate traffic** — and if any metric trends toward a tier limit, we are alerted before it costs
money.

## Summary

The July 11 audit (epic Appendix A) found five traffic-independent cost surfaces: unauthenticated
`/api/sync/*` routes (two with `maxDuration = 300`), an open `/_next/image` optimization proxy
(`hostname: "**"`), unbounded Blob image ingest, uncapped sync jobs, and no spend/usage alerting.
A July 12 code re-audit confirmed all findings still live and added four refinements this PRD folds
in:

- `app/api/sync/artist-match/route.ts` lets the **caller** set the batch size via `?limit=`
  (default 100, cap 500) — each unit is live Spotify work.
- `backfill-images` and `artist-match` are **not in `vercel.json`'s cron list at all** — they exist
  only as publicly triggerable heavy endpoints (pure attack surface, no scheduled caller to protect).
- The board renders event posters with plain `<img>`, not `next/image`, so the open image proxy is
  **latent** (an attacker surface via `/_next/image?url=`, not an active quota drain) — still closed
  here, it is a one-line allow-list.
- `getEventById` (`lib/events.ts:178`) falls back to a **full `syncUpcomingEvents()` scrape on any
  unknown id** — so `/event/<bogus-id>` in a loop triggers repeated scrape/normalize/ingest work.
  The epic originally filed the render-path-sync removal under C2; it is **pulled forward into this
  cycle** because it is a single-actor cost lever exactly like the sync routes.

## Implementation Status

**Shipped.** (Jul 12, 2026; commit `d1577c1`.) Delivered:

- `lib/cron-auth.ts` — shared `assertCronRequest(request)` bearer gate (timing-safe compare,
  fails closed when `CRON_SECRET` is unset) applied to all four `/api/sync/*` handlers (`avlgo`,
  `cleanup`, `backfill-images`, `artist-match`); `artist-match`'s `?limit=` clamped to a
  server-side ceiling (500). `CRON_SECRET` set in Vercel Production + Preview **before** the gate
  landed, and mirrored in `.env.local`; Vercel injects the header on cron invocations.
- `next.config.mjs` — `/_next/image` `remotePatterns` wildcard (`**`) replaced with the four-host
  allow-list, verified against live prod `events.image_url` hosts on Jul 12, 2026 (nothing renders
  a remote host through `next/image` today, so the lock is purely defensive).
- `lib/image-ingest-guard.ts` (pure) + `lib/blob-storage.ts` — `ingestImageToBlob` is bounded:
  10s `AbortSignal.timeout`, `image/*` content-type required, 8 MB byte ceiling enforced
  mid-stream (a host lying about `content-length` is cut off). AVLgo feed fetch time-boxed (8s)
  into the existing seed fallback; sync image ingest chunked to 6 concurrent; `avlgo` + `cleanup`
  declare explicit `maxDuration = 300` / `runtime = "nodejs"`.
- Render paths never scrape (`lib/events.ts`): an empty board read serves `getSeedFallbackEvents`;
  an unknown event id is not-found. `syncUpcomingEvents` is cron-only, enforced by a source-scan
  guard (`tests/read-path-fallback.test.ts`, the `spotify-gate` pattern).
- New suites: `test:cron-auth` (7), `test:blob-guard` (9), `test:read-path` (3) — all green with
  typecheck, lint, registry, and build; touched files Snyk-clean. Registry job/integration nodes
  document the gate + bounds; system map regenerated; the epic carries the C1 build record and
  manual re-trigger recipe.

**Open owner remainder** (tracked in `backlog.md` → Urgent; needs a deploy + dashboards, not code):
the post-deploy smoke (401/200/400 curls + next-morning cron-log check) and enabling
**Vercel Spend Management** + **Neon usage alerts** with thresholds recorded in the epic.

## Requirements

### 1. Authenticate all `/api/sync/*` (ADR 003 §1)

- New shared helper `assertCronRequest(request)` in `lib/` requiring
  `Authorization: Bearer ${process.env.CRON_SECRET}`; otherwise the route returns **401**. Vercel
  injects this header on cron invocations when `CRON_SECRET` is set.
- Applied at the top of all four handlers: `avlgo`, `cleanup`, `backfill-images`, `artist-match`.
  One helper, no per-route re-implementation (the admin routes' three divergent auth checks are the
  anti-pattern to avoid).
- Set `CRON_SECRET` in Vercel (Production + Preview) **before** the gate deploys, so real crons keep
  running. Document the manual re-trigger (`curl -H "Authorization: Bearer …"`) in the epic.
- Clamp `artist-match`'s `?limit=` to a server-side ceiling (keep 500 as the documented max, but the
  bearer gate is the real control).

### 2. Close the open image proxy (ADR 003 §2)

- Replace `next.config.mjs` `remotePatterns: [{ hostname: "**" }]` with the explicit allow-list:
  `*.blob.vercel-storage.com`, `i.scdn.co`, `*.fbcdn.net`, `www.avlgo.com` — **verified against a
  live feed sample before locking** (epic open decision).

### 3. Bound all server-initiated fetches (ADR 003 §3)

- `ingestImageToBlob` (`lib/blob-storage.ts`): byte ceiling, `content-type` must start with
  `image/`, `AbortSignal.timeout` on the fetch. Guard logic extracted pure so it is testable
  without network.
- AVLgo feed fetch (`lib/events.ts:293`): `AbortSignal.timeout(8000)` routed into the existing seed
  fallback.
- Sync image-ingest concurrency chunked to ~6 (`lib/events.ts:391`).
- `avlgo` and `cleanup` declare `export const maxDuration = 300` + `runtime = "nodejs"` so duration
  is explicit, not accidental.

### 4. Kill the render-path scrape fallback (pulled forward from C2 / ADR 002 §2)

- `getUpcomingEvents` (`lib/events.ts:168`): on an empty DB read, serve seed/empty-state — never run
  `syncUpcomingEvents()` inline in a render.
- `getEventById` (`lib/events.ts:178`): an unknown id returns not-found — never a scrape. Ingest is
  the cron's job only.

### 5. Turn on the safety net (free, no code)

- Enable **Vercel Spend Management** (hard cap + email alert) and **Neon usage alerts**
  (compute-hours + storage). Record the chosen thresholds in the epic PRD when set.

## Non-Goals

- **No caching changes** — read-path caching, `force-dynamic` removal, and the Neon pooler swap are
  PRD 51 (C2).
- **No rate limiting of public writes, no bot rules, no CI** — PRD 52 (C3).
- **No listener-visible change** — the board payload and ranking are byte-for-byte identical.
- **Not the security track** — admin static-secret and DB TLS findings stay out of scope (epic
  posture).

## Testing

- New suite `tests/cron-auth.test.ts` (`test:cron-auth`): missing header → 401; wrong token → 401;
  correct bearer → passes.
- New suite `tests/blob-ingest-guard.test.ts`: oversized `content-length` rejected; non-`image/*`
  rejected; slow fetch aborts.
- Fallback regression: empty DB read → seed/empty-state, `syncUpcomingEvents` **not** invoked
  (spy); unknown event id → not-found, no scrape.
- Manual smoke (dated in the epic on completion): `curl -i https://avlmc.vercel.app/api/sync/cleanup`
  → **401**; with bearer → succeeds; real cron runs green the next morning (Vercel cron logs);
  `/_next/image?url=https://example.com/x.jpg` → **400**; a real event poster still optimizes.
- Regression: typecheck / lint clean; touched files Snyk-clean.

## Risks

- **`CRON_SECRET` unset in an environment 401s the legitimate cron.** Mitigated: set the env var
  before deploying the gate; next-morning cron-log check; documented manual re-trigger.
- **Over-tight image allow-list breaks real posters.** Mitigated: verify hosts against a live feed
  sample before locking; posters currently render via `<img>` (unaffected), so exposure is limited
  to any `next/image` adoption.
- **Removing the scrape fallback exposes an empty board if the DB is ever truly empty.** Accepted:
  seed/empty-state is the designed behavior; the daily cron repopulates; the Health tab's
  event-freshness probe already alerts on staleness.

## Acceptance Criteria

- All four sync routes return 401 without the bearer and run under cron with it.
- `/_next/image` refuses non-allow-listed hosts; real posters unaffected.
- Ingest is size/type/time/concurrency bounded; heavy jobs declare explicit duration.
- No render path can trigger `syncUpcomingEvents()`.
- Vercel Spend Management + Neon usage alerts live, thresholds recorded in the epic.
- `test:cron-auth` + blob-guard + fallback suites, typecheck, lint green; touched files Snyk-clean.
