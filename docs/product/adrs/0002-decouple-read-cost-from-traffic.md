# ADR 002: Decouple Read Cost from Traffic (Cached Reads + Pooled Scale-to-Zero Postgres)

Status: **Accepted** — July 12, 2026 (proposed July 11, 2026). Owns cycle **C2** of the
[Cost Containment & Scale Readiness epic (Phase 20)](../cost-containment-prd.md), executed as
[PRD 51](../prds/prd-51-decouple-read-cost.md). **Amended July 12, 2026** — see Amendments at the
bottom: decision §2 (render-path sync removal) moved to C1 ([PRD 50](../prds/prd-50-defuse-cost-bombs.md));
a §6 (anonymous/personalized payload split) was added from the July 12 re-audit.

## Context

Every public page in the app is `force-dynamic` and nothing in `app/` or `lib/` uses `unstable_cache`,
`revalidate`, or `revalidateTag` (verified July 11, 2026). Consequently **each page view is one
Vercel function invocation plus several Neon round-trips**, even though the anonymous board is
identical for every visitor and event content changes at most once per day (the `/api/sync/avlgo`
cron at `0 10 * * *`).

This couples the bill to raw request volume on two of the most expensive axes in the stack:

- **Vercel** — invocations + Active CPU scale linearly (or worse, with cold starts) with pageviews.
- **Neon** — compute is billed by active time before autosuspend; a steady trickle of uncached reads
  keeps compute **awake continuously**, so it never scales to zero, and `lib/db.ts:44` still carries
  a "one connection per warm Lambda … Aiven free tier … point DATABASE_URL at the Aiven pooler"
  comment — strong evidence the Neon **pooled** endpoint is not actually wired, so connection churn
  is also higher than it should be.

Traffic is minimal today, so the absolute cost is near-zero and this has not hurt. The project
expects a material traffic ramp by end of 2026. Left unchanged, that ramp is a linear (at least) bill
ramp — the precise "sneak-up of serverless functions / CPU hours" the product owner wants to prevent.
The roadmap's existing **Scaling Milestones** table already anticipates one slice of this
("WAU > 100 or Events > 5,000/mo → add `revalidate = 3600` on the OG-image routes"); this ADR
generalizes that instinct from the OG images to the **entire event read path**, and pulls it forward
so it is in place *before* the thresholds are hit rather than as a reaction to them.

Constraints that shape the decision:

- **$0 posture** — no new paid service; caching and Neon autosuspend are free platform features.
- **Correctness is non-negotiable** — event showtimes must not go stale past a feed update; a naive
  time-only cache risks serving yesterday's board.
- **No local `DATABASE_URL`** (project convention) — the cache tests must not require a live DB.
- **Next.js is pinned at 15.5.x, App Router** — the caching primitive must be stable on that version.

## Decision

1. **Cache event reads, invalidate on write.** Wrap `getUpcomingEvents` and `getEventById`
   (`lib/events.ts`) in `unstable_cache` with a **daily `revalidate` ceiling** and a shared cache
   **tag** `events`. The AVLgo sync route, after a *successful* upsert, calls
   `revalidateTag('events')`. Fresh feed data therefore appears immediately after the cron and only
   then; between crons, thousands of pageviews collapse to a single cached read. The daily
   `revalidate` is a backstop, not the primary freshness mechanism.

2. **Remove ingest from the render path.** On an empty DB read, serve seed/empty-state and let *only*
   the cron populate rows; never call `syncUpcomingEvents()` inline during a page render
   (`lib/events.ts:168`). Ingest is expensive, external, and timeout-prone — it must never sit on a
   user request.

3. **Serve the public pages as a static shell + dynamic islands.** Drop `force-dynamic` from
   `app/page.tsx` and `app/event/[id]/page.tsx`; server-render the board/detail from the cached read.
   Keep `"use client"` and per-request dynamism only around genuinely personalized fragments
   (signed-in taste signals, saved state). The anonymous payload is served from cache and is
   identical to what ships today.

4. **Move Neon to the pooled, scale-to-zero endpoint.** Point `DATABASE_URL` at the Neon `-pooler`
   endpoint for the app; keep the **direct** endpoint for `db:apply` (migrations need a session).
   Delete the stale Aiven/PgBouncer comment in `lib/db.ts` and re-validate `max`/idle settings for a
   pooled endpoint. With reads cached, real idle windows now occur, so the branch can autosuspend and
   we pay for compute only when actually serving origin traffic.

