# Cost Containment & Scale Readiness — Master PRD (Epic)

Updated: July 12, 2026

**Status: Scoped — ready to build.** Decomposed into three dependency-sequenced cycles (C1–C3),
each promoted to a numbered cycle PRD on July 12, 2026 (per the numbering reservation below):
[PRD 50 — Defuse the Cost Bombs](prds/prd-50-defuse-cost-bombs.md),
[PRD 51 — Decouple Read Cost from Traffic](prds/prd-51-decouple-read-cost.md),
[PRD 52 — Guardrails so Growth Stays Cheap](prds/prd-52-cost-guardrails.md). The cycle PRDs are the
build documents; this epic remains the umbrella (posture, sequencing, success criteria, evidence).
A **July 12 code re-audit** independently confirmed every Appendix A finding still live and added
four refinements, folded into the cycle PRDs and Appendix B. Not started.

This is **Phase 20** in [`master-roadmap.md`](master-roadmap.md). It is driven by the
[July 11, 2026 systems/UX/UI audit](#appendix-a--evidence-base-july-11-2026-audit) (evidence folded
into Appendix A), reframed through a **cost lens**: today the stack is correct and $0, but its spend
scales *linearly with pageviews* and exposes several *traffic-independent* cost surfaces that a
single actor (or bot) can detonate. Traffic is minimal now and expected to climb materially by the
end of 2026. This epic makes cost **bounded and observable before** that ramp, without changing what
listeners see.

## One-Sentence Goal

**No surprise bill, ever** — cost at scale tracks *content changes* (≈ daily) and *real usage*, not
raw request volume; no unauthenticated endpoint, open proxy, or unthrottled write can run up spend
independent of legitimate traffic; and if anything trends toward a tier limit, we are alerted before
it costs money.

## Why now (the cost model, grounded)

The stack bills on these axes; the parenthetical is what this codebase does today that couples our
bill to raw traffic:

- **Vercel Functions** — invocations + Active CPU + provisioned memory. *(Every public page is
  `force-dynamic` with zero caching → 1 function invocation + several Neon round-trips **per view**.
  Confirmed: `grep unstable_cache|revalidateTag|revalidate` across `app/` + `lib/` returns nothing;
  `app/page.tsx:37` and `app/event/[id]/page.tsx:36` are `force-dynamic`.)*
- **Vercel Image Optimization** — billed per transformation + egress. *(`next.config.mjs:20` sets
  `remotePatterns: [{ hostname: "**" }]` → `/_next/image?url=<anything>` is an open, attacker-
  controllable optimization proxy.)*
- **Neon Postgres** — compute-hours (active time before autosuspend) + storage + egress.
  *(Uncached per-request reads keep compute awake, defeating scale-to-zero; `lib/db.ts:44` still
  carries an "Aiven free tier / PgBouncer" comment, so the Neon **pooled** endpoint likely is not
  wired.)*
- **Vercel Blob** — storage + operations + egress. *(`ingestImageToBlob` (`lib/blob-storage.ts:7`)
  fetches arbitrary feed URLs with no size/content-type/timeout cap; sync ingest concurrency is
  unbounded — `lib/events.ts:391`.)*
- **Compute via unauthenticated triggers** — *(all four `/api/sync/*` routes authenticate nothing;
  two run `maxDuration = 300`. `curl` in a loop = unbounded 300s-CPU functions + Spotify-quota burn
  + Blob writes/deletes — `app/api/sync/cleanup/route.ts`, `.../avlgo/route.ts`,
  `.../artist-match/route.ts:5`, `.../backfill-images/route.ts:5`.)*
- **GitHub Actions** — billed per minute. *(None today — so adding CI is a **new** cost we must keep
  lean by construction.)*
- **Spotify Web API** — quota, not dollars; a burned quota **breaks the app**, an availability cost.

Two cost classes fall out of that model, and the epic is sequenced around them:

1. **Traffic-independent "cost bombs"** — spend a single actor can generate at *zero* real users
   (unauth sync, open image proxy, unbounded ingest). Fix first; they are the true "sneak-up" risk.
2. **Linear scaling** — spend that grows with legitimate pageviews (uncached dynamic reads). This is
   what the year-end ramp turns into a bill ramp. Fix second; it is the largest structural lever.
3. **Guardrails & observability** — the standing safety net (budget/usage alerts, write rate limits,
   edge bot controls, lean CI) so growth stays cheap *and* nothing sneaks up unseen. Fix third.

## Posture (Locked — inherited by every cycle)

