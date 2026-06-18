# Reliable Account Sign-In & Spotify Connection — Master PRD (Epic)

Updated: June 18, 2026

**Status: In progress (June 18, 2026) — C1 foundation + C2 shipped, C3–C4 documented.** Decomposed into four
dependency-sequenced cycle PRDs (35–38), one per desired outcome. C1 (PRD 35) shipped the safe, verifiable
half of the linking spine (`user_emails` table + back-fill, the pure decision matrix + tests, the multi-email
service, sign-in email recording, `GET /api/me/account-links`); the live-auth wiring (adapter `getUserByEmail`
resolution + the explicit linking callback + profile entry points) is staged for the C4 cross-browser pass.
C2 (PRD 36) shipped the Spotify tester-slot access request end-to-end: a `spotify_access_requests` table
(one open request per user), the listener `me/spotify-access-request` submit/status surface turning the beta
wall into "Request access" → "pending" → "added — retry now," and the admin `/admin/spotify-access` review
queue that prompts the manual ≤25-slot add — the successful retry lands on the C1 account.
This is **Phase 15** in [`master-roadmap.md`](master-roadmap.md) and the direct sequel to
**Phase 14** (Onboarding & Email Sign-in, [PRD 34](prds/prd-34-onboarding-email-signin.md)), which added the
magic-link provider but explicitly deferred account *linking* and duplicate-identity handling.

## One-Sentence Goal

Let a listener reliably create or access **one** AVL Music Companion account via magic link **or** Spotify, connect the other method to that **same** account with no duplicate identity and no lost data, request Spotify
tester access while Spotify is in Development Mode, and recover cleanly from every auth/linking failure — proven by a repeatable cross-browser test, all `$0`, anonymous-first, no Spotify writes.

## How To Use This Document

This is the umbrella tracker for the Reliable Account Sign-In & Spotify Connection initiative (**Phase 15**). It
synthesizes the desired outcomes in
[`account-signin-linking_desiredoutcomes.md`](account-signin-linking_desiredoutcomes.md) into a sequenced series
of focused PRDs in [`prds/`](prds/) (PRDs **35–38**). Treat it the way
[`curator-onboarding-prd.md`](curator-onboarding-prd.md) serves Phase 13: the epic owns shared architecture,
cross-cutting rules, and sequencing; each cycle PRD owns one independently shippable increment.

This initiative **closes the reliability gap** opened by Phase 14. Phase 14 / PRD 34 shipped two ways *in*
(email magic link + Spotify) but left them as **two unlinked identities** with **dead-end failures**. This
initiative makes the two methods resolve to **one identity**, makes dev-mode Spotify access **requestable**, and
makes every failure **recoverable** — then proves it across browsers.

## Current State (Brownfield Baseline)

- **Two flag-gated providers, no link path.** `auth.ts` registers `Resend` (magic link) and `Spotify`, each
  gated by `lib/auth-flags.ts` (`email` / `spotify` flags). Both persist through Auth.js `PostgresAdapter`
  against `users`/`accounts`/`sessions`/`verification_token` (`db/schema.sql`). There is **no explicit
  "connect my other method" path** — linking is left to Auth.js defaults that were never designed for it.
- **`users.email` is UNIQUE** (`users_email_idx`). A second provider whose email matches an existing user, when
  the listener is **not already signed in**, makes Auth.js attempt `createUser`, hit the unique index, and fail
  as `OAuthAccountNotLinked` → `/auth/error`. This is the **duplicate-account / linking** root cause; the safe
  fix is linking the new `accounts` row to the existing `users.id` **while authenticated**.
- **Database sessions** (`session.strategy = "database"`). Linking is a server-side `accounts` insert keyed to
  the current session's `userId`; no client JWT to reconcile. Stale/duplicate `sessions` rows are the
  redirect-loop / stale-session root cause.
- **Spotify failure dead-ends.** A 403 throws `SpotifyLimitedBetaAccessError` (`lib/spotify-limited-access.ts`,
  `SPOTIFY_LIMITED_BETA_MESSAGE` / `SPOTIFY_LIMITED_BETA_CODE`); `app/auth/error/page.tsx` redirects to
  `/?spotify=<code>#personalized-discovery`. No request channel; the 25-slot unblock is undocumented tribal
  knowledge.
- **The hand-off spine works and must be preserved.** The `signIn` event records a music connection only for
  `provider === "spotify"` and runs `migrateSessionSignalsToUser` (PRD 20) for every provider — a link is
  continuity, never a reset.
