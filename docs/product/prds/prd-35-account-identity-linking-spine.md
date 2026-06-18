# PRD 35: Account Identity & Linking Spine

Phase 15 · Cycle 1 of 4. Driven by
[`account-signin-linking_desiredoutcomes.md`](../account-signin-linking_desiredoutcomes.md) (Outcome 1) under the
epic [`account-signin-linking-prd.md`](../account-signin-linking-prd.md). The spine every Phase 15 cycle plugs
into.

## Goal

**Give a signed-in listener an explicit, merge-safe way to connect their *other* sign-in method so both resolve
to one AVL Music Companion identity — no duplicate `users` row, no lost preferences/activity.** A magic-link
listener can connect Spotify; a Spotify listener can add email access; both land back on the same account. **An
account holds multiple verified emails** — the magic-link email plus the email each linked music platform
returns — and *any* of them resolves to the same single account.

## Summary

Phase 14 shipped two providers (`Resend`, `Spotify`) but no link path. Because `users.email` is UNIQUE
(`users_email_idx`) and sessions are database-backed, a second provider used while *not* signed in makes Auth.js
attempt `createUser`, collide on the unique index, and fail to `/auth/error` — the duplicate-account /
`OAuthAccountNotLinked` root cause. This cycle adds an **explicit link-while-authenticated** path: the listener
signs in with either method, triggers "connect my other method," and a linking callback in `auth.ts` inserts the
second provider's `accounts` row against the **current session's** `userId` instead of creating a user. The
existing `migrateSessionSignalsToUser` hand-off and all `user_id`-keyed data stay attached to the surviving id.

Crucially, an account is **not** keyed to a single email. The magic-link email and the email each linked music
platform returns are **all** associated with the one account, in a new `user_emails` table; *any* verified email
resolves sign-in to the same `users.id`. `users.email` is demoted to a *primary/display* email (kept for Auth.js
compatibility); the real identity key is "which account owns this email," answered by `user_emails`.

## Design / Approach

- **Multi-email identity model (`user_emails` table, additive).** A new `user_emails`
  `(id, user_id FK users, email, source, verified, is_primary, added_at)` table holds **every** email associated
  with an account — `source` ∈ (`magic_link`, `spotify`, `google_youtube`, `apple_music`). A **global UNIQUE on
  `lower(email)`** keeps any email owned by at most one account; a partial unique on `(user_id) where is_primary`
  keeps one primary per account. `users.email` stays as the primary/display value (Auth.js compatibility) and is
  back-filled into `user_emails` as the first `is_primary` row. The `users_email_idx` UNIQUE remains but is no
  longer the identity key — `user_emails` is. Additive and `42P01/42703`-tolerant per the
  `db/migrate-missing-tables.sql` precedent.
- **Email resolution consults `user_emails`, not just `users.email`.** Wrap the `PostgresAdapter` so
  `getUserByEmail` (and the magic-link/`getUserByAccount` paths) resolve an incoming email through `user_emails`
  first. This is what makes "sign in with *any* of my emails → my one account" true: a magic-link to a
  platform-sourced secondary email lands on the existing user instead of minting a new one.
- **`auth.ts` linking callback.** Add a `signIn` (and/or `linkAccount` event) guard: when an OAuth/magic-link
  sign-in resolves to a provider account that is not yet linked **and** a session already exists, attach the new
  `accounts` row to the session `userId` rather than minting a user, and **record the provider's email in
  `user_emails`** (`verified` per the provider; Spotify `user-read-email` is verified). Keep the existing
  music-connection recording and `migrateSessionSignalsToUser` call intact.
- **Identity decision matrix (pure, unit-tested).** For an incoming provider identity + email, resolve one of:
  *(a)* email already in `user_emails` for the **same** signed-in user (or no session but unambiguous owner) →
  **link / resolve to that account**; *(b)* email owned by a **different** account → **do not merge**, hand to
  the duplicate-account recovery (PRD 37); *(c)* no existing match → normal create + seed `user_emails`. Lives in
  a pure helper (e.g. `lib/account-linking.ts`) so the rule can't drift.
- **`me/account-links` surface.** A `requireUserId()`-gated `app/api/me/account-links` route: GET lists the
  listener's linked providers (from `accounts`, tokens stripped) **and their associated emails** (from
  `user_emails`, with which is primary); POST initiates linking the other method. The profile UI
  (`components/ListenerProfileButton.tsx`) gains "Connect Spotify" / "Add email access" and shows the account's
  emails. Acts only on the session-resolved id — never an id from the body.
- **No-reset guarantee.** `music_connections`, `listener_discovery_preferences`, `listener_follows`,
  `curators`, saved items, and `user_emails` are all `user_id`-keyed and stay attached to the surviving
  `users.id`. Linking is additive; nothing is re-keyed.
- **No blind auto-linking.** `allowDangerousEmailAccountLinking` stays off; linking requires an authenticated
  session (or an explicitly-confirmed verified-email match, surfaced via PRD 37). An email only becomes a
  sign-in identifier for an account once it is recorded as `verified` in `user_emails`.
- **Provider-generic, Spotify-exercised.** The `source` enum and linking callback are written generically for
  all music providers; **only `magic_link` + `spotify` are wired and tested in this cycle.** `google_youtube`
  and `apple_music` are valid `source` values reserved for the backlogged provider sprints (see the epic's Open
  Decisions and `backlog.md`).

## Implementation Status

**Wired & live (June 18, 2026); awaiting only the live cross-browser proof (PRD 38 runbook).**

The merge-safe linking loop is now wired end-to-end in code. Confirmed against the installed
`next-auth@5.0.0-beta.31` / `@auth/core` source (`lib/actions/callback/handle-login.js`):