- **$0 stays the target; every change is a cost *reduction* or a *cap*, never a new paid service.**
  Spend/usage **alerts** are free platform features, not upgrades.
- **No listener-visible behavior change.** The anonymous board payload, ranking, and every rendered
  surface stay byte-for-byte identical; this epic changes *how* data is fetched, *who* may trigger
  compute, and *what* we monitor — not *what* is shown. (Ties to the existing anonymous-first
  posture.)
- **Correctness before caching.** No read is cached until its invalidation path is proven, so we
  never serve stale events past the daily cron. Freshness is a test gate, not a hope (see ADR 0002).
- **Trust boundary is explicit.** Anything that triggers server compute or a server-initiated fetch
  (crons, image ingest, `/_next/image`) is authenticated or allow-listed by construction (ADR 0003).
- **Security-at-inception.** New first-party code is Snyk-scanned before a cycle is "done" (global
  policy + `workflow.md`).
- **Testing rides every cycle** — each cycle names the suites it adds/extends; the epic ends with a
  live verification pass. C3 institutionalizes testing itself (lean CI) so this is the *last* epic
  that ships without an automated gate.

## Architecture Decision Records

Two genuinely cross-cutting, hard-to-reverse decisions are recorded as ADRs (the rest are
implementation under their umbrella):

- **[ADR 0002 — Decouple read cost from traffic](adrs/0002-decouple-read-cost-from-traffic.md)**:
  cached event reads (`unstable_cache` + cron-driven `revalidateTag`) over a Neon **pooled**,
  scale-to-zero connection, with the public pages served as a mostly-static shell + small dynamic
  islands. Owns C2.
- **[ADR 0003 — Authenticated internal endpoints & abuse controls](adrs/0003-authenticated-internal-endpoints-and-abuse-controls.md)**:
  a single `assertCronRequest` bearer gate for all `/api/sync/*`, an explicit image-host allow-list,
  bounded server-initiated fetches, and reused rate-limiting on public writes. Owns C1 + parts of C3.

Guardrail/observability items (spend alerts, BotID/firewall, CI) are **operational configuration**,
not architecture — no ADR; specified directly in C3.

## Outcome → Cycle Map

| Cycle | PRD | Theme | Cost class | ADR | Effort | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **C1 — Defuse the Cost Bombs** | [PRD 50](prds/prd-50-defuse-cost-bombs.md) | Authenticate every compute trigger, close the open image proxy, bound image ingest, cap the heavy sync jobs, kill the render-path scrape fallback (pulled forward from C2), and turn on spend/usage alerts. | Traffic-independent (1) + safety net | 0003 | ~2–3 days (all S) | Planned |
| **C2 — Decouple Read Cost from Traffic** | [PRD 51](prds/prd-51-decouple-read-cost.md) | Cache event reads + invalidate from the cron; serve the public pages as a static shell with dynamic islands; split the anonymous payload from the signed-in personalization maps; move Neon to the pooled scale-to-zero endpoint. | Linear scaling (2) | 0002 | ~3–5 days (M) | Planned |
| **C3 — Guardrails so Growth Stays Cheap** | [PRD 52](prds/prd-52-cost-guardrails.md) | Rate-limit + honeypot public writes, add edge bot controls on hot/dynamic + `/_next/image` routes, add a **lean** CI gate, and automate a transactional `db:apply`. | Guardrails (3) | 0003 (rate limits) | ~3–5 days (M) | Planned |

> **Scope moves (July 12, 2026):** the render-path-sync removal moved **C2 → C1** (the
> `getEventById` bogus-id fallback is a single-actor cost lever, same class as the unauth sync
> routes — see Appendix B item 4); C2 gained the **anonymous/personalized payload split** (Appendix
> B context). The inline C1–C3 requirement sections below are retained as the epic-level record;
> where they differ from a cycle PRD, **the cycle PRD wins**.

## Delivery Sequence & Dependencies

```
C1 Defuse the Cost Bombs        (traffic-independent spend + Spotify-quota risk — do FIRST; all quick, all high-severity)
 └──> C2 Decouple Read Cost      (the structural lever: pageviews stop multiplying Neon compute + Vercel invocations)
       └──> C3 Guardrails        (bot/rate/CI controls assume C2's cache + C1's auth boundary; CI gate locks it all in)
```

- **C1 first** — its findings cost money/quota at *zero* legitimate traffic and are the classic
  "sneak-up." Every item is effort-S and independently shippable; the spend/usage alerts landed here
  protect the rest of the epic while it is built.
