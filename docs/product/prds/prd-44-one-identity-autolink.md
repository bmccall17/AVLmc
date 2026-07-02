# PRD 44: One Identity — Auto-Link & Recovery

Part of the [Open Spotify Access initiative](../spotify-access-prd.md) (Phase 17). Cycle **C3** (small, surgical). Satisfies epic outcome **4 (one person, one account, no dead ends)**. Depends on **C2 (PRD 43)** for sequencing only — the copy/UX it touches should land once, after the chooser exists.

## Goal

**Make the two sign-in doors converge on one account automatically: a listener who started with email and later gets Spotify access (or the reverse) ends up with a single `users` row, their preferences intact, and `OAuthAccountNotLinked` unreachable in every supported flow.**

## Summary

Enable `allowDangerousEmailAccountLinking: true` on the Spotify provider — safe here because both doors prove email ownership (Spotify verifies emails; a Resend magic link *is* possession of the inbox). Verify link-while-signed-in end-to-end as the second convergence path. Update the `/auth/error` `OAuthAccountNotLinked` copy from the "we never merge accounts behind your back" stance to the new truth, keeping that page as the honest handler for the one remaining edge (Spotify email ≠ account email). Codify convergence and edge behavior in tests.

## Implementation Status

**Not started.**

## Background: the observed failure and the stance change

Production, July 2, 2026: the owner — whose account email matched an existing email-door `users` row — signed in fresh via Spotify and was bricked with `OAuthAccountNotLinked` on the default NextAuth page. The strict no-auto-link posture was a deliberate, defensible privacy stance encoded in the deployed error copy; the product owner has now explicitly traded it for automatic convergence (decision recorded in the epic), because both providers verify the email and the manual recovery loop ("sign in with the other method, then connect") is exactly where real users abandon.

## Goals

- `allowDangerousEmailAccountLinking: true` on the Spotify provider in `auth.ts`, with an inline comment stating the justification (both providers verify email) and a pointer to this PRD.
- Link-while-signed-in verified: a signed-in email user completing Spotify OAuth links to their current account (NextAuth v5 database-session behavior) — confirmed against the pulled code and covered by a test scenario, since the chooser (C2) routes signed-in users this way.
- `events.signIn` side effects (`recordMusicConnection`, anonymous-session signal migration) confirmed to run identically on a *link* as on a fresh sign-in — tokens stored, taste sync primed, preferences continuous.
- Copy updates, same commit as the behavior change: the `OAuthAccountNotLinked` error page becomes the handler for the email-mismatch edge only ("your Spotify account uses a different email than your AVLmc account — sign in with your email, then connect Spotify from your profile"); any other "never merge" phrasing in the funnel is reconciled.
- Convergence tests: email-first → Spotify-later and Spotify-first → email-later both resolve to one `users` row with one linked `accounts` row per provider.

## Non-Goals

- **No** change to session strategy, adapter, scopes, or token handling — `lib/music.ts` refresh machinery is untouched.
- **No** UI for manual account merging of genuinely different-email accounts (out of scope; the recovery path covers it).
- **No** unlinking/disconnect UX changes beyond what exists (`MusicAccountPanel` disconnect stays as-is).

## Requirements

### `auth.ts`

- Spotify provider gains `allowDangerousEmailAccountLinking: true` + justification comment.
- Confirm `pages.signIn` (from C2) and `pages.error` both hold under the new flow; no path renders a NextAuth default.

### Convergence behavior (verified + tested)

- Email-first user, signed **out**, signs in with Spotify (same email) → lands in the same account; `accounts` gains the spotify row; `music_connections` populated via the existing `events.signIn`.
- Email-first user, signed **in**, connects Spotify from `MusicAccountPanel` → same result (link path).
- Spotify-first user later uses an email magic link (same address) → same single account.
- Email-mismatch edge → `/auth/error?error=OAuthAccountNotLinked` renders the updated copy with the working recovery path (email sign-in → profile connect), which is itself tested.

### Copy

- `OAuthAccountNotLinked` page: new heading/body per the stance change; "sign into that account, then connect" remains as the mismatch-edge instruction, now accurate rather than the default answer.
- Audit the funnel (chooser, error variants, `/spotify-access`) for any residual "never merge" phrasing; reconcile in this cycle.

### Architecture & quality

- Convergence scenarios as `test:one-identity` (adapter-level with a test pool, per the house focused-suite pattern); update the auth node description in `lib/system-registry.ts`; regenerate system map; `test:registry`, typecheck, lint, `next build` green.

## Dependencies

- **C2 (PRD 43)** — sequencing; the chooser is the surface whose copy and routing this cycle finalizes.
- The pulled deployed auth stack (Resend provider, error pages) — **build after `git pull`.**
- NextAuth v5 beta + `@auth/pg-adapter` (existing).

## Risks

- **Account-takeover surface widens if a provider ever stops verifying emails.** Recorded assumption: Spotify verifies; Resend links prove inbox possession. Revisit if a third provider (Google/YouTube, Apple Music flags exist) is enabled — each new provider must re-justify auto-link explicitly.
- **`OAuthAccountNotLinked` still reachable via email mismatch** — by design; the page now explains it honestly. Watch for volume in logs; if common, a future cycle can add an in-profile "connect with a different email" explainer.
- **Beta-adapter behavior drift** (NextAuth v5 beta): the convergence tests pin today's linking semantics so an upgrade that changes them fails loudly.

## Acceptance Criteria

- The July 2 failure is unreproducible: the owner's exact flow (existing email account, fresh Spotify sign-in, matching email) lands signed-in on one account with Spotify connected and taste sync running.
- Both convergence directions and the link-while-signed-in path each yield exactly one `users` row and correctly-linked `accounts` rows (tests green).
- The email-mismatch edge renders the updated error page whose recovery instructions work end-to-end.
- No "never merge behind your back" phrasing remains anywhere in the funnel.
- `test:one-identity`, `test:registry`, typecheck, lint, `next build` green.

## Test Scenarios

- Email-first + signed-out Spotify sign-in (same email) → one user, spotify `accounts` row added, `music_connections` row written, session established.
- Spotify-first + later magic link (same email) → one user; no duplicate.
- Signed-in connect from profile → links to session user even before considering email (v5 link path).
- Mismatched email → error page with recovery copy; completing the recovery (email sign-in → profile connect) succeeds and yields one user with both methods.
- Regression: anonymous-session signal migration still fires exactly once per sign-in event on the link path.
