# ADR 003: Authenticated Internal Endpoints & Abuse Controls (the Compute Trust Boundary)

Status: **Accepted** — July 12, 2026 (proposed July 11, 2026). Owns cycle **C1** and the
rate-limiting portion of cycle **C3** of the
[Cost Containment & Scale Readiness epic (Phase 20)](../cost-containment-prd.md), executed as
[PRD 50](../prds/prd-50-defuse-cost-bombs.md) and [PRD 52](../prds/prd-52-cost-guardrails.md).
**Amended July 12, 2026** — see Amendments at the bottom.

## Context

Several surfaces let an **unauthenticated** caller trigger server compute, a server-initiated
outbound fetch, or a persisted write — so a single actor (or a bot) can generate real Vercel /
Neon / Blob spend and burn Spotify quota **independent of legitimate traffic**. Verified July 11,
2026:

- **All four `/api/sync/*` routes authenticate nothing** (`avlgo`, `cleanup`, `backfill-images`,
  `artist-match`); no `middleware.ts`, no `CRON_SECRET`/`Authorization` check anywhere inbound. Two
  run `export const maxDuration = 300`. `cleanup` permanently **deletes** Blob images for events
  >7 days old (`lib/events.ts:263`). So `curl` in a loop is unbounded 300s-CPU functions + Blob
  churn + a Spotify-quota DoS.
- **`next.config.mjs:20` sets `images.remotePatterns: [{ hostname: "**" }]`**, making
  `/_next/image?url=<anything>` an open, attacker-controllable optimization proxy: server-side
  outbound GETs to arbitrary hosts (SSRF-adjacent) plus **billed** transformations + egress.
- **`ingestImageToBlob` (`lib/blob-storage.ts:7`)** fetches whatever the feed points at with no size
  cap, no content-type check, and no timeout — a hostile/large feed can inflate Blob storage and
  function memory. Sync ingest concurrency is unbounded (`lib/events.ts:391`).
- **Public writes have no rate limiting** — `feedback` (also missing the honeypot that
  contributions/tester-requests use), anonymous `community/reactions`, `discovery/event-action`, and
  `me/avatar` (Blob writes). The contributions limiter (`lib/community.ts:746`) is keyed **only** on
  the client-controlled `session_id` cookie, so clearing the cookie resets the counter.

These are qualitatively different from the linear-scaling problem in
[ADR 0002](0002-decouple-read-cost-from-traffic.md): they cost money at **zero** real users and are
the classic "surprise bill." The project's requirement is that cost cannot sneak up; that requires an
explicit **trust boundary** around anything that spends.

Constraints: `$0` posture (the controls used — bearer check, host allow-list, the existing
sliding-window limiter, Vercel BotID/firewall free tier — add no paid service); reuse existing
patterns rather than introduce new dependencies.

## Decision

**Anything that triggers server compute, a server-initiated fetch, or a persisted write is
authenticated, allow-listed, or throttled by construction.** Concretely:

1. **One cron/internal auth gate.** Add `assertCronRequest(request)` to `lib/` that requires
   `request.headers.get("authorization") === \`Bearer ${process.env.CRON_SECRET}\`` and otherwise
   returns `401`. Vercel injects this header on cron invocations when `CRON_SECRET` is set. Apply it
   at the top of all four `/api/sync/*` handlers. Set `CRON_SECRET` in Vercel (Production + Preview)
   **before** the gate ships so real crons keep running. This is a single shared helper — no route
   re-implements the check (the admin routes' history of three divergent auth checks is the
   anti-pattern to avoid).

2. **Explicit image-host allow-list.** Replace `hostname: "**"` with the exact hosts the app renders
   from — `*.blob.vercel-storage.com`, `i.scdn.co`, `*.fbcdn.net`, `www.avlgo.com` (verified against
   a live feed sample before locking). `/_next/image` then refuses arbitrary URLs, closing the open
   proxy and the SSRF-adjacent surface.

3. **Bounded server-initiated fetches.** `ingestImageToBlob` enforces a byte ceiling, requires
   `content-type` to start with `image/`, and uses `AbortSignal.timeout`. The AVLgo feed fetch
   (`lib/events.ts:293`) gets `AbortSignal.timeout(8000)` routed into the existing seed fallback.
   Sync ingest runs at a fixed concurrency (~6), mirroring `EVENT_UPSERT_BATCH_SIZE`. Heavy sync
   jobs (`avlgo`, `cleanup`) declare `maxDuration = 300` + `runtime = "nodejs"` so duration is
   explicit, not accidental.