- **C2 second** — the one change that breaks the pageviews→cost coupling; it is the biggest lever and
  the enabling condition for Neon scale-to-zero. Sequenced after C1 so the abuse surfaces that would
  otherwise pollute cache-hit metrics are already closed.
- **C3 last** — bot/rate-limit tuning wants C2's cache in place (so we throttle *origin-hitting*
  traffic, not cache hits), and the CI gate is the capstone that makes every prior guarantee
  regression-proof. C3's CI workflow doubles as the epic's standing verification harness.
- Each cycle is independently shippable; recommended order **C1 → C2 → C3**.

---

## C1 — Defuse the Cost Bombs

**Goal:** no request, actor, or bot can generate unbounded spend or burn Spotify quota independent
of legitimate traffic; and we are alerted before any metric approaches a tier limit.

**Requirements**

- **Authenticate all `/api/sync/*`.** Add `assertCronRequest(request)` (per ADR 0003): require
  `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel injects this header on cron
  invocations when `CRON_SECRET` is set), else `401`. Apply to `avlgo`, `cleanup`,
  `backfill-images`, `artist-match`. Set `CRON_SECRET` in Vercel (Production + Preview).
- **Close the open image proxy.** Replace `next.config.mjs` `hostname: "**"` with an explicit
  allow-list of hosts actually used: `*.blob.vercel-storage.com`, `i.scdn.co`, `*.fbcdn.net`,
  `www.avlgo.com` (audit the live feed for any others before locking).
- **Bound `ingestImageToBlob`** (`lib/blob-storage.ts`): enforce a byte ceiling, require the
  response `content-type` to start with `image/`, and attach a fetch timeout (`AbortSignal.timeout`).
- **Cap the sync jobs.** Add `export const maxDuration = 300` + `runtime = "nodejs"` to `avlgo` and
  `cleanup` (currently unset while lighter backfills request 300s); add
  `AbortSignal.timeout(8000)` to the AVLgo feed fetch (`lib/events.ts:293`) routed into the existing
  seed fallback; chunk the ingest map to a concurrency of ~6 (`lib/events.ts:391`).
- **Turn on the safety net (free):** enable **Vercel Spend Management** (hard cap + email alert) and
  **Neon usage alerts** (compute-hours + storage). Record the thresholds chosen in this PRD.

**Testing (C1)**

- New unit suite `tests/cron-auth.test.ts` for `assertCronRequest`: missing header → 401; wrong
  token → 401; correct bearer → passes. Add `test:cron-auth` to `package.json` (mirrors existing
  `test:*` script pattern).
- New unit suite `tests/blob-ingest-guard.test.ts`: oversized `content-length` rejected; non-`image/*`
  content-type rejected; a slow fetch aborts. (Pure guard logic extracted so it is testable without
  network.)
- Smoke assertion (manual, dated here): `curl -i https://avlmc.vercel.app/api/sync/cleanup` returns
  **401**; a same-request with the bearer succeeds; a real cron invocation still runs (check Vercel
  cron logs next morning).
- `/_next/image?url=https://example.com/x.jpg` returns **400** (host not allow-listed); a real event
  poster still optimizes.
- Regression: `typecheck` / `lint` clean; touched files Snyk-clean.

**C1 Definition of Done:** all four sync routes 401 without the bearer and run under cron;
`/_next/image` refuses non-allow-listed hosts; ingest is size/type/time/concurrency bounded; spend
and usage alerts are live with recorded thresholds.

---

## C2 — Decouple Read Cost from Traffic

**Goal:** cost tracks how often event content changes (≈ once/day via the cron), not how many people
look at it. 10× the traffic ≈ flat Neon compute and roughly flat Vercel invocations.

**Requirements** (see ADR 0002 for the decision + rejected alternatives)

- **Cache event reads.** Wrap `getUpcomingEvents` and `getEventById` (`lib/events.ts`) in
  `unstable_cache` with a daily `revalidate` and a cache **tag** (`events`). The AVLgo sync
  (`/api/sync/avlgo`), on a successful upsert, calls `revalidateTag('events')` so a fresh feed is
  visible immediately and *only* then. Never serve stale rows past a real update.
- **Kill the render-path sync.** On an empty DB read, serve seed/empty-state; never run
  `syncUpcomingEvents()` inline in a page render (`lib/events.ts:168`). Ingest is the cron's job only.
- **Static shell + dynamic islands.** Remove `force-dynamic` from `app/page.tsx` and
  `app/event/[id]/page.tsx`; server-render the board/detail from the cached read, and keep
  `"use client"` / per-request dynamism only around genuinely personalized bits (signed-in signals,
  saved state). The anonymous payload is served from cache.
- **Neon pooled, scale-to-zero.** Point `DATABASE_URL` at the Neon `-pooler` endpoint; delete the
  stale "Aiven/PgBouncer" workaround comment in `lib/db.ts` and confirm `max`/idle settings suit a
  pooled endpoint; verify the Neon branch autosuspends aggressively when idle (with caching, idle
  windows now actually occur).
- **Trim image optimization** (rides C1's allow-list): raise `images.minimumCacheTTL`, prune
  `deviceSizes`/`imageSizes` to what the board/detail actually render, so each poster is transformed
  ~once, not per-viewer-per-viewport.

**Testing (C2)**

- New suite `tests/events-cache.test.ts`: `getUpcomingEvents` returns a cached value on the second
  call without a second DB hit (assert the underlying query fn is invoked once across two reads);
  `revalidateTag('events')` forces the next read to re-query. (Model the DB fn as a spy — no live DB,
  consistent with the no-local-`DATABASE_URL` constraint.)
- Freshness regression (the load-bearing correctness test): a simulated feed change followed by a
  cron `revalidateTag` makes the *new* event appear; without the revalidate, the old set persists —
  proving we neither serve stale data nor cache-bust on every read.
- `test:registry` green (if any node's `sourceOfTruth`/`implementationNotes` change, regenerate the
  system map — `npm run generate:system-map` — per `workflow.md`).
- Manual smoke: `playwright test --config playwright.smoke.config.ts` (existing readability smoke)
  passes against the now-static board; the board still renders the same events.
- **Verification pass (owner, dated here):** on a preview deploy, load `/` twice and confirm in
  Vercel logs that the second load did **not** issue event DB queries (cache hit), and that the Neon
  branch shows an idle/suspended compute window during a no-traffic gap. This is the epic's core
  proof that read cost is decoupled.

**C2 Definition of Done:** repeated anonymous page loads serve from cache with no per-view DB query;
a cron re-ingest is visible within one revalidation; Neon compute idles between traffic bursts;
listener-visible output is unchanged (smoke green).

---

## C3 — Guardrails so Growth Stays Cheap

**Goal:** as traffic and bots rise, per-request writes and origin hits stay bounded, and every prior
guarantee in this epic is regression-locked by an automated — and *itself cheap* — gate.

**Requirements**

- **Rate-limit + honeypot the public writes** (per ADR 0003): reuse the sliding-window limiter from
  `lib/tester-requests-core.ts` (IP + optional identity dimension) on `feedback`,
  `community/reactions`, `discovery/event-action`, and `me/avatar`; add the existing `website`
  honeypot to `feedback` (contributions/tester-requests already have it). Add an IP dimension to the
  cookie-only contributions limiter (`lib/community.ts:746`) so clearing a cookie no longer resets it.
- **Edge bot controls.** Enable **Vercel BotID** (or a firewall rule) on the hot dynamic routes and
  `/_next/image`, so bot crawls are refused at the edge *before* they cost a function invocation or a
  DB/optimization hit. (Free tier; tune to not block legitimate crawlers of the public board.)
- **Lean CI — the standing test gate.** Add one GitHub Actions workflow that runs `typecheck`,
  `lint`, and the affected `test:*` suites on PRs to `main`. Keep it **cheap by construction**:
  `concurrency: { group: ..., cancel-in-progress: true }`, `paths-ignore` for docs-only pushes, a
  single job (no matrix), dependency cache. Gate merges on green. (This is the first automated
  enforcement of the ~30 existing manual suites; GitHub free-tier minutes cover it comfortably at
  this size — the point of "lean" is to keep it that way as the repo grows.)
- **Automate a transactional `db:apply`.** Run `scripts/apply-schema.ts` in the deploy pipeline
  (or a deploy hook) against the direct endpoint, wrapped in a single `BEGIN/COMMIT`, so schema
  drift can no longer cause the silent failures that trigger reactive, *expensive* re-sync/backfill
  jobs. (Cost-adjacent: closing the drift loop removes a recurring driver of emergency 300s compute.)

**Testing (C3)**

- New/extended unit suite `tests/write-rate-limits.test.ts`: Nth write within the window → 429; the
  honeypot field populated → rejected; the contributions limiter is not reset by a changed cookie
  when the IP is stable.
- The **CI workflow itself is the test artifact**: a first PR must show the workflow running the
  suites and blocking on a red one (verify by pushing a deliberately failing branch once, then
  reverting). Confirm docs-only pushes are skipped (path filter) and in-progress runs cancel.
- `db:apply` transactional behavior: a syntactically bad statement mid-file rolls the whole apply
  back (no partial schema) — verified against a Neon **preview branch**, never prod.
- Regression: full existing suite set + `test:registry` + smoke green under the new CI job.

**C3 Definition of Done:** public writes are IP-throttled and honeypot-guarded; bots are refused at
the edge on the metered routes; CI gates `main` on typecheck/lint/affected-tests and is demonstrably
lean (path-filtered, cancel-in-progress); `db:apply` is transactional and runs in deploy.

---

## Initiative-Level Success Criteria

- **Traffic-independent spend is capped:** every `/api/sync/*` route and `/_next/image` refuses
  unauthorized/unlisted callers (demonstrated by the C1 smoke + unit suites); image ingest is
  size/type/time/concurrency bounded.
- **Read cost is decoupled from traffic:** a repeated anonymous page load serves from cache with no
  per-view event query (C2 verification pass), and the Neon branch idles between bursts; a cron
  re-ingest is visible within one revalidation and no staler.
- **Growth stays observable and bounded:** Vercel Spend Management + Neon usage alerts are live with
  recorded thresholds; public writes are rate-limited + honeypot-guarded; bots are edge-refused on
  metered routes.
- **Everything is regression-locked:** a lean CI gate runs typecheck/lint/affected suites on every
  PR to `main` and blocks on red; `db:apply` is transactional and automated.
- **No listener-visible change:** the anonymous board payload and ranking are byte-for-byte
  unchanged (smoke green); `$0` posture held (no new paid service); new code Snyk-clean.

## Cross-Cutting Risks

- **Stale events from over-caching (C2).** A cache that outlives a feed change would show wrong
  showtimes. Mitigated: revalidation is *event-driven* from the cron (`revalidateTag` on successful
  upsert) with a daily ceiling as backstop; the freshness regression test is a hard gate, not a
  nicety.
- **`CRON_SECRET` misconfiguration locks out real crons (C1).** If the env var is unset in
  Production, `assertCronRequest` would 401 the legitimate cron. Mitigated: set it *before* deploying
  the gate; the C1 smoke checks a real cron invocation the next morning; keep a documented manual
  re-trigger with the bearer.
- **Over-aggressive bot rules block real crawlers / previews (C3).** Blocking Googlebot would hurt
  discovery. Mitigated: rules target `/_next/image` + high-frequency signatures first, allow known
  search crawlers, and are staged/observed before enforce.
- **CI cost creep (C3).** An unbounded matrix or per-push full-suite run could itself become a
  GitHub-minutes cost. Mitigated by design: single job, path filters, cancel-in-progress, dependency
  cache — the "lean" requirement is explicit and testable (measure minutes on the first week).
- **Neon pooler swap changes connection semantics (C2).** The pooled endpoint behaves differently
  from a direct connection under `pg`. Mitigated: validate on a Neon preview branch first; keep the
  direct endpoint for `db:apply` (migrations need a session), pooled for app reads.

## Open Decisions & Assumptions

- **Open (C2):** `unstable_cache` (App Router, Next 15.5) vs. adopting the newer Cache Components
  (`use cache` / `cacheTag`) model. Default: **`unstable_cache` + `revalidateTag`** — it is stable
  on the pinned Next version and the smallest change; revisit if/when we upgrade Next (see ADR 0002).
- **Open (C1):** image-host allow-list contents — confirm the live feed's poster CDN(s) before
  locking `remotePatterns`, to avoid breaking real posters. Default: the four hosts named above,
  verified against a live feed sample.
- **Open (C3):** CI provider — GitHub Actions vs. relying on Vercel's build-time checks. Default:
  **GitHub Actions** (runs on PR before deploy, gates merge); keep it lean per the requirement.
- **Resolved (July 12, 2026):** this registers as **Phase 20**; the cycles are promoted to
  **PRDs 50–52** (after the auth epic's 47–49) — the cycle PRDs are now the executable build docs.
- **Assumed:** no schema changes are required by the epic itself (C3's `db:apply` automation runs the
  *existing* `schema.sql`; the transaction wrapper is a script change, not a migration).

---

## Appendix A — Evidence base (July 11, 2026 audit)

Grounded findings this epic acts on, with the cost axis each touches. All file:line refs verified in
the working tree on July 11, 2026.

| Finding | Location | Cost axis | Cycle |
| --- | --- | --- | --- |
| `/api/sync/*` fully unauthenticated; `cleanup` deletes Blob images, `avlgo`/`artist-match` run heavy external work | `app/api/sync/*/route.ts`, `lib/events.ts:263` | Vercel Active CPU + Blob ops + Spotify quota (traffic-independent) | C1 |
| `images.remotePatterns: "**"` → open optimization proxy | `next.config.mjs:20` | Vercel image transformations + egress (traffic-independent) | C1 |
| `ingestImageToBlob` unbounded (size/type/timeout); unbounded ingest concurrency | `lib/blob-storage.ts:7`, `lib/events.ts:391` | Blob storage + function memory/CPU | C1 |
| `avlgo`/`cleanup` have no `maxDuration`; AVLgo fetch has no timeout | `app/api/sync/avlgo/route.ts`, `lib/events.ts:293` | Vercel Active CPU (runaway duration) | C1 |
| Every public page `force-dynamic`; **zero** caching anywhere | `app/page.tsx:37`, `app/event/[id]/page.tsx:36`; no `unstable_cache`/`revalidate` in `app`+`lib` | Vercel invocations + Neon compute-hours (**linear w/ pageviews**) | C2 |
| Inline live sync on empty DB read during page render | `lib/events.ts:168` | Vercel CPU + Neon (render-path ingest) | C2 |
| Neon pooled endpoint likely not wired (stale Aiven/PgBouncer comment) | `lib/db.ts:44` | Neon compute-hours (no scale-to-zero) | C2 |
| Public writes lack rate limiting; feedback lacks honeypot; contributions limiter is cookie-only | `app/api/feedback/route.ts`, `app/api/community/reactions/route.ts`, `lib/community.ts:746` | Neon rows + Vercel invocations (bot/abuse) | C3 |
| No CI / pre-commit gate for ~30 test suites | (no `.github/workflows/`) | Indirect: drift → emergency 300s re-syncs | C3 |
| `db:apply` manual + non-transactional; recurring prod schema drift | `scripts/apply-schema.ts:59` | Indirect: drift → reactive expensive compute | C3 |

**Explicitly out of scope (noted, not owned here):** the admin static-shared-secret + no-login-rate-
limit finding (a *security* fix, tracked separately — not a cost surface), and DB TLS
`rejectUnauthorized: false` (security). This epic is cost/scale only; those belong in a security
hardening track.

## Appendix B — July 12, 2026 code re-audit (refinements)

An independent code audit on July 12, 2026 re-verified every Appendix A finding as still live
(nothing shipped between the two audits) and added the following refinements, now folded into the
cycle PRDs:

1. **`artist-match` batch size is caller-controlled** — `?limit=` up to 500, each unit live Spotify
   work (`app/api/sync/artist-match/route.ts`). → PRD 50 clamps it behind the bearer gate.
2. **`backfill-images` and `artist-match` are not in `vercel.json`'s cron list** — they exist only
   as publicly triggerable heavy endpoints (no scheduled caller to protect; pure attack surface).
   → PRD 50.
3. **The open image proxy is latent, not active** — the board renders posters via plain `<img>`
   (`components/EventBoard.tsx`), not `next/image`; only local static assets flow through
   optimization today. Still closed in PRD 50 (one-line allow-list); PRD 51's TTL/size trim locks
   the cost shape in before any poster migration.
4. **`getEventById` scrape-on-miss** (`lib/events.ts:178`) — any bogus `/event/<id>` triggers a full
   `syncUpcomingEvents()`; a loop is a single-actor cost lever. → moved **C2 → C1** (PRD 50).
5. **The board render is a ~15-call DB fan-out per anonymous view** (`app/page.tsx:82–102`) against
   a `max: 1` pool, and the full events array **plus all per-event signal maps** are serialized
   into the RSC/HTML payload every render. → PRD 51 adds the anonymous/personalized payload split.
6. **Existing rate limiters are in-memory per instance** (module-level `Map`s in `spotify-gate`,
   `tester-requests`) — reset on cold start, unshared across instances; advisory, not protection.
   → PRD 52 records this as an accepted limitation with edge bot controls as the cross-instance
   layer.
7. **No client-side polling exists** — the only `setInterval` is the rotating hero headline
   (UI-only); all fetches are user-action-triggered. No per-visitor invocation storm from the
   client; confirms the read path (5) is the sole linear-scaling surface.
