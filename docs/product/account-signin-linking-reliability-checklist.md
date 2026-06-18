# Phase 15 — Account Sign-In & Linking Reliability Checklist & Cross-Browser Runbook

Updated: June 18, 2026

The C4 capstone for the [Reliable Account Sign-In & Spotify Connection epic](account-signin-linking-prd.md)
([PRD 38](prds/prd-38-cross-browser-reliability-benchmark.md)). PRDs 35–37 make the account loop correct and
recoverable; this document **proves** it: a documented, repeatable cross-browser/device pass plus the
data-integrity assertions that catch regressions. It also back-fills the reliability checklist that PRDs 35–37
are graded against during `/ship`.

`$0` — no paid cross-browser cloud service. Use local browsers/devices and this runbook; automate the parts
that don't need live OAuth (the data-integrity invariants — see `lib/account-integrity.ts` /
`npm run test:account-integrity`).

> **The account loop is wired and live in code; this runbook is the live *proof*.** Signed-in OAuth linking
> is native Auth.js v5 behavior (verified in `next-auth@5.0.0-beta.31` `handle-login.js:130–138` — it calls
> `linkAccount` onto the current session user, no `allowDangerousEmailAccountLinking`); the
> `getUserByEmail` multi-email resolution is wired (`lib/auth-adapter.ts` → `auth.ts`); email collisions
> route to the PRD 37 `duplicate_account` recovery. PRD 38 stays observe-only — it does not change behavior;
> it *proves* the behavior that already ships. The one thing code can't self-prove is the live OAuth round-
> trip across real browsers/devices, which is exactly this pass.

## Supported browser / device matrix

| Engine | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| Chromium (Chrome, Edge, Brave) | ✅ | ✅ | Primary target. |
| Firefox (Gecko) | ✅ | ✅ | Verify third-party-cookie defaults don't break the OAuth round-trip. |
| WebKit (Safari) | ✅ | ✅ | Safari ITP / "Prevent cross-site tracking" is the most likely to expose cookie issues. |
| Embedded webview / in-app browser | ⚠️ fallback | ⚠️ fallback | Instagram/Facebook/TikTok in-app browsers, etc. Expected to hit `browser_fallback` → "open in your default browser." |
| Private / incognito with third-party cookies blocked | ⚠️ fallback | ⚠️ fallback | Same `browser_fallback` guidance. |

✅ = full loop must pass · ⚠️ fallback = must degrade to the PRD 37 `browser_fallback` recovery, not a silent dead-end.

## Repeatable loop script (run per matrix cell)

Run each leg signed out to start. Record pass/fail per browser. Where a DB check is noted, capture the rows and
run them through the data-integrity assertions below.

1. **Sign-in (magic link).** Enter email → receive the link → click it → land signed in. *Assert:* a `users`
   row + an `email`/`resend` `accounts` row + a primary `user_emails` row.
2. **Sign-in (Spotify).** From a fresh browser, Connect Spotify. *Assert:* either an account is created (if
   allowlisted) or the PRD 37 `spotify_limited_beta` recovery shows **Request access** (not a dead-end).
3. **Linking — email → Spotify.** Signed in via magic link, Connect Spotify. *Assert:* one `users` row, two
   `accounts` rows (`resend` + `spotify`), both emails in `user_emails` (one primary), `lower(email)` unique.
4. **Linking — Spotify → email.** Signed in via Spotify, add email access. *Assert:* same as leg 3 from the
   other direction.
5. **Access request → approval → reconnection.** As a non-allowlisted tester: submit a Spotify access request
   (PRD 36) → *assert* "pending" + admin sees it at `/admin/spotify-access` → admin adds the email in the
   Spotify Developer Dashboard (User Management ≤25) and marks **slot-added** → listener retries → *assert* the
   connection lands on the **existing** account (no new `users` row) and taste import succeeds.
6. **Returning-user session.** Close and reopen the browser. *Assert:* the session resumes to the same
   identity — no redirect loop, no stale-session error. Then sign in via the **secondary (Spotify-sourced)**
   email and *assert* it resolves to the same account.

## Data-integrity assertions (the no-reset guarantee, checked)

After leg 3/4 (linking) and leg 5 (reconnection), snapshot the listener's rows and run them through
`checkAccountIntegrity` (`lib/account-integrity.ts`, unit-tested by `npm run test:account-integrity`). It must
return `{ ok: true }`, enforcing:

- Exactly **one** `users` row — no forked/duplicate identity.
- Every `accounts` row hangs off that id; all expected providers (`resend`, `spotify`) are linked.
- `user_emails`: every email on that id, **exactly one primary**, **no duplicate `lower(email)`**, and the
  magic-link **and** Spotify-sourced emails both present (so signing in with either resolves here).
- No orphaned / re-keyed `user_id`-keyed data — `music_connections`, `listener_discovery_preferences`,
  `listener_follows`, `curators`, saved items all still attached to the surviving id.

## Failure-state coverage (PRD 37 taxonomy)

Drive each state and confirm `app/auth/error` (or the in-profile surface) renders accurate copy + one
recoverable action — never a generic dead-end. The mapping is unit-tested by `npm run test:auth-failures`; the
manual pass confirms it renders per browser:

| State | How to trigger | Expected recovery |
| --- | --- | --- |
| `spotify_limited_beta` | Connect Spotify while not allowlisted | "invite-only" → **Request access** / use email |
| `access_denied` | Cancel the Spotify consent screen | "cancelled" → **retry** / use email |
| `duplicate_account` | Connect a Spotify whose email is on a different account | "already belongs to an account" → **sign in there, then link** (never "merge anyway") |
| `redirect_loop` | Interrupt/loop the sign-in | "didn't complete" → **sign out & retry** |
| `stale_session` | Resume with an expired session | "session expired" → **sign out & sign back in** |
| `browser_fallback` | Open in an in-app webview / cookies blocked | "open in your default browser" |

## Reliability checklist (graded during `/ship`)

PRDs 35–37 (and any future provider sprint) are graded against this:

- [ ] A second provider **never** creates a duplicate `users` row (legs 3–5 + integrity assertions).
- [ ] Any recorded, verified email resolves to the one account (leg 6 secondary-email check).
- [ ] No preferences / follows / curator status / saved items lost on linking (integrity assertions).
- [ ] Non-allowlisted tester can request access, be slot-added, and retry onto the existing account (leg 5).
- [ ] Every named failure state renders recoverable copy + one action across the matrix (failure-state table).
- [ ] Returning users resume to the same identity with no loop / stale-session dead-end (leg 6).
- [ ] `$0`; no Spotify writes; anonymous board payload + ranking unchanged; new code Snyk-clean;
      typecheck/lint/tests green.
