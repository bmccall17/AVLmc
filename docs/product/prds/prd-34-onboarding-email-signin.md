# PRD 34: Onboarding, Email Sign-in & Board Discoverability

Phase 14 (test-user-feedback fix). Driven by [`onboarding-signin_desiredoutcomes.md`](../onboarding-signin_desiredoutcomes.md).
Addresses three reported friction points: hidden/broken-feeling sign-in, an illegible curator empty state,
and a non-editable date window.

## Goal

**Give a first-time visitor a clear, Spotify-independent way to personalize and sign in — an email magic-link
account (persistent, no password, no Spotify) — present Spotify honestly as an optional invite-only beta, make
the curator directory legible when empty, and let a listener change the board's date range.** All `$0`,
anonymous-first, no Spotify writes.

## Summary

Spotify was the only sign-in path and it's gated by Spotify's Development Mode (25-user allowlist), so testers
who connected hit a 403 → "still in beta" notice and had no other way in. This cycle adds an **Auth.js Resend
email provider** (HTTP API, no new dependency, free tier) as the primary sign-in, reframes the profile entry
as onboarding, surfaces the anonymous local tuning that already works, and labels Spotify as optional
invite-only beta *before* OAuth. It also fixes the low-contrast curator empty state and adds a client-side
date-range control (the rolling window's events are already loaded, so it filters without a server/ingest
change).

## Implementation Status

**Shipped (June 17, 2026).**

Delivered:
- **Email magic-link auth** — `auth.ts` registers the built-in `Resend` provider
  (`next-auth/providers/resend`, no new package) gated on a new `email` flag in `lib/auth-flags.ts`
  (`AUTH_EMAIL_ENABLED` + `AUTH_RESEND_KEY` + `AUTH_EMAIL_FROM`; off until configured). Reuses the existing
  `users`/`accounts`/`sessions`/`verification_token` tables + `PostgresAdapter`. The `signIn` event now only
  records a music connection for `provider === "spotify"` (email sign-in creates no bogus `accounts` row);
  the anonymous→account hand-off (`migrateSessionSignalsToUser`) still runs for all providers.
- **Onboarding + email UI** — `components/ListenerProfileButton.tsx`: guest entry relabeled "Personalize your
  board," a one-line explanation, an email sign-in form (`signIn("resend", { email, redirect:false })`) with
  send/sent/error states, and the anonymous-tuning framing.
- **Honest Spotify gating** — Connect Spotify is now a secondary "Connect Spotify (optional)" control with an
  up-front "invite-only beta · taste import for approved accounts only" note; `SPOTIFY_LIMITED_BETA_MESSAGE`
  reworded to point at email/local tuning, never a dead-end. (The 25-user cap itself is lifted externally via
  the Spotify Developer Dashboard / Extended Quota — documented in the desired-outcomes doc.)
- **Legible curator empty state** — `app/curators/page.tsx` empty state rewritten with a readable
  `.curators-directory-empty` block (`app/globals.css`) inviting the viewer to be the first curator.
- **Editable date window** — `components/EventBoard.tsx` gains a "Dates" filter (Full window / Next 7 / Next
  14 days) that filters the already-loaded events within the rolling horizon and updates the window label
  (hero + toolbar). No server/ingest change.

## Non-Goals

- Lifting the Spotify 25-user cap in code (external dashboard / Extended Quota action).
- Widening the ingest horizon beyond ~21 days (the date control narrows within it).
- Spotify writes, new ranking signals, any paid dependency.

## Operator setup (email)

To turn email sign-in on: create a Resend account (free tier), verify a sender domain, then set
`AUTH_EMAIL_ENABLED=true`, `AUTH_RESEND_KEY=<key>`, `AUTH_EMAIL_FROM="AVLmc <login@yourdomain>"`. Until then the
`email` flag is off and the UI hides the email form gracefully.

## Acceptance Criteria

- A signed-out visitor can request an email link and sign in to a persistent account without Spotify; tuned
  anonymous signals carry over.
- Spotify reads as optional invite-only beta and never dead-ends.
- The curator empty state is legible and links to apply.
- The date range can be narrowed and the window label updates.
- `$0`; anonymous board payload + ranking unchanged; typecheck/lint/tests green; new code Snyk-clean.
