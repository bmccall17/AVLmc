# PRD 37: Auth & Linking Failure Recovery

Phase 15 · Cycle 3 of 4. Driven by
[`account-signin-linking_desiredoutcomes.md`](../account-signin-linking_desiredoutcomes.md) (Outcome 3) under the
epic [`account-signin-linking-prd.md`](../account-signin-linking-prd.md). Recovers the states PRD 35's linking
and PRD 36's request flow expose.

## Goal

**Replace every dead-end auth/linking failure with accurate guidance and a concrete recoverable next step.**
"Beta testing," access-denied, redirect-loop, stale-session, duplicate-account, and browser-specific fallback
states must each tell the listener exactly what happened and exactly what to do — never a generic unresolved
error.

## Summary

Today failures collapse into one of two dead-ends: `app/auth/error/page.tsx` redirects everything to
`/?spotify=<code>`, and `SPOTIFY_LIMITED_BETA_MESSAGE` tells testers to "use email" with no request channel.
This cycle introduces a **typed failure taxonomy** — a pure, unit-tested mapping from each failure code to
`{ title, message, action }` — and routes every auth/linking failure through it. The Spotify beta state and the
generic `/auth/error` redirect become entries in this table, each pointing at a real next step: request access
(PRD 36), re-send the magic link, sign into the matching account first then link (PRD 35), clear a stale
session, or open in a supported browser.

## Design / Approach

- **Failure taxonomy (`lib/auth-failures.ts`, pure + unit-tested).** Enumerate the states and map each to copy +
  a recoverable action:
  - **`spotify_limited_beta`** → "invite-only beta" → **Request access** (PRD 36) / use email / local tuning.
  - **`access_denied`** (user cancelled or scope refused) → "Spotify connection was cancelled" → retry / use
    email.
  - **`oauth_account_not_linked` / `duplicate_account`** → "this Spotify email already belongs to an account" →
    **sign into that account first, then connect** (the PRD 35 link path) — never a silent merge.
  - **`redirect_loop`** → "sign-in didn't complete" → clear-and-retry guidance.
  - **`stale_session`** → "your session expired" → a one-click sign-out/refresh that clears the stale
    `sessions` row and re-initiates.
  - **`browser_fallback`** → detect cookie-blocked / embedded-webview / third-party-cookie failures → "open in
    your default browser" guidance (informs PRD 38's matrix).
- **Route every failure through it.** `app/auth/error/page.tsx` reads the Auth.js `error` param and renders the
  matching taxonomy entry (a real recovery page) instead of a blind redirect. The Spotify beta surface and the
  profile UI pull copy/actions from the same table so messaging can't drift.
- **Accurate, not alarming.** Copy distinguishes a *limitation* (beta cap — requestable) from an *error*
  (cancelled / expired — retryable) from a *conflict* (duplicate — resolvable by linking). Each carries exactly
  one primary action.
- **No takeover shortcuts.** The duplicate-account path never offers "merge anyway"; it routes to authenticated
  linking (PRD 35).

## Implementation Status

**Shipped (June 18, 2026).** Delivered:

- **Typed failure taxonomy** (`lib/auth-failures.ts`, pure): the single source of truth mapping each
  `AuthFailureCode` (`spotify_limited_beta`, `access_denied`, `duplicate_account`, `redirect_loop`,
  `stale_session`, `browser_fallback`, + an honest `unknown` default) → `{ severity, title, message,
  action, secondaryAction? }`, each with exactly one primary recoverable action. `resolveAuthFailure`
  maps both Auth.js `?error=` params (`AccessDenied`, `OAuthAccountNotLinked`, `SessionRequired`,
  OAuth callback errors → the dev-mode beta path) and our own codes, case-insensitive, degrading to
  `unknown` instead of a dead-end. Severities split *limitation* (beta — requestable) vs. *error*
  (cancelled/expired — retryable) vs. *conflict* (duplicate — sign-in-then-link). The canonical
  Spotify copy is reused from `lib/spotify-limited-access.ts` so the beta surface can't drift.
  Unit-tested (`npm run test:auth-failures`, 6 cases incl. the no-"merge anyway" guard).
- **Real recovery page** — `app/auth/error/page.tsx` now reads `?error=`/`?code=` and renders
  `components/AuthRecovery.tsx` (the matching taxonomy entry + action buttons), replacing the old
  blind redirect to `/?spotify=<code>`. Client actions: retry Spotify (`signIn`), clear a stale
  session (`signOut`), or navigate (request access / use email / sign-in-then-link / open browser).
  Severity-tinted styling in `app/globals.css`.
- **No takeover shortcut** — the `duplicate_account` entry's only action is *sign into that account,
  then connect* (the PRD 35 link path); there is no "merge anyway" anywhere (asserted in the test).
- `spotify_limited_beta` resolves to **Request access** (the PRD 36 flow); the profile beta surface
  and the recovery page share the one canonical message. No registry change needed (pure helper +
  a page; only API routes/datastores are registry nodes). `$0`; Snyk-clean (0 issues);
  typecheck/lint/`test:registry`/`test:auth-failures` green.

Browser-fallback *detection* (which signal trips `browser_fallback`) and the end-to-end assertion
that each state renders its recoverable copy are exercised in the C4 cross-browser pass.

## Dependencies

- **Depends on PRD 35** — the duplicate-account recovery action routes into authenticated linking.
- **Coordinates with PRD 36** — `spotify_limited_beta` resolves to "Request access."
- Feeds **PRD 38** — the browser-fallback detection defines part of the supported-browser matrix; the test
  asserts each state shows its recoverable copy.

## Non-Goals

- Building the request flow itself (PRD 36) or the linking mechanics (PRD 35) — this cycle owns the *recovery
  surface and copy*, not the underlying actions.
- Localizing copy beyond English; analytics on failure rates (a possible later add).
- Spotify writes; any paid dependency.

## Acceptance Criteria

- Each named state (`spotify_limited_beta`, `access_denied`, `duplicate_account`/`oauth_account_not_linked`,
  `redirect_loop`, `stale_session`, `browser_fallback`) renders accurate copy + exactly one recoverable action;
  the mapping is unit-tested.
- `app/auth/error` shows a real recovery page, not a blind redirect; no generic dead-end remains.
- The duplicate-account path routes to authenticated linking, never a silent merge or "merge anyway."
- Copy is sourced from one table (no drift between the error page, beta surface, and profile UI); `$0`; new code
  Snyk-clean; typecheck/lint/tests green.