- **Request-queue + admin-review pattern already exists.** Phase 13's curator self-serve ships a
  `requireUserId()`-gated `app/api/me/*` submit endpoint feeding an admin-reviewed pending queue surfaced via
  `app/api/admin/*` + a `components/admin/*Section.tsx` panel. The Spotify tester-access request reuses it.

**Reusable spine every cycle plugs into:** the Auth.js `PostgresAdapter` + `users`/`accounts` model and the
`signIn` event in `auth.ts`; `requireUserId()` / `getOptionalUserId()` (`lib/current-user.ts`) and the
`app/api/me/*` route shape; `migrateSessionSignalsToUser` (the no-reset hand-off); the admin-cookie-gated
`app/api/admin/*` + `*Section.tsx` review pattern; `lib/spotify-limited-access.ts` error/message/code; and the
System Registry / system-map discipline (`lib/system-registry.ts` → `npm run generate:system-map` →
`npm run test:registry`).

## Posture (Locked — inherited by every cycle)

- **One human, one `users` row — with many emails.** The second provider is added as a linked `accounts` row to
  the existing id, never a second user. An account associates **multiple verified emails** (the magic-link email
  plus the email each linked music platform returns) via a `user_emails` table; *any* recorded email resolves to
  the same account. No preferences, saved shows, follows, curator status, or activity are lost.
- **Link only while authenticated.** Linking requires an active session for the account being linked into, or an
  explicitly-confirmed verified-email match. No blind `allowDangerousEmailAccountLinking`; takeover is designed
  out.
- **Honest, recoverable failures.** Every auth/linking failure maps to {accurate message + concrete recoverable
  action}; no state dead-ends at a generic error.
- **Dev-mode access is requestable & tracked.** A not-yet-approved listener submits their Spotify email; the
  admin receives it + "pending"; a slot add (external Spotify-dashboard action) is prompted and tracked; a retry
  lands on the existing account.
- **No Spotify writes; read-only scopes only.** Tokens never leave the server.
- **`$0` & security-at-inception.** Additive, `42P01/42703`-tolerant schema following the
  `db/migrate-missing-tables.sql` precedent; no new paid service/dependency; new first-party code passes Snyk
  before "done."
- **Anonymous-first preserved.** Linking and the request flow are signed-in add-ons; the anonymous board payload
  and ranking stay byte-for-byte unchanged.

## Definition Of Done (Outcomes 1–4, Synthesized)

1. **Account identity & merge-safe linking** — connect-Spotify-from-email and add-email-to-Spotify both resolve
   to one `users` row with all data intact; a second provider never creates a duplicate user.
2. **Spotify tester-slot access request** — a not-yet-approved listener submits their Spotify email; the admin
   receives it + "pending," can mark a slot add; the listener retries onto their existing account.
3. **Clear, recoverable auth & linking failures** — "Beta testing," access-denied, redirect-loop,
   stale-session, duplicate-account, and browser-fallback states each yield accurate copy + a recoverable next
   step.
4. **Cross-browser predictability, proven** — a documented, repeatable cross-browser/device test confirms
   sign-in, linking, request, approval, reconnection, and returning-user sessions behave consistently.

## Outcome → PRD Map

Build order = outcome order (dependency-sequenced: the linking spine first; the access request on top of it; the
recovery UX over both; the cross-browser test as the verification capstone).

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 35 — Account Identity & Linking Spine](prds/prd-35-account-identity-linking-spine.md) | 1 | The spine: an explicit, merge-safe "connect your other method" path. Link a second provider's `accounts` row to the **current** `users.id` while authenticated; resolve the `users.email` unique-index collision deliberately; preserve `migrateSessionSignalsToUser`; never create a duplicate user. A `requireUserId()`-gated `me/account-links` surface + the `auth.ts` linking callback. |
| C2 | [PRD 36 — Spotify Tester-Slot Access Request](prds/prd-36-spotify-tester-access-request.md) | 2 | The dev-mode unblock: a `me/spotify-access-request` submit carrying the listener's Spotify email + "pending," an admin review surface (`app/api/admin/*` + a `*Section.tsx` panel) that prompts the 25-slot add, and a retry that lands on the existing account (built on C1). |
| C3 | [PRD 37 — Auth & Linking Failure Recovery](prds/prd-37-auth-linking-failure-recovery.md) | 3 | The recovery layer: a typed failure taxonomy mapping each state ("Beta testing," access-denied, redirect-loop, stale-session, duplicate-account, browser-fallback) to {accurate message + recoverable action}, replacing the single `/auth/error` redirect and the dead-end beta message. |
| C4 | [PRD 38 — Cross-Browser Reliability & Benchmark](prds/prd-38-cross-browser-reliability-benchmark.md) | 4 | The capstone: a documented, repeatable cross-browser/device test exercising the full loop (sign-in, linking, request, approval, reconnection, returning-user sessions), plus the reliability checklist the other cycles grade against. |

