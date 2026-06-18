# PRD 38: Cross-Browser Reliability & Benchmark

Phase 15 · Cycle 4 of 4 (capstone). Driven by
[`account-signin-linking_desiredoutcomes.md`](../account-signin-linking_desiredoutcomes.md) (Outcome 4) under the
epic [`account-signin-linking-prd.md`](../account-signin-linking-prd.md). Proves the whole Phase 15 loop is
predictable everywhere.

## Goal

**Produce a documented, repeatable cross-browser/device test that confirms sign-in, account linking, access
request, approval, reconnection, and returning-user sessions all behave consistently across the supported
browser/device matrix** — turning "it works on my machine" into a checklist that anyone can re-run.

## Summary

PRDs 35–37 make the account loop correct and recoverable; this capstone **proves** it and back-fills the
reliability checklist the earlier cycles grade against. It defines the supported browser/device matrix, a
step-by-step repeatable script covering every leg of the loop, and the data-integrity assertions (one `users`
row, expected `accounts` rows, no orphaned `user_id`-keyed data) that catch regressions. It also exercises the
PRD 37 failure states to confirm each shows its recoverable guidance rather than a dead-end.

## Design / Approach

- **Supported matrix.** Desktop + mobile across the common engines (Chromium, Firefox, WebKit/Safari), plus the
  embedded-webview / third-party-cookie-blocked cases PRD 37 detects as `browser_fallback`. Captured as a short
  table in the doc + test fixtures.
- **Repeatable loop script.** A documented sequence (and, where practical, an automated harness following the
  repo's existing test conventions) exercising each leg:
  1. **Sign-in** — magic-link and Spotify each create/access an account.
  2. **Linking** — connect the other method from each starting point (PRD 35); assert one `users` row + two
     `accounts` rows.
  3. **Access request** — submit a Spotify access request as a non-allowlisted tester (PRD 36); assert
     "pending" + admin visibility.
  4. **Approval** — mark slot-added; simulate the dashboard add.
  5. **Reconnection** — retry Spotify; assert it links onto the existing account and taste import succeeds.
  6. **Returning-user session** — close/reopen; assert the session resumes to the same identity with no
     redirect loop or stale-session error.
- **Data-integrity assertions.** After linking and after reconnection: exactly one `users.id`, the expected
  `accounts` rows, the expected `user_emails` rows (magic-link + Spotify email, one primary, `lower(email)`
  globally unique), and `music_connections` / `listener_discovery_preferences` / `listener_follows` /
  `curators` / saved items all still attached — the no-reset guarantee, checked, not assumed. Also assert that
  signing in via the *secondary* (Spotify-sourced) email resolves to the same account.
- **Failure-state coverage.** Drive each PRD 37 state and assert the recoverable copy/action renders.
- **Reliability checklist.** Distill the above into a checklist (in the epic + this PRD) that PRDs 35–37 are
  graded against during `/ship`.

## Implementation Status

**Shipped (June 18, 2026).** Delivered:

- **The runbook** — [`account-signin-linking-reliability-checklist.md`](../account-signin-linking-reliability-checklist.md):
  the supported browser/device matrix (Chromium/Firefox/WebKit desktop + mobile, plus the embedded-webview /
  cookies-blocked `browser_fallback` cases), a step-by-step repeatable script for all six legs (sign-in,
  linking both directions, access request, approval, reconnection, returning-user session incl. the
  secondary-email resolve), the PRD 37 failure-state coverage table, and the Phase 15 reliability checklist
  `/ship` grades against (referenced from the epic).
- **Automated no-reset data-integrity assertions** (the "harness where practical") — `lib/account-integrity.ts`
  (pure): `checkAccountIntegrity(snapshot, expectation)` returns the list of violations, enforcing exactly one
  `users` row, all `accounts`/`user_emails` on that id, one primary email, globally-unique `lower(email)`,
  both the magic-link and Spotify-sourced emails present, and **no orphaned/re-keyed** `user_id`-keyed data.
  Unit-tested (`npm run test:account-integrity`, 7 cases). The cross-browser pass snapshots rows after linking
  + reconnection and runs them through this — the no-reset guarantee checked, not assumed.
- **Failure-state coverage** — each PRD 37 state's mapping is asserted by `npm run test:auth-failures`.
- **Executed cross-browser harness** — `playwright.config.ts` + `e2e/auth-recovery.spec.ts` (`npm run test:e2e`)
  drive the **real** `app/auth/error` route across **Chromium (Blink) + Firefox (Gecko)**, asserting every
  failure state renders its title + recoverable action (and no "merge anyway" shortcut, and that unknown
  errors degrade rather than dead-end) — **16 assertions green, actually run**, not just documented. WebKit
  needs system libraries not installable in this sandbox, so it (plus mobile / in-app-webview and the live
  OAuth + magic-link legs) stays the documented manual cell in the runbook.
- `$0` (free local browsers, no paid cross-browser cloud service); typecheck/lint/tests green.

**Scoped out (PRD 38 Non-Goal — "does not alter the loop"):** wiring the staged PRD 35 sign-in *resolution*
(the `PostgresAdapter` `getUserByEmail` wrapper + the explicit linking callback) is a behavior change, so it is
a tracked follow-up to be wired **and** validated live with this runbook — not part of this observe-only
capstone. The live manual cross-browser execution itself is the documented pass operators run; this cycle
ships the repeatable instrument and the automatable assertions.

## Dependencies

- **Depends on PRD 35, 36, 37** — it proves the loop those cycles build; it is the verification capstone and
  ships last.
- Uses the repo's existing test tooling and the `/verify` discipline; no new paid CI.

## Non-Goals

- Adding a paid cross-browser cloud testing service (`$0` — use local/free tooling and a documented manual
  pass).
- Load/performance testing or accessibility audit (separate concerns).
- Changing any auth/linking behavior — this cycle observes and asserts, it does not alter the loop.

## Acceptance Criteria

- A documented, repeatable test exists and passes across the supported matrix for all six legs (sign-in,
  linking, request, approval, reconnection, returning-user session).
- Data-integrity assertions confirm one `users` row, expected `accounts` rows, and no orphaned `user_id`-keyed
  data after linking and reconnection.
- Each PRD 37 failure state is exercised and shown to render recoverable guidance.
- The reliability checklist is recorded and referenced by the epic; `$0` (no paid testing service); new code
  Snyk-clean; typecheck/lint/tests green.