- **Signed-in OAuth linking is native Auth.js behavior.** When a listener is already signed in and
  connects a second OAuth provider whose account isn't yet linked, the framework calls
  `linkAccount({ ...account, userId: currentUser.id })` (handle-login.js:130–138) — it attaches the new
  `accounts` row to the **current session user**, **without** `allowDangerousEmailAccountLinking`. So
  "signed in via magic link → Connect Spotify" (and the reverse for a recorded email) lands on the one
  account. No custom callback is required for this case.
- **Our `getUserByEmail` wrapper** (`lib/auth-adapter.ts`) makes a magic link to *any* recorded email
  resolve to the owning account, and turns the not-signed-in OAuth email collision into
  `OAuthAccountNotLinked` → the PRD 37 `duplicate_account` recovery (handle-login.js:142–149) instead of a
  silent fork.
- **The `signIn` event** records each provider's returned email into `user_emails`, completing the
  multi-email association.

What remains is **not** code but **proof**: the live cross-browser/device execution of the PRD 38 runbook
(real OAuth + live Spotify credentials), which can only be run by a human — see `backlog.md`.

Shipped:
- **`user_emails` table** (additive, `42P01`-tolerant) with a global `unique(lower(email))`, a
  one-primary-per-account partial unique, and an idempotent back-fill of every existing
  `users.email` as its primary row (source derived from whether the user has a Spotify account).
  Registered as `db-user-emails` (countKey `user_emails`); map regenerated; `test:registry` green.
- **Pure identity decision matrix** (`lib/account-linking.ts`): `resolveAccountLink` (link / create /
  conflict), `normalizeEmail`, `emailSourceForProvider`, `isProviderEmailVerified` — unit-tested
  (`test:account-linking`, 8 cases incl. signed-in same/different-owner and not-signed-in resolve).
- **Multi-email service** (`lib/account-emails.ts`, `server-only`): `recordUserEmail` /
  `recordProviderEmail` (idempotent, best-effort, never inserts an email owned elsewhere),
  `findUserIdByEmail`, `getAccountLinks` (linked providers tokens-stripped + associated emails).
- **`auth.ts` sign-in event** now records each provider's returned email into `user_emails`
  (best-effort, additive — does not yet change resolution), preserving `recordMusicConnection`
  (spotify-only) and `migrateSessionSignalsToUser`.
- **`GET /api/me/account-links`** (`requireUserId()`-gated, self-scoped) returning the caller's
  linked providers + emails; registered as `api-me-account-links`.

Shipped (June 18, 2026):
- **`PostgresAdapter` `getUserByEmail` wrapper** (`lib/auth-adapter.ts`: `withMultiEmailResolution`,
  applied in `auth.ts`): an incoming email is resolved through `user_emails` when the adapter's own
  lookup misses, so a magic link to a secondary/platform-sourced email lands on the existing account
  instead of forking a duplicate user. Purely additive (only resolves *more* cases, never changes an
  existing hit); does **not** enable `allowDangerousEmailAccountLinking` — a not-signed-in OAuth email
  collision now surfaces as `OAuthAccountNotLinked`, mapped to the PRD 37 `duplicate_account` recovery
  rather than a silent fork. Typecheck/lint/`test:registry` green; Snyk-clean.

Remaining (live proof + polish — tracked in `backlog.md`):
- The live cross-browser/device run of the PRD 38 runbook (real OAuth + Spotify credentials) to *prove*
  the loop — the only non-autonomous step.
- A small edge: "add email access" while signed in via Spotify using a **brand-new** email (not the
  Spotify-recorded one) goes through the email-provider path, which does not auto-link to the session the
  way OAuth does; the common case (a magic link to the already-recorded Spotify email) resolves correctly
  via the wrapper. Optional explicit `linkAccount` for the new-email case if the runbook flags it.
- Profile-menu "Add email access" entry point for Spotify-first users + the emails display ("Connect
  Spotify" already exists; `GET /api/me/account-links` already returns the emails).

## Dependencies

- Builds directly on Phase 14 / PRD 34 (`Resend` + `Spotify` providers in `auth.ts`).
- Spine for PRD 36 (retry lands on the linked account), PRD 37 (recovers the duplicate-account state this
  matrix detects), and PRD 38 (the loop it proves).

## Non-Goals

- Merging two already-separate historical accounts (retroactive-merge tool is a noted follow-up).
- **Wiring** Google/YouTube or Apple Music sign-in providers — the `user_emails.source` enum + linking callback
  are written generically to accept them, but registering those providers and exercising their linking is
  **backlogged to future sprints** (see `backlog.md`). This cycle wires and tests `magic_link` + `spotify` only.
- Spotify writes; any paid dependency.

## Acceptance Criteria

- A signed-in magic-link listener connects Spotify and stays on the same `users.id`; a signed-in Spotify
  listener adds email and stays on the same id — verified by inspecting `users`/`accounts`/`user_emails` (one
  user, two accounts rows, both emails recorded).
- An account can hold **multiple emails** (magic-link + the Spotify-returned email); signing in via *any*
  recorded, verified email resolves to the same single account (no new `users` row).
- A second provider never creates a duplicate `users` row; the same-account / different-account / no-match cases
  are unit-tested; `lower(email)` is globally unique across accounts.
- Preferences, follows, curator status, saved items, and `user_emails` survive linking unchanged;
  `migrateSessionSignalsToUser` still runs.
- `allowDangerousEmailAccountLinking` is not enabled; an email is only a sign-in identifier once `verified` in
  `user_emails`; tokens never leave the server; `$0`; new code Snyk-clean; typecheck/lint/tests green.