## Delivery Sequence & Dependencies

```
C1 Account Identity & Linking Spine   (the spine; every other cycle plugs in here)
 ├──> C2 Spotify Tester-Slot Access Request   (request → admin → slot → retry onto the C1-linked account)
 ├──> C3 Auth & Linking Failure Recovery       (recovers the states C1's linking + C2's request expose)
 │
 └──> C4 Cross-Browser Reliability & Benchmark  (proves the whole loop predictable everywhere)
```

- **C1 first** — explicit merge-safe linking is the spine; it ships value alone (you can link your second
  method without a duplicate) before any request/recovery/test work.
- **C2 depends on C1** — a successful retry after a slot add must land on the existing (linked-or-linkable)
  account, which is exactly what C1 guarantees.
- **C3 depends on C1 (and informs C2)** — the failure taxonomy enumerates the states C1's linking and C2's
  request can produce; recoverable copy points at C1's link path and C2's request flow.
- **C4 depends on the rest** — you can only prove a loop that exists; it is the verification capstone and also
  back-fills the reliability checklist C1–C3 grade against.
- **Recommended order:** C1 → C2 → C3 → C4.

## Shared Architecture & Cross-Cutting Design

Decided once here; inherited by every cycle.

### Identity resolution — one `users` row + many emails, link forward

- **An account holds multiple verified emails.** A `user_emails` `(user_id, email, source, verified, is_primary)`
  table associates the magic-link email **and** the email each linked music platform returns with the one
  account. A **global UNIQUE on `lower(email)`** keeps any email owned by at most one account; `users.email`
  becomes a primary/display value (Auth.js compatibility), not the identity key. Email resolution wraps the
  `PostgresAdapter` so `getUserByEmail` / magic-link lookups consult `user_emails` — so signing in with *any*
  recorded email lands on the same account. `source` is provider-generic (`magic_link` / `spotify` /
  `google_youtube` / `apple_music`).
- **Linking happens while authenticated.** The listener signs in (either method), then triggers "connect my
  other method." Auth.js runs OAuth/magic-link for the second provider; a `signIn`/`linkAccount` callback in
  `auth.ts` inserts the `accounts` row against the **current session's** `userId` instead of creating a user,
  and records the provider's email in `user_emails`.
- **Email collisions are resolved deliberately, not by accident.** When an incoming provider email is already in
  `user_emails`: if it belongs to the *same* account → resolve/link; if it belongs to a *different* account →
  surface the duplicate-account recovery (C3), never silently merge or fork. We do **not** flip
  `allowDangerousEmailAccountLinking` on globally; an email only becomes a sign-in identifier once `verified`.
- **No-reset guarantee.** `migrateSessionSignalsToUser` and all `user_id`-keyed data (`music_connections`,
  `listener_discovery_preferences`, `listener_follows`, `curators`, saved items, `user_emails`) stay attached to
  the surviving `users.id`. A link is additive; nothing is re-keyed away from the listener.

### Two API planes, never crossed

- **Listener plane** — `requireUserId()`-gated `app/api/me/account-links` (view/initiate linking, see linked
  providers) and `app/api/me/spotify-access-request` (submit/check my request). A listener acts only on **their
  own** session-resolved id — never an id supplied in the body.
