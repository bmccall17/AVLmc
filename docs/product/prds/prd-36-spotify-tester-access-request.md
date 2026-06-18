# PRD 36: Spotify Tester-Slot Access Request

Phase 15 · Cycle 2 of 4. Driven by
[`account-signin-linking_desiredoutcomes.md`](../account-signin-linking_desiredoutcomes.md) (Outcome 2) under the
epic [`account-signin-linking-prd.md`](../account-signin-linking-prd.md). Built on the PRD 35 linking spine.

## Goal

**While Spotify is in Development Mode (a hard 25-user allowlist), let a not-yet-approved listener submit a clear
access request that hands the admin their Spotify email and a "pending" status, lets the admin add them to an
available tester slot, and lets the listener retry successfully onto their *existing* account — never a new
one.**

## Summary

Today a non-allowlisted tester hits a 403 → `SpotifyLimitedBetaAccessError` →
`SPOTIFY_LIMITED_BETA_MESSAGE` with **no way to ask for access**, and the 25-slot unblock is undocumented tribal
knowledge. This cycle turns the dead-end into a tracked request: the listener submits their Spotify account email
through a `requireUserId()`-gated endpoint; the request lands in an **admin-reviewed queue** (same shape as the
Phase 13 curator pending queue); the admin sees the Spotify email + "pending," adds the listener in the Spotify
Developer Dashboard's *User Management* (≤25), and marks the request slot-added. The listener retries, and
because of PRD 35 the successful connection links onto their **existing** account.

## Design / Approach

- **Schema (additive, `42P01/42703`-tolerant).** A small `spotify_access_requests` table:
  `user_id` (FK `users`), `spotify_email`, `status` (`pending` / `slot_added` / `approved` / `rejected`),
  `requested_at`, `resolved_at`, `note`. One open request per user. Follows the
  `db/migrate-missing-tables.sql` additive precedent.
- **Listener plane.** `requireUserId()`-gated `app/api/me/spotify-access-request`: POST submits the listener's
  Spotify email + "pending"; GET returns their current request status. The Connect-Spotify flow in
  `components/ListenerProfileButton.tsx`, when the beta state is hit, offers "Request access" instead of dead-
  ending — and shows "pending" / "added — retry now" on return.
- **Admin plane.** Extend `app/api/admin/*` + add a `components/admin/*Section.tsx` review panel (e.g.
  `SpotifyAccessSection`) listing pending requests with the listener's Spotify email and a one-click
  "mark slot-added," reusing the cookie-gated curator-review precedent. The panel restates the manual step:
  add the email to *User Management* in the Spotify dashboard (or apply for Extended Quota).
- **Retry lands on the existing account (via PRD 35).** Once approved in the Spotify dashboard, the listener's
  retry connects Spotify and links to their existing `users.id` — no duplicate identity, taste import now
  succeeds.
- **Honest messaging.** "Pending" is accurate; the message never implies instant access. The Spotify email is
  private to the listener + admin (no public/community exposure).

## Implementation Status

**Documented (June 17, 2026).** Not yet built.

Planned deliverables:
- `spotify_access_requests` schema (additive) + an `app/api/me/spotify-access-request` route.
- An admin review panel + `app/api/admin/*` endpoint surfacing the Spotify email and a slot-added action.
- Connect-Spotify "Request access" + status states in the profile UI.
- Operator doc note: how to add the email to Spotify *User Management* (≤25) / Extended Quota.
- System Registry registration; `generate:system-map`; `test:registry` green.

## Dependencies

- **Depends on PRD 35** — a successful retry after the slot add must land on the existing account.
- Reuses the Phase 13 curator pending-queue admin pattern (`app/api/admin/*` + `*Section.tsx`).
- Feeds PRD 37 (the "pending" and "request access" states are entries in the failure/recovery taxonomy) and
  PRD 38 (request → approval → reconnection is part of the proven loop).

## Non-Goals

- Automating the 25-slot add or lifting the cap in code (external Spotify Developer Dashboard / Extended-Quota
  action — this cycle *prompts and tracks* it).
- Notifying the admin by email (in-panel queue first; Resend email notification is a cheap optional add).
- Spotify writes; any paid dependency.

## Acceptance Criteria

- A non-allowlisted listener can submit an access request carrying their Spotify email and see "pending";
  exactly one open request per user.
- The admin sees the request + Spotify email in a review panel and can mark it slot-added.
- After the admin adds them in the Spotify dashboard, the listener's retry connects Spotify onto their existing
  account (no duplicate `users` row) and taste import succeeds.
- The Spotify email is private to listener + admin; no tokens/PII in public responses; `$0`; new code
  Snyk-clean; typecheck/lint/tests green.