5. **Trim image optimization to match** (coordinated with ADR 0003's host allow-list): raise
   `images.minimumCacheTTL` and prune `deviceSizes`/`imageSizes` to what the board/detail render, so
   each poster is transformed roughly once rather than per-viewer-per-viewport.

### Alternatives considered

- **Time-only caching (`revalidate = N`, no tag).** Simpler, but either serves stale events (long N)
  or barely helps (short N). Rejected: event-driven `revalidateTag` from the cron gives both
  freshness and near-perfect hit rate.
- **Next.js Cache Components (`use cache` / `cacheTag`).** The newer model, cleaner long-term, but not
  the stable path on the pinned 15.5 App Router and a larger change. Deferred to a future Next
  upgrade; `unstable_cache` + `revalidateTag` is the smallest correct step now.
- **A CDN/edge cache in front of everything.** Overkill, harder to invalidate precisely, and risks
  caching personalized fragments. Rejected in favor of framework-native caching with explicit islands.
- **Read replicas / bigger Neon compute.** Solves the wrong problem (adds capacity/cost) instead of
  removing the per-view read. Rejected.

## Consequences

- **Positive:** page-view volume decouples from Neon compute-hours and Vercel invocations — 10×
  traffic ≈ flat read cost. Neon can scale to zero between bursts. The public board gets faster
  (served static). The change is `$0` and additive.
- **Positive:** freshness becomes a *tested* property (a feed change + cron `revalidateTag` makes the
  new event appear; without it, the old set persists) rather than an assumption.
- **Negative / risk:** a bug in the invalidation path could serve stale events. Mitigated by the
  freshness regression test being a hard C2 gate, and the daily `revalidate` backstop.
- **Negative / risk:** the pooled endpoint changes `pg` connection semantics; validated on a Neon
  preview branch before prod, with the direct endpoint retained for migrations.
- **Neutral:** `unstable_cache` is an unstable-prefixed API; if a Next upgrade changes it, the wrapped
  reads are localized to `lib/events.ts` and cheap to migrate to Cache Components then.
- **Testability:** cache behavior is unit-tested by spying the underlying DB query fn (invoked once
  across two reads; re-invoked after `revalidateTag`) — no live DB, honoring the no-local-`DATABASE_URL`
  constraint.

## Amendments

### July 12, 2026 — re-audit refinements (cycles promoted to PRDs 50–52)

1. **Decision §2 (remove ingest from the render path) executes in C1, not C2.** The July 12
   re-audit found `getEventById` (`lib/events.ts:178`) falls back to a full `syncUpcomingEvents()`
   on *any unknown id* — so a `/event/<bogus-id>` loop is a **traffic-independent** cost lever,
   the same class as the unauthenticated sync routes ADR 003 closes. It is pulled forward into
   [PRD 50](../prds/prd-50-defuse-cost-bombs.md). The decision itself is unchanged.
2. **New decision §6 — split the anonymous payload from personalization.** The board serializes the
   full events array plus ~15 per-event signal maps (discovery states, saved keys, circle activity,
   music profile…) into the RSC/HTML payload on **every** render (`app/page.tsx:82–102`). For the
   static shell (§3) to be cacheable — and to stop payload egress scaling with event volume ×
   signal maps — the anonymous (cacheable) payload and the signed-in personalization maps are
   split: personalization is fetched only for signed-in viewers and never serialized into the
   anonymous shell. Rendered anonymous output stays byte-for-byte equivalent. Executed in
   [PRD 51](../prds/prd-51-decouple-read-cost.md).
3. **Confirmation:** the re-audit found **no client-side polling** (the only `setInterval` is a
   UI-only headline rotator), confirming the uncached read path is the sole linear-scaling surface
   this ADR needs to address.

### July 12, 2026 — build amendment (PRD 51): §3 executed as data-layer decoupling; `force-dynamic` retained

Decision §3 assumed the anonymous board is viewer-independent. It is not quite: **anonymous
session tuning is server-rendered** (Phase 14 made anonymous tuning the default — a cookie-carrying
anonymous viewer's discovery states, preference signals, and implicit signals personalize the SSR
board). Literally dropping `force-dynamic` would (a) reintroduce the build-time DB render pass the
flag guards against, and (b) break §6's own "anonymous output byte-for-byte" gate for any
anonymous viewer with history. So §3 shipped as **data-layer decoupling**: the pages stay
per-request (cookies are inherently per-request), but every read behind them is cached and
write-invalidated — event reads under the `events` tag (`lib/event-read-cache.ts`), the public
per-event signal maps under `event-signals` (`lib/board-data.ts`), invalidated by the cron and by
each community/curator/shared-song write (`lib/event-signals-cache.ts`). Viewer-scoped reads
short-circuit to empty without a session identity, so a **cookieless view (bots, first-time
visitors — the traffic that scales) costs zero DB queries**; a cheap DB-free invocation per view
remains, which is the flattest cost axis on the bill. A full CDN-static shell would require moving
anonymous personalization client-side (post-hydration fetch + re-score) and is deferred as an
explicit follow-up, to be weighed against the hydration flash it introduces.