4. **Throttle public writes with the existing limiter.** Reuse the sliding-window limiter from
   `lib/tester-requests-core.ts` (IP + optional identity dimension) on `feedback`,
   `community/reactions`, `discovery/event-action`, and `me/avatar`; add the `website` honeypot to
   `feedback`; add an **IP dimension** to the contributions limiter so a cleared cookie no longer
   resets it. No new dependency — the pattern already exists and is tested.

5. **Edge bot controls (C3).** Enable Vercel BotID / a firewall rule on the hot dynamic routes and
   `/_next/image`, refusing bot crawls *before* they cost a function invocation or an optimization
   hit. Staged/observed before enforce; known search crawlers allowed.

### Alternatives considered

- **A global `middleware.ts` auth layer for `/api/sync/*`.** Middleware now runs on Vercel Functions
  (full Node), so it is viable, but a per-route `assertCronRequest` call is more explicit, easier to
  test in isolation, and avoids a catch-all that could accidentally gate public routes. Rejected in
  favor of the shared helper called per route.
- **A per-route bespoke secret check.** Rejected — that is exactly how the admin routes drifted into
  three inconsistent implementations (one of which truncates tokens on `=`). One helper, everywhere.
- **A new rate-limiting service (Upstash, etc.).** Rejected — the in-repo sliding-window limiter
  already exists and holds the `$0` line; a KV-backed limiter is a future option only if
  multi-instance accuracy becomes necessary.

## Consequences

- **Positive:** the traffic-independent cost bombs are defused — no unauthenticated compute trigger,
  no open image proxy, no unbounded ingest, no unthrottled write. Cost can no longer spike at zero
  real users. Spotify quota is protected from `curl`-loop exhaustion.
- **Positive:** a single, tested auth helper prevents the admin-route drift pattern from recurring on
  the sync routes.
- **Negative / risk:** if `CRON_SECRET` is unset in an environment, the gate 401s the *legitimate*
  cron. Mitigated: set the env var first; C1 smoke verifies a real cron invocation the next morning;
  a documented manual re-trigger (with the bearer) exists.
- **Negative / risk:** an over-tight image allow-list or bot rule could break real posters or block
  legitimate crawlers. Mitigated: allow-list is verified against a live feed sample; bot rules are
  staged and allow known crawlers before enforce.
- **Neutral:** these are security-shaped changes with a cost rationale; the DB-TLS and admin-session
  security findings from the same audit are deliberately **not** in scope here — they belong to a
  security hardening track, not this cost epic.

## Amendments

### July 12, 2026 — re-audit refinements (cycles promoted to PRDs 50–52)

1. **The trust boundary gains a fourth member: the render-path scrape fallback.**
   `getEventById` (`lib/events.ts:178`) runs a full `syncUpcomingEvents()` on any unknown id — an
   unauthenticated compute trigger reachable via `/event/<bogus-id>`. Removing it (originally ADR
   002 §2 / cycle C2) executes with this ADR's C1 items in
   [PRD 50](../prds/prd-50-defuse-cost-bombs.md).
2. **Two of the four sync routes have no legitimate external caller at all** — `backfill-images`
   and `artist-match` are absent from `vercel.json`'s cron list; they are manual/agent tools only.
   The bearer gate covers them identically; the point is that today they are pure attack surface.
   `artist-match` additionally lets the caller set `?limit=` (≤500 events of live Spotify work per
   hit) — clamped behind the gate in PRD 50.
3. **The open image proxy is latent, not active** — the board renders posters via plain `<img>`,
   and only local static assets flow through `next/image` today. Decision §2 (allow-list) stands
   unchanged; the cost of closing it is one line and it also closes the SSRF-adjacent surface.
4. **The existing limiters are per-instance in-memory `Map`s** (`spotify-gate`, `tester-requests`)
   — reset on cold start, unshared across concurrent instances. Decision §4 (reuse the sliding-
   window pattern, no new service) stands, with the limitation now **recorded as accepted**:
   adequate at current scale under Fluid Compute instance reuse, with §5's edge bot controls as
   the cross-instance layer and a KV-backed limiter remaining the measured-only escape hatch.
   Executed in [PRD 52](../prds/prd-52-cost-guardrails.md).