- **Admin plane** — `app/api/admin/*` + a `components/admin/*Section.tsx` panel for the tester-access review
  queue (see pending requests + the listener's Spotify email, mark slot-added / approved), reusing the
  cookie-gated curator-review precedent.

### Failure taxonomy is a typed, pure mapping

- A single source of truth (e.g. `lib/auth-failures.ts`) maps each failure code →
  `{ title, message, action }`. The `app/auth/error/page.tsx` redirect and the `SPOTIFY_LIMITED_BETA_MESSAGE`
  become entries in this table, not bespoke dead-ends. Pure and unit-tested so copy/behavior can't drift.

### Cross-cutting requirements (apply to every cycle)

- **Privacy / PII (mandatory).** OAuth tokens never leave the server; a listener's Spotify email in an access
  request is private to the listener + admin; no tokens/PII in any public/community/OG response.
- **Security at inception (mandatory).** No blind email-based auto-linking; linking requires an authenticated
  session or explicitly-confirmed verified-email match. All new first-party code passes a Snyk scan before
  "done"; fix + rescan until clean.
- **No Spotify writes.** Read-only scopes (`user-read-private user-read-email user-top-read`) only.
- **`$0`.** No new paid hosting/database/storage/API/dependency; additive schema following the
  `db/migrate-missing-tables.sql` precedent.
- **Anonymous-first preserved.** The anonymous board payload + ranking are unchanged at every step.
- **Architecture registration.** Every new route is registered in `lib/system-registry.ts` with a correct
  `sourceOfTruth`; `npm run generate:system-map` re-run; `npm run test:registry` green.
- **Validated, not guessed.** The identity-resolution decision matrix and the failure taxonomy are unit-tested;
  the cross-browser loop is exercised by the C4 test, not assumed.

## Cross-Cutting Risks

- **Account takeover via email-based auto-linking (central risk).** Blindly linking by matching email lets an
  attacker who controls an OAuth identity claim an existing email account. Mitigated by link-only-while-
  authenticated, no global `allowDangerousEmailAccountLinking`, and the duplicate-account recovery path instead
  of a silent merge.
- **Silent data loss / re-key.** A botched merge could orphan `user_id`-keyed preferences/activity. Mitigated by
  the no-reset guarantee (link forward, never re-key) and a post-link data-integrity check in C4.
- **Duplicate identities created before linking shipped.** Listeners who already made two separate accounts. Out
  of scope for Phase 15 (prevent-forward); flagged as a follow-up retroactive-merge tool.
- **Stale `sessions` / redirect loops.** Database sessions can leave stale rows causing loops. Mitigated by the
  C3 stale-session recovery and the C4 returning-user test.
- **Dev-mode opacity.** The 25-slot cap is an external constraint. Mitigated by C2 making the request + slot add
  explicit and tracked, with honest "pending" messaging — not by pretending the cap is gone.
- **Brownfield regression.** Changes touch the live auth path. Mitigated by additive, flag-gated changes; the
  Spotify and email sign-in paths keep working; new code is Snyk-scanned.

## Initiative-Level Success Criteria

- A listener can start from either method, add the other, and end on a single account with preferences and
  activity intact; a second provider never creates a duplicate `users` row (verified by inspecting
  `users`/`accounts`).
- A non-allowlisted tester can request Spotify access (admin receives their Spotify email + "pending"), be added
  to a slot, and retry onto their existing account.
- Each named failure state yields accurate copy + a recoverable next step; no generic dead-end remains.
- A documented, repeatable cross-browser test passes for the full loop; `$0`; anonymous board payload + ranking
  unchanged; no Spotify writes; new code passes Snyk; typecheck/lint/tests green.

## Open Decisions & Assumptions

- **Open:** the verified-email-match UX — when the second provider's email matches a *different* existing user,
  do we offer a guided "sign into that account first, then link" flow (preferred) or only an explanatory error?
  Decided concretely in C1/C3.
- **Open:** whether the tester-access request notifies the admin via the existing admin panel only, or also via
  email (Resend is already wired). Default: in-panel queue first (C2), email notification a cheap add if wanted.
- **Assumed:** identity stays on the existing `users`/`accounts` model plus an additive `user_emails` table
  (multi-email per account) and a small `spotify_access_requests` table for C2 (decided in C1/C2). No separate
  identity store.
- **Assumed:** PRD numbering continues **35–38**; this registers as **Phase 15**; cycle labels C1–C4 scope to
  this initiative.
- **Backlogged (future sprints):** wiring the **Google/YouTube** and **Apple Music** sign-in providers. Phase 15
  designs the linking + `user_emails` model **generically** to accept them (their `source` values are reserved
  and the callback is provider-agnostic), but only **email ↔ Spotify** is wired and exercised here. The provider
  stubs/"stems" (auth-flags entries `googleYouTube` / `appleMusic`, already flag-gated off) are carried as
  backlog items — see [`backlog.md`](backlog.md).
