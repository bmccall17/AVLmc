# PRD 29: Sign-In Chooser & Pre-Redirect Gate

Part of the [Open Spotify Access initiative](../spotify-access-prd.md) (Phase 13, provisional). Cycle **C2** (the centerpiece). Satisfies epic outcomes **1 (no silent losses)** and **5 (every auth surface is the product's own)**. Depends on **C1 (PRD 28)** — the chooser's "Request access" path and the gate's approved-tester read both call C1's machinery.

## Goal

**Put the tester offer at the exact moment Spotify intent is expressed: replace every direct `signIn("spotify")` call with one chooser that either passes an approved tester straight through to Spotify, or captures everyone else's interest before Spotify's Development-Mode 403 can strand them — and make the sign-in surface the product's own instead of NextAuth's default.**

## Summary

One `SignInChooser` component (modal on in-page triggers; also rendered as the custom `pages.signIn` page) offering three doors: **Continue with Spotify**, **Request Spotify access** (C1's form, inline), and **Sign in with email**. Before any Spotify redirect, a gate check runs against `tester_requests` (approved/invited) — signed-in users by their account email, anonymous users by a one-field email step that doubles as form pre-fill on a miss. A single `SPOTIFY_OPEN_ACCESS` flag collapses the gate for the post-quota era. All five current `signIn("spotify")` call sites route through the chooser.

## Implementation Status

**Not started.**

## Goals

- A single chooser component used everywhere Spotify sign-in is currently triggered: `SaveButton`, `FollowButton`, `EventBoard` (sign-in nudge), `ListenerProfileButton`, `MusicAccountPanel` — plus any additional call sites found in the pulled code.
- Pre-redirect gate: only emails with `tester_requests.status ∈ {approved, invited}` (or any email when `SPOTIFY_OPEN_ACCESS=true`) proceed to `signIn("spotify")`; everyone else lands on the request form with email pre-filled, without leaving the page.
- Custom `pages.signIn` rendering the same chooser, so no funnel state shows NextAuth's unstyled default (the page observed in the July 2 audit).
- Preserve every call site's post-auth intent: existing `callbackUrl` / `redirectTo` semantics (e.g. EventBoard's keep-intent param) flow through the chooser unchanged.
- Fallthrough honesty: if a gated-through user still 403s at Spotify (dashboard drift), the return path — or its absence — is handled: the `/auth/error` invite-only copy references the request they already have on file.

## Non-Goals

- **No** change to linking behavior or error-page linking copy — that's C3 (PRD 30).
- **No** removal of the email door anywhere: email sign-in remains the universal path on every chooser render.
- **No** server-side Spotify allowlist automation (none exists); the gate mirrors C1's table only.
- **No** redesign of the surfaces that trigger the chooser — their buttons keep their look; only the target changes.

## Requirements

### `SignInChooser` component

- Three options, in order: **Continue with Spotify** (primary for taste-sync contexts), **Sign in with email** (always present, never demoted to fine print), **Request Spotify access** (shown only when `SPOTIFY_OPEN_ACCESS=false`).
- Renders as: (a) a modal invoked from in-page triggers, and (b) the full-page custom `pages.signIn`. One component, two shells.
- Copy voice matches the deployed error pages ("Spotify is optional — everything else works with email").
- Carries the invoking surface as `source` into any tester request it spawns (per C1's `source` field).

### Gate check

- `POST /api/spotify-gate` (or server action): input email (or session), output `allowed | not_found | pending | declined`. Reads C1's helpers; when `SPOTIFY_OPEN_ACCESS=true` always `allowed`. Rate-limited like C1's endpoint.
- Signed-in user clicking Continue-with-Spotify → gate uses session email silently; `allowed` → straight to `signIn("spotify")` with the surface's original callback.
- Anonymous user → one email field ("Spotify beta is invite-only — enter your email to check your seat / apply") → `allowed` proceeds; `not_found` flips to the request form pre-filled; `pending` shows "your request is in — we'll email you"; `declined` shows the request-form path with honest copy.
- The email entered for the gate is used only for the check and optional pre-fill (stated inline) — no silent list-building.

### Call-site migration

- All five known `signIn("spotify")` call sites route through the chooser, preserving each one's callback/redirect intent. A repo-wide grep in the pulled code confirms no direct call remains outside the chooser itself; add a lint-style guard test asserting `signIn("spotify")` appears only in the chooser module.

### Flag & config

- `SPOTIFY_OPEN_ACCESS` added to `lib/auth-flags.ts` (same `isEnabled` pattern) + `.env.example`. `true` ⇒ chooser hides "Request access" and gate always allows. The C4 flag-flip runbook points here.

### Architecture & quality

- Register the chooser + gate in `lib/system-registry.ts`; regenerate the system map; `test:registry` green.
- Unit tests for gate outcomes (all four statuses × flag on/off) as `test:spotify-gate`; the guard test above; lint, typecheck, `next build` green.

## Dependencies

- **C1 (PRD 28)** — `tester_requests` store, request form/API, statuses.
- The pulled deployed auth stack (Resend provider, `/auth/error` pages) — **build after `git pull`.**
- Existing surfaces listed above (Phase 5–12 components).

## Risks

- **Friction for approved testers** (anonymous ones must type an email before redirect). Accepted: it's one field, once per browser (remember the allowed email client-side), and signed-in users skip it entirely.
- **Gate/dashboard drift** still possible (approved here, missing there) — the fallthrough requirement keeps it visible instead of silent; reconciliation stays a C1 admin concern.
- **Email enumeration** via gate responses — low stakes (statuses reveal only beta-list membership), mitigated by rate limiting and neutral `declined` copy.
- **Missed call site** reintroducing the stranding bug — mitigated by the grep + guard test.

## Acceptance Criteria

- With `SPOTIFY_OPEN_ACCESS=false`: an anonymous non-tester clicking any Spotify entry point ends up on the request form with their email pre-filled, having never left AVLmc or seen a Spotify error; an approved tester (signed-in or remembered) reaches Spotify consent directly with their original post-auth intent intact.
- With `SPOTIFY_OPEN_ACCESS=true`: every user reaches Spotify directly; no gate call executes; "Request access" is absent.
- `/api/auth/signin` renders the product chooser, not the NextAuth default.
- No direct `signIn("spotify")` outside the chooser module (guard test green); `test:spotify-gate`, `test:registry`, typecheck, lint, `next build` green.

## Test Scenarios

- Gate matrix: `{not_found, pending, declined, allowed}` × `{flag off, flag on}` → correct outcome each cell.
- EventBoard keep-intent: gated tester completes Spotify sign-in → original `?intent=going:<eventId>` callback executes as today.
- Anonymous allowed email remembered → second Spotify action skips the email step.
- Signed-in email-account user, not a tester, clicks Continue-with-Spotify → request form pre-filled from session, no redirect.
- Guard test fails if a new component calls `signIn("spotify")` directly.
