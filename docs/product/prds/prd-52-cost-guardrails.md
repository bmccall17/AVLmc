# PRD 52: Guardrails so Growth Stays Cheap

Part of the [Cost Containment & Scale Readiness initiative](../cost-containment-prd.md) (Phase 20).
Cycle **C3** — rate-limiting portion governed by
[ADR 003](../adrs/0003-authenticated-internal-endpoints-and-abuse-controls.md); the rest is
operational configuration (deliberately no ADR).
Depends on **PRD 51 (C2)**: bot/rate tuning wants the cache in place so we throttle
*origin-hitting* traffic, not cache hits; the CI gate then locks in every prior guarantee.

Updated: July 12, 2026

## Goal

**As traffic and bots rise, per-request writes and origin hits stay bounded, and every guarantee in
this epic is regression-locked by an automated — and itself cheap — gate.**

## Summary

Public write endpoints accept anonymous POSTs with no rate limiting: `feedback` (also missing the
honeypot that contributions/tester-requests carry), `community/reactions`,
`community/contributions`, `community/ticket-intents`, `discovery/event-action`,
`discovery/spotify-match-correction`, and `me/avatar` (Blob writes). The July 12 re-audit adds a
material fact: the **three limiters that do exist** (`spotify-gate`, `tester-requests` ×2) are
module-level in-memory `Map`s — they reset on every cold start and are not shared across function
instances, so today's "rate limiting" is advisory, not protection. The contributions limiter
(`lib/community.ts:746`) is keyed only on the client-controlled `session_id` cookie, so clearing
the cookie resets it. There is no CI (`.github/workflows/` absent) gating the ~30 manual test
suites, and `db:apply` is manual + non-transactional — the recurring schema-drift → emergency
300s-re-sync loop is itself a cost driver.

## Implementation Status

**Planned.**

## Requirements

### 1. Rate-limit + honeypot the public writes (ADR 003 §4)

- Reuse the tested pure sliding-window helpers from `lib/tester-requests-core.ts`
  (`pruneRateWindow` / `isRateLimited` / `recordAttempt`) on `feedback`, `community/reactions`,
  `community/contributions`, `community/ticket-intents`, `discovery/event-action`,
  `discovery/spotify-match-correction`, and `me/avatar` — keyed on IP + optional identity
  dimension. Nth write within the window → **429**.
- Add the existing `website` honeypot field to `feedback` (contributions/tester-requests already
  have it).
- Add an **IP dimension** to the cookie-only contributions limiter (`lib/community.ts:746`) so a
  cleared cookie no longer resets it.
- **Accepted limitation (recorded):** the limiter stays in-memory per instance — free, dependency-
  less, and adequate at current scale because Fluid Compute reuses instances; a KV-backed limiter
  is the future option **only if** multi-instance accuracy becomes a measured problem (ADR 003
  rejected adding a service now). The edge bot controls below are the complementary cross-instance
  layer.

### 2. Edge bot controls (ADR 003 §5)

- Enable **Vercel BotID** or firewall rules (free tier) on the hot dynamic routes and
  `/_next/image`, refusing bot crawls **before** they cost a function invocation or an
  optimization/DB hit.
- Staged/observed before enforce; known search crawlers of the public board explicitly allowed.

### 3. Lean CI — the standing test gate

- One GitHub Actions workflow on PRs/pushes to `main`: `typecheck`, `lint`, and the affected
  `test:*` suites. Gate on green.
- **Cheap by construction:** single job (no matrix), `concurrency: { cancel-in-progress: true }`,
  `paths-ignore` for docs-only pushes, dependency cache. GitHub free-tier minutes cover it at this
  size; "lean" is a requirement, not a hope — measure minutes in the first week.
- Note for this repo's workflow: work lands directly on `main` (house convention), so the workflow
  must trigger on `push` to `main` as well as PRs.

### 4. Automate a transactional `db:apply`

- `scripts/apply-schema.ts` wrapped in a single `BEGIN/COMMIT` (a bad statement mid-file rolls the
  whole apply back — no partial schema), still against the **direct** endpoint.
- Run it in the deploy pipeline (deploy hook or CI step) so prod schema drift can no longer cause
  the silent failures that trigger reactive, expensive re-sync/backfill jobs. The Health tab's
  schema-drift probe remains the detection backstop.

## Non-Goals

- **No paid rate-limit/KV service** — the in-repo limiter + free edge controls hold the $0 line.
- **No change to what writes do** — same tables, same behavior under the limit.
- **No blocking of legitimate crawlers** — SEO of the public board is preserved by staged rollout.
- **Not the security track** — admin static-secret and DB TLS stay in the separate security
  hardening track.

## Testing

- New/extended suite `tests/write-rate-limits.test.ts` (`test:write-rate-limits`): Nth write within
  the window → 429; populated honeypot → rejected; contributions limiter not reset by a changed
  cookie when IP is stable.
- **The CI workflow is itself a test artifact:** push a deliberately failing branch once → workflow
  blocks; revert. Confirm docs-only pushes skip (path filter) and in-progress runs cancel.
- `db:apply` transactional behavior: a syntactically bad statement mid-file rolls back the whole
  apply — verified against a Neon **preview branch**, never prod.
- Regression: full existing suite set + `test:registry` + readability smoke green under the new CI
  job.

## Risks

- **Over-aggressive bot rules block real crawlers/previews.** Mitigated: target `/_next/image` +
  high-frequency signatures first; allow known search crawlers; stage/observe before enforce.
- **CI cost creep.** Mitigated by design (single job, path filters, cancel-in-progress, cache);
  measure minutes in week one.
- **Rate limits catch a legitimate burst (shared venue Wi-Fi).** Mitigated: windows sized off the
  tester-requests precedent; 429 responses carry a friendly retry message; limits are per-route,
  not global.
- **Automated `db:apply` runs against prod on every deploy.** Mitigated: idempotent schema (proven
  Jun 24 + Jul 9), transactional wrapper, direct endpoint only, and the schema-drift probe verifies
  the result.

## Acceptance Criteria

- Every public write endpoint is IP-throttled (429 past the window) and honeypot-guarded where a
  form feeds it; the contributions limiter survives cookie clearing.
- Bots are refused at the edge on the metered routes; search crawlers still index the board.
- CI gates `main` on typecheck/lint/affected-tests, demonstrably lean (path-filtered,
  cancel-in-progress), and has blocked a red push once (verified, then reverted).
- `db:apply` is transactional and runs automatically on deploy; drift probe stays green.
- All named suites + typecheck + lint green; touched files Snyk-clean; $0 held.
