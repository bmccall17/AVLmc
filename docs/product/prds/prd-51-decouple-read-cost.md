# PRD 51: Decouple Read Cost from Traffic

Part of the [Cost Containment & Scale Readiness initiative](../cost-containment-prd.md) (Phase 20).
Cycle **C2** — governed by [ADR 002](../adrs/0002-decouple-read-cost-from-traffic.md).
Depends on **PRD 50 (C1)**: the abuse surfaces must be closed first so they don't pollute cache-hit
metrics, and the render-path scrape fallback (pulled into C1) must already be gone.

Updated: July 12, 2026

## Goal

**Cost tracks how often event content changes (≈ once/day via the cron), not how many people look
at it.** 10× the traffic ≈ flat Neon compute and roughly flat Vercel invocations, with zero
listener-visible change.

## Summary

Every public page is `force-dynamic` and nothing in `app/` or `lib/` uses `unstable_cache` /
`revalidate` / `revalidateTag` (verified July 11 + re-verified July 12: 47 `force-dynamic`
occurrences; the only `Cache-Control` header in the app is a `no-store` on the admin design
sandbox). The July 12 re-audit measured the anonymous board at **one function invocation plus a
~15-call DB fan-out per view** (`app/page.tsx:82–102`: community counts, music profile, discovery
states/signals, saved keys, shared songs, circle activity, curators, top-30, artist track counts…)
against a `max: 1` connection pool (`lib/db.ts`), whose stale "Aiven/PgBouncer" comment indicates
the Neon **pooled** endpoint was never wired after the June migration. The steady trickle of
uncached reads also keeps Neon compute awake, defeating scale-to-zero.

The July 12 audit adds one requirement beyond ADR 002: the board serializes the full events array
**plus all ~15 per-event signal maps** into the RSC/HTML payload on every render — the anonymous
(cacheable) payload and the signed-in personalization maps must be split for the static shell to
work and to stop payload egress scaling with event volume × signal maps.

## Implementation Status

**Built (Jul 12, 2026) — owner verification pass pending.** Delivered:

- **Cached event reads** — `lib/event-read-cache.ts` (pure wiring: day-keyed reads + per-view
  started-events filter so output matches the uncached query) injected with `unstable_cache` in
  `lib/events.ts`; tag `events`, daily backstop. `/api/sync/avlgo` calls `revalidateEventReads()`
  after a successful upsert (both modes, plus the artist-match hook, `backfill-images`, and the
  `artist-match` route for their slices) — freshness is event-driven, the timer is a backstop.
- **Cached public payloads** — `lib/board-data.ts`: `getPublicBoardSignals` (counts, shared-song
  summaries, curated-by, track counts — one shared entry for the board) and `getPublicEventContext`
  (community, shared songs, curated-by, artist match — one entry per event), tag `event-signals`
  (+`events`), hourly backstop. All ten community/curator/shared-song write routes revalidate the
  tag on a successful write via `lib/event-signals-cache.ts`, so counts move on the write itself.
- **Payload split** — viewer-scoped reads stay per-request and short-circuit to empty with no
  session identity: a cookieless anonymous view (bots, first-time visitors — the traffic that
  scales) costs **zero DB queries**. `force-dynamic` is retained by design: anonymous session
  tuning is server-rendered (Phase 14), so the pages are inherently per-request — see the
  July 12 build amendment in ADR 002 for the full rationale and the deferred CDN-static follow-up.
- **Neon pooled + scale-to-zero** — Vercel `DATABASE_URL` (Production + Preview) now points at the
  `-pooler` endpoint, validated first against the live DB with the app's exact pool settings
  (select/tx/parameterized reads); `DATABASE_URL_UNPOOLED` added for migrations and preferred by
  `npm run db:apply`; stale Aiven/PgBouncer comment in `lib/db.ts` replaced. Branch autosuspend
  confirmed at the 5-minute plan default — with cached reads, idle windows now actually occur.
