# PRD 28: Tester Request Loop

Part of the [Open Spotify Access initiative](../spotify-access-prd.md) (Phase 13, provisional). Cycle **C1** (first of four). Satisfies epic outcomes **2 (the owner hears about every request)** and **3 (the loop closes)**. No dependencies on other cycles; ships standalone value by wiring the currently-dead "Request Spotify access" button on the deployed `/auth/error` page.

## Goal

**Never lose a would-be tester again: capture every expressed interest in Spotify access as a durable request, notify the owner by email the moment it happens, and give the owner a one-click admin path from "pending" to "approved + invited" that respects Spotify's 25-seat Development Mode budget.**

## Summary

A `tester_requests` table (email-unique, upsert-on-reapply), a public request API + minimal form page, a Resend notification to the owner on every new request, an invite email to the applicant on approval, and a password-gated admin panel section listing requests with status controls and a seat counter. This cycle builds the machinery; PRD 29 later moves the *offer* to the sign-in prompt itself. Until then, the existing error-page button and a linkable `/spotify-access` page start capturing intent immediately.

## Implementation Status

**Not started.**

## Goals

- A durable, deduplicated store of tester interest: email, optional note, source surface, status lifecycle.
- Owner notification email (via the existing Resend integration) within the request transaction path — fire-and-forget, never blocking the applicant's confirmation.
- A public `/spotify-access` page: what the beta is, the form (email + optional "what do you listen to?" note), and a clear promise — "we'll email you when your seat is ready."
- Wire the deployed `/auth/error` "Request Spotify access" button to this page (replacing the current homepage link).
- Admin: pending queue, approve/decline, seat counter (approved count / 25), and enforced-order copy ("allowlist in the Spotify dashboard **first**, then approve here").
- Invite email on approve: "you're in — sign in with Spotify now," linking to the sign-in surface.

## Non-Goals

- **No** pre-redirect gate or chooser — that interception point is PRD 29; this cycle only builds what it will call.
- **No** self-serve approval or automation against the Spotify dashboard (no API exists for the allowlist; reconciliation stays manual by design).
- **No** account creation on request — applicants usually have no account; convergence happens when they later sign in with the same email.
- **No** marketing/waitlist tooling beyond the single table and two emails.

## Requirements

### Storage (`lib/tester-requests.ts` + migration)

- `tester_requests`: `id serial pk`, `email text unique not null` (stored lowercased/trimmed), `note text null`, `source text not null default 'direct'` (e.g. `auth-error-page`, `spotify-access-page`, later `signin-chooser`), `status text not null default 'pending'` (`pending` | `approved` | `declined` | `invited` — `invited` = approve + invite-email sent), `created_at`, `updated_at`.
- Re-applying upserts: refreshes `updated_at` and `note`/`source` if provided, never duplicates, never demotes an `approved`/`invited` status back to `pending`.
- Pure helpers: `upsertTesterRequest`, `getTesterRequestByEmail`, `listTesterRequests`, `setTesterRequestStatus`, `countApprovedTesters` — unit-tested, following the existing `lib/*` + focused-test-script pattern.

### Public API + page

- `POST /api/tester-requests` — body `{ email, note?, source? }`; validates email shape, rate-limits per IP+email (reuse the existing anti-spam pattern from community contributions), upserts, returns `{ status }` so the form can say "you're already on the list" vs "request received."
- `/spotify-access` page — server component + small form; explains invite-only status in the voice of the deployed error page ("Spotify import is invite-only while we're in Spotify's beta program"), sets expectations ("we'll email you"), confirms on submit. Anonymous-accessible; if signed in, email pre-fills.
- Update the `/auth/error` `OAuthCallbackError` variant's "Request Spotify access" link target to `/spotify-access`.

### Emails (Resend)

- **Owner notification** on each new/re-activated request: applicant email, note, source, current pending count, deep link to the admin panel. Recipient from env (`TESTER_NOTIFY_EMAIL`), not hardcoded.
- **Invite email** on approve: subject "Your Spotify seat on AVL Music Companion is ready," body links to sign-in and states the account email must match the one approved. Sending flips status `approved → invited`.
- Both sends are best-effort with logged failures; a failed send never rolls back the state change (admin panel shows send state so the owner can retry).

### Admin (`app/api/admin/tester-requests/*` + admin panel section)

- List (pending first, then invited/approved/declined), with note, source, timestamps.
- Approve / decline actions; approve surfaces the enforced-order reminder ("added to the Spotify dashboard allowlist first?") before confirming, then sends the invite email.
- Seat counter: `approved + invited` count against the 25-seat Development Mode budget, with a visible warning at 22+.

### Architecture & quality

- Register `/spotify-access`, the API, and the admin section in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` green.
- Unit tests for the request-store helpers (upsert semantics, status guard rails, lowercase normalization) as `test:tester-requests`; lint, typecheck, `next build` green.
- No new paid dependency; Resend already in production. $0 holds.

## Dependencies

- The deployed Resend integration (email provider + `AUTH_RESEND_KEY`) — **note: newer than the local checkout; this PRD is built after `git pull`.**
- Existing admin auth pattern (`app/api/admin/*`) and anti-spam/rate-limit pattern (Phase 2/3).
- Neon Postgres (migration).

## Risks

- **Notification fatigue / spam requests.** Rate-limiting + upsert semantics mean one email per genuine new interest; declined stays declined on re-apply (no re-notification) unless the owner re-opens.
- **Seat budget drift** between the dashboard and the table — mitigated by the enforced-order copy, the counter, and manual reconciliation being a two-list diff of ≤25 emails.
- **Email deliverability** (invite lands in spam) — accepted at this scale; admin panel shows invited status so a manual follow-up is possible.

## Acceptance Criteria

- Submitting the form (or the error-page path) as a new email → row created `pending`, owner receives one notification email, applicant sees confirmation. Re-submitting → no duplicate row, no duplicate notification, `updated_at` refreshed.
- Admin approve (after dashboard allowlist) → status `invited`, applicant receives the invite email, seat counter increments.
- Declined emails can re-apply without re-notifying; owner can re-open from the panel.
- `test:tester-requests`, `test:registry`, typecheck, lint, and `next build` all green; system map regenerated.

## Test Scenarios

- Upsert: same email twice → one row; second submit updates `note`/`updated_at` only; status untouched.
- Status guard: re-apply on an `invited` email → stays `invited` (never demoted), no owner notification.
- Normalization: `BRett@X.com ` and `brett@x.com` are one row.
- Rate limit: burst submissions from one IP → 429 after threshold; store unchanged.
- Approve flow: `pending → invited` sends exactly one invite email; decline sends none.
- Counter: 25 approved+invited → warning state renders in the admin panel.
