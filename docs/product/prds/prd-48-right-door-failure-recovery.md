# PRD 48: Right-Door Failure Recovery

Part of the [Auth Durability Hardening initiative](../auth-durability-prd.md) (Phase 19). Cycle
**C2** (pure taxonomy work). Closes audit findings **F3 + F4** (Medium) from the
[July 8, 2026 auth durability audit](../auth-durability-audit-2026-07-08.md). Sequenced after C1
(PRD 47) so the failure copy is final before C3 surfaces it in new environments; no code
dependency.

## Goal

**Every auth failure recovers through the door the listener actually used.** An email user with a
dead magic link gets a fresh-link path — never the Spotify gate. A Google user whose callback
failed gets provider-neutral retry copy — never "Spotify import is invite-only."

## Summary

The failure taxonomy (`lib/auth-failures.ts`, PRD 37) predates two realities: the email door's
own expiry failure, and a second OAuth provider. Today Auth.js's `?error=Verification` (expired
**or already-consumed** magic link — the exact path scanner-prefetched links hit; Outlook
SafeLinks-class scanners GET the link and burn the one-time token) has no mapping, so it falls to
`unknown`, whose primary action renders the **SpotifyGateButton**. And the generic OAuth error
params (`oauthcallbackerror` / `oauthsignin` / `callback`) all map to `spotify_limited_beta`,
which was accurate when Spotify was the only OAuth door — Google went live July 8, 2026, and its
failures now show Spotify-beta copy with a "Request Spotify access" CTA. This cycle adds two
entries to the one table and remaps; no new surface, no behavior change to successes.

## Implementation Status

**Planned.**

## Background: evidence

- Audit F3: `resolveAuthFailure` has no `verification` case; prod carries 12 verification tokens,
  11 expired-unclaimed. Repro: click a magic link twice (or after 24h) → error page offers
  Spotify.
- Audit F4: Google enabled in prod (env + live gate config checked); a failed Google callback
  renders "Spotify import is invite-only right now."
- Auth.js does not include the provider in the error redirect param, so provider-specific copy for
  generic OAuth errors is not reliably possible — neutral copy is the honest fix.

## Goals

- **New entry `expired_link`** (severity `error`): title/message stating the link expired or was
  already used (links are one-tap and expire in 24 hours; mention that some corporate mail
  scanners can consume them), primary action `use_email` ("Email me a fresh link", href `/` — the
  chooser's email door), secondary `go_home`. Map Auth.js `verification` to it.
- **New entry `oauth_interrupted`** (severity `error`): provider-neutral "that sign-in didn't
  complete" copy; primary action a link back to `/auth/signin` (retry through the chooser — the
  gate still protects the Spotify door there), secondary `use_email`. Remap `oauthcallbackerror`,
  `oauthsignin`, and `callback` to it.
- `spotify_limited_beta` remains reachable **only** from the app's own explicit codes
  (`spotify_limited_beta`, `spotify_limited_beta_access`) — the gate and the 403 mapping in the
  API layer still raise those directly, so the beta story is untouched where it's true.
- `AuthRecovery` renders both new entries with existing action kinds where possible; if a new
  action kind is needed (e.g. `retry_signin` as a plain link to `/auth/signin`), it's a
  navigation-kind addition, not a new client behavior.
- Copy honors the taxonomy contract: accurate title + message, exactly one primary recoverable
  action, optional secondary. No dead ends.

## Non-Goals

- **No** interstitial "confirm sign-in" page for scanner-proofing magic links (the full F3
  mitigation) — deferred until there's evidence of real users hitting scanner-burned links;
  `expired_link`'s copy makes the failure self-explanatory in the meantime.
- **No** per-provider copy for generic OAuth errors (the error param doesn't carry the provider —
  don't guess).
- **No** change to `access_denied`, `duplicate_account`, `redirect_loop`, `stale_session`,
  `browser_fallback`, or the Spotify-gate flow.

## Requirements

### `lib/auth-failures.ts`

- Two new `AuthFailureCode`s + `AUTH_FAILURES` entries + `resolveAuthFailure` mappings as above;
  `unknown` remains the default for genuinely unknown input, and its primary action should also be
  reviewed — with two OAuth providers, its `retry_spotify` action is wrong for the same F4 reason;
  point it at the chooser instead.

### Surfaces (no new ones)

- `app/auth/error/page.tsx` and `app/auth/signin/page.tsx` render the new entries via the
  existing components — verify both paths (`?error=Verification` arrives on the error page;
  Auth.js also sends some errors to the sign-in page's `?error=`).
- `components/AuthRecovery.tsx`: handle any new action kind as a plain navigation link.

### Tests

- `tests/auth-failures.test.ts`: `verification` → `expired_link`; `oauthcallbackerror` /
  `oauthsignin` / `callback` → `oauth_interrupted`; explicit spotify codes still →
  `spotify_limited_beta`; case-insensitivity preserved; every entry still has exactly one primary
  action.
- `e2e/auth-recovery.spec.ts`: add the `?error=Verification` render (correct copy, email action,
  **no** Spotify CTA in the DOM).

### Architecture & quality

- No registry change expected (same nodes); typecheck / lint / `test:auth-failures` / e2e /
  Snyk on touched files green.

## Risks

- **Copy regressions in shipped flows.** The remap removes Spotify-beta copy from paths that
  today *sometimes* correctly describe a Spotify dev-mode failure (a seated-but-dashboard-drifted
  user's callback error). Accepted: those users still reach the gate via retry, and the gate —
  not the error page — is the honest place to learn seat state. The `unknown`-action review is
  the same trade.
- **Auth.js error-param drift** (v5 beta): the mapping is input-tolerant by design
  (case-insensitive, defaults to `unknown`); tests pin today's params so an upgrade that renames
  them fails loudly.

## Acceptance Criteria

- Clicking a consumed or expired magic link lands on "link expired" copy with a working
  fresh-link path; no Spotify copy or CTA anywhere in that flow.
- A generic OAuth callback failure (either provider) shows neutral retry-or-email copy; Spotify
  beta copy appears only for the explicit spotify gate codes.
- Taxonomy contract holds for every entry (unit-asserted); e2e recovery spec green in Chromium +
  Firefox.
- typecheck / lint / `test:auth-failures` / `test:e2e` green; touched files Snyk-clean.

## Test Scenarios

- `resolveAuthFailure("Verification")` (any case) → `expired_link` with `use_email` primary.
- `resolveAuthFailure("OAuthCallbackError")` → `oauth_interrupted`; `("spotify_limited_beta")` →
  unchanged beta entry.
- e2e: `/auth/error?error=Verification` renders expired-link copy; email action navigates to the
  chooser with the email door available.
- Regression: `/auth/error?error=OAuthAccountNotLinked` still renders `duplicate_account`.