- **Image optimization trimmed** — `minimumCacheTTL` 31 days; `deviceSizes`/`imageSizes` pruned to
  what the app renders (rides PRD 50's host allow-list).
- **Tests** — `test:events-cache` (8): once-per-key, tag-invalidation re-query, the freshness
  regression (feed change appears after revalidate — and only then), by-id caching, the per-view
  filter, plus a source-scan that every signal write route revalidates and the read path routes
  through the cache. All suites, typecheck, lint, build, readability smoke (18) green; touched
  files Snyk-clean.

**Remaining (owner, dated in the epic when done):** the PRD's verification pass — on a preview
deploy, `/` twice → no event DB queries on the second load (Vercel logs); Neon compute shows an
idle/suspended window during a no-traffic gap.

## Requirements

### 1. Cache event reads, invalidate on write (ADR 002 §1)

- Wrap `getUpcomingEvents` and `getEventById` (`lib/events.ts`) in `unstable_cache` with a daily
  `revalidate` ceiling and shared cache tag `events`.
- `/api/sync/avlgo`, after a **successful** upsert, calls `revalidateTag('events')` — fresh feed
  data appears immediately after the cron and only then. The daily `revalidate` is a backstop, not
  the freshness mechanism. Never serve stale rows past a real update.
- Decision stands (epic open decision): `unstable_cache` + `revalidateTag` on the pinned Next 15.5,
  not Cache Components — revisit at the next Next upgrade.

### 2. Static shell + dynamic islands (ADR 002 §3)

- Remove `force-dynamic` from `app/page.tsx` and `app/event/[id]/page.tsx`; server-render board and
  detail from the cached read.
- **Split the payload:** the anonymous payload (events + public counts + public signals) is served
  from the cached render; the signed-in personalization maps (discovery states, preference signals,
  implicit signals, saved keys, circle activity, followed-curator picks, music profile) move behind
  the session check — fetched only for signed-in viewers, never serialized into the anonymous
  shell. The anonymous payload stays byte-for-byte equivalent in rendered output.
- Keep `"use client"` / per-request dynamism only around genuinely personalized fragments.

### 3. Neon pooled, scale-to-zero (ADR 002 §4)

- Point `DATABASE_URL` at the Neon `-pooler` endpoint for the app; keep the **direct** endpoint for
  `db:apply` (migrations need a session).
- Delete the stale Aiven/PgBouncer comment in `lib/db.ts`; re-validate `max`/idle settings for a
  pooled endpoint; confirm the branch autosuspends aggressively when idle.
- Validate on a Neon preview branch before prod (connection semantics differ under `pg`).

### 4. Trim image optimization (ADR 002 §5, rides PRD 50's allow-list)

- Raise `images.minimumCacheTTL`; prune `deviceSizes`/`imageSizes` to what the board/detail actually
  render, so each poster is transformed ~once, not per-viewer-per-viewport. (Currently only local
  static assets flow through `next/image` — this locks the cost shape in before any poster
  migration to `next/image`.)

## Non-Goals

- **No ranking or payload-content change** — the anonymous board output is identical; only *when*
  it is computed and *what* ships to whom changes.
- **No new cache service/CDN layer** — framework-native caching only (ADR 002 rejected
  alternatives).
- **No rate limiting / bot rules / CI** — PRD 52 (C3).

## Testing

- New suite `tests/events-cache.test.ts`: underlying query fn invoked **once** across two reads
  (spy — no live DB, honoring the no-local-`DATABASE_URL` constraint); `revalidateTag('events')`
  forces a re-query.
- **Freshness regression (the load-bearing gate):** a simulated feed change + cron `revalidateTag`
  makes the new event appear; without the revalidate, the old set persists — proving neither stale
  data nor cache-busting on every read.
- Payload-split regression: the anonymous render contains no signed-in personalization maps
  (assert on the serialized props/HTML); a signed-in render still receives them.
- `test:registry` green (regenerate the system map if any node's notes change);
  readability smoke (`playwright.smoke.config.ts`) green against the now-static board.
- **Verification pass (owner, dated in the epic):** on a preview deploy, load `/` twice → Vercel
  logs show no event DB queries on the second load (cache hit); Neon shows an idle/suspended
  compute window during a no-traffic gap. This is the epic's core proof.

## Risks

- **Stale events from over-caching.** Mitigated: event-driven `revalidateTag` from the cron with a
  daily ceiling backstop; the freshness regression is a hard gate.
- **Pooler swap changes `pg` connection semantics.** Mitigated: preview-branch validation first;
  direct endpoint retained for migrations.
- **Payload split accidentally changes the anonymous board.** Mitigated: byte-equivalence smoke on
  the rendered anonymous output; the split moves *who fetches*, not *what renders*.
- **`unstable_cache` API churn on a future Next upgrade.** Accepted: wrapped reads are localized to
  `lib/events.ts`, cheap to migrate to Cache Components later.

## Acceptance Criteria

- Repeated anonymous page loads serve from cache with no per-view event DB query (verified in
  Vercel logs on a preview deploy).
- A cron re-ingest is visible within one revalidation and no staler.
- Neon compute idles between traffic bursts on the pooled endpoint.
- Anonymous payload carries no personalization maps; signed-in behavior unchanged.
- Listener-visible output unchanged (smoke green); all named suites + typecheck + lint green;
  touched files Snyk-clean.
