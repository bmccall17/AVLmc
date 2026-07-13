# PRD 47: Sign-In Event Resilience

Part of the [Auth Durability Hardening initiative](../auth-durability-prd.md) (Phase 19). Cycle
**C1** (smallest diff, highest stakes). Closes audit finding **F2** (High) from the
[July 8, 2026 auth durability audit](../auth-durability-audit-2026-07-08.md); optionally closes
**F7** (Info). No dependencies — do this first.

Updated: July 12, 2026

## Goal

**No post-sign-in side effect can ever fail an otherwise-successful sign-in.** A listener whose
credentials Auth.js has accepted always leaves the callback with a session cookie, even when a
side-effect write (taste connection, avatar refresh, email recording, signal migration) throws.

## Summary

`@auth/core` awaits `events.signIn` **inside** the OAuth/email callback handler
(`node_modules/@auth/core/lib/actions/callback/index.js:114` and `:214`). If the handler throws,
the response is aborted **after** the DB session row was created but **before** the session cookie
is returned — the user lands on `/auth/error` with valid credentials and an orphaned session row.
Three of the four steps in our `events.signIn` (`auth.ts`) already follow a deliberate
"best-effort — a failure must never block sign-in" posture with try/catch. The fourth —
`recordMusicConnection` — does not, and its `upsertMusicConnection` insert has no
`42P01/42703` tolerance. Given this project's known prod failure mode (schema.sql is applied
manually; see the `db:apply` runbook), a drifted `music_connections` table breaks **all Spotify
sign-in**, not just taste import. This cycle makes the best-effort posture structural and
regression-tested.

## Implementation Status

**Shipped (Jul 12, 2026).** Delivered:

- **`lib/auth-signin-event.ts` (new)** — `handleSignInEvent` extracts the `events.signIn` body out
  of the `auth.ts` factory and runs **all four** steps (record music connection, refresh avatar,
  record provider email, anonymous session hand-off) through `runBestEffort(label, fn)`, which
  awaits the step, swallows any throw, logs it with the stable prefix `signIn side-effect failed:`,
  and never rejects. Side effects are injectable deps (defaulting to the real implementations) so
  the contract is unit-testable with a throwing stub — no DB, no request context.
- **`auth.ts`** — `events.signIn` is now a one-line delegate (`signIn: handleSignInEvent`); the bare
  `recordMusicConnection` await and the three ad-hoc try/catch blocks are gone, along with the
  helpers/imports that migrated into the new module. No bare `await` side effect remains.
- **`tests/signin-event.test.ts` (`test:signin-event`, 6)** — a throwing `recordMusicConnection`
  still completes the handler; a step-1 throw does not skip steps 2–4; the failure is logged with
  the prefix; happy path runs each step once; a non-music provider skips the music step; missing
  id/provider is a no-op. Runs under the `server-only` stub tsconfig
  (`tests/tsconfig.signin-event.json`); registered in `package.json` and the CI suite loop.
- **Registry** — the `int-authjs` node (`lib/system-registry.ts`) gains the F2 `runtime_gotcha`
  (events are awaited inside the `@auth/core` callback → every step must be best-effort); system map
  regenerated.
- **F7 not taken** (out of scope this cycle). No schema change; `lib/music.ts` untouched (adding
  `42P01/42703` tolerance was an explicit non-goal — the best-effort wrap is the fix). Named
  regression suites (`test:account-linking`, `test:auth-failures`, `test:auth-email`,
  `test:account-integrity`, `test:registry`) + typecheck + lint green; touched files Snyk-clean; `$0`.

**Remaining (owner):** manual F2 repro on a throwaway Neon branch — drop the `music_connections`
unique constraint, confirm Spotify sign-in still round-trips (session cookie set, no `/auth/error`);
date the result in the epic. Tracked in `backlog.md`.

## Background: evidence

- Audit F2, verified against installed `@auth/core` source: events are awaited in the callback
  try-block; a throw becomes a callback error → error redirect, cookie never set.
- `auth.ts` `events.signIn`: avatar refresh and anonymous hand-off are try/caught;
  `recordProviderEmail` catches internally; `recordMusicConnection` is bare.
- `lib/music.ts` `upsertMusicConnection`: plain `insert … on conflict (user_id, provider)` — a
  missing table, missing column, or missing unique constraint throws.
- Repro (test branch): drop the `music_connections` unique constraint → every Spotify sign-in
  redirects to the error page despite valid credentials.

## Goals

- Every step in `events.signIn` is best-effort **by construction**: extract a small
  `runBestEffort(label, fn)` helper (logs `console.error` with the label on failure, never
  throws) and run all four steps through it, replacing the three ad-hoc try/catch blocks.
- A regression test proves the contract: the sign-in event handler resolves (and sign-in
  completes) when `recordMusicConnection` throws. House pattern: make the event body a named,
  exported function (e.g. `handleSignInEvent` in a lib module or exported from `auth.ts`) so the
  test can drive it directly with a throwing stub — same isolation style as the other focused
  suites.
- Failures stay loud where operators look: the error log lines carry a stable prefix (e.g.
  `signIn side-effect failed:`) so Vercel runtime logs and future health tooling can find them.
- **Optional (F7):** extend the existing `/api/sync/cleanup` cron route with
  `delete from verification_token where expires < now()` and
  `delete from sessions where expires < now()` — Auth.js only deletes on use/access.

## Non-Goals

- **No** change to what the side effects *do* — token recording, avatar refresh, email recording,
  and signal migration behave identically on success.
- **No** schema change; **no** change to the adapter, session strategy, or providers.
- **No** retry/queue machinery — a failed side effect is logged and dropped (the next sign-in or
  sync re-runs it; the admin Health probe already surfaces stale music connections).

## Requirements

### `auth.ts`

- All four `events.signIn` steps run through the best-effort helper; no bare awaits remain in the
  event handler. Keep the existing per-step comments — they document *why* each step exists; the
  helper documents why none may throw.
- The helper lives where the event body lives; if extracted to a lib module, register nothing new
  (it's an implementation detail of the existing auth node).

### Tests

- New focused suite (or extension of an existing auth suite) asserting: (1) a throwing
  `recordMusicConnection` does not reject the event handler; (2) the remaining steps still run
  (a throw in step 1 doesn't skip steps 2–4); (3) the error path logged.
- Existing suites stay green: `test:account-linking`, `test:auth-failures`, `test:auth-email`,
  `test:account-integrity`, `test:registry`.

### Architecture & quality

- If the event body moves to a lib file, update the auth node's `implementationNotes` in
  `lib/system-registry.ts` (runtime_gotcha: "events.signIn is awaited in the @auth/core callback —
  every step must be best-effort"); regenerate the system map; `test:registry` green.
- typecheck / lint / Snyk scan on touched files green.

## Risks

- **Swallowed failures mask real breakage.** Accepted deliberately (posture: sign-in is sacred),
  mitigated by loud stable-prefix logging and the Health probe's staleness view. If taste sync
  silently degrades, the listener's profile panel already shows the reconnect state.
- **Refactor touches the live auth path.** Smallest possible diff; behavior on the success path is
  identical; the regression test pins the failure path.

## Acceptance Criteria

- With `recordMusicConnection` stubbed to throw, a simulated sign-in event completes and the other
  steps run (unit-proven); manual spot-check: Spotify sign-in in production still round-trips.
- No bare `await` side effect remains in `events.signIn`.
- (If F7 taken) cleanup cron deletes expired verification tokens + sessions; prod counts drop on
  next run.
- All named suites + typecheck + lint green; touched files Snyk-clean.

## Test Scenarios

- Throwing `recordMusicConnection` → handler resolves; steps 2–4 executed; error logged once.
- Throwing avatar fetch / `recordProviderEmail` / signal migration → same contract each.
- All steps succeed → behavior byte-identical to today (tokens stored, email recorded, signals
  migrated).
- (F7) cron run with expired + live rows → expired deleted, live untouched.
