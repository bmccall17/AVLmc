## Reliable Account Sign-In & Spotify Connection — Desired Outcomes

Updated: June 17, 2026

### Purpose & Posture

**Goal.** A listener can **reliably** create or access **one** AVL Music Companion account using either a
magic email link **or** Spotify, then connect the *other* method to that **same** account — without spawning a
duplicate identity or losing existing preferences, activity, or account data. While Spotify stays in
Development Mode (a hard 25-user allowlist), a not-yet-approved listener can submit a **clear access request**
that hands the administrator their Spotify email, communicates "pending," and lets the admin add them to a
tester slot — after which the listener **retries onto their existing account**, not a new one. Every
authentication and linking failure produces **clear, accurate, recoverable** guidance instead of an unresolved
dead-end, and a **repeatable cross-browser test** proves the whole loop behaves predictably. All `$0`,
anonymous-first, no Spotify writes, security-at-inception.

This is a **Phase 15 reliability initiative** and the direct sequel to **Phase 14 / PRD 34** (Onboarding &
Email Sign-in), which added the magic-link provider but **explicitly deferred** account *linking* and
duplicate-identity handling. Phase 14 gave listeners two ways *in*; Phase 15 makes those two ways resolve to
**one identity** and makes every failure path recoverable.

**Reported feedback (verbatim themes).**

1. **"Beta testing" dead-end.** Connecting Spotify as a non-allowlisted tester returns the limited-beta notice
   with **no way to request access** — the user can't tell the admin "please add me," and doesn't know what to
   do next.
2. **Duplicate-account fear.** A listener who signed in by email and later connects Spotify (or vice versa)
   can't tell whether they'll land back on their existing board or start over empty.
3. **Opaque failures.** Access-denied, redirect-loop, stale-session, and browser-specific fallback states all
   surface as the same unhelpful error with no recoverable next step.

**Current state (brownfield) & root causes.**

- **Two providers exist, but nothing links them.** `auth.ts` registers `Resend` (magic link) and `Spotify`,
  each flag-gated (`lib/auth-flags.ts`). Both write through Auth.js's `PostgresAdapter` against
  `users`/`accounts`/`sessions`/`verification_token`. There is **no explicit account-linking path** — the
  product relies on Auth.js defaults, which were never designed for "connect my second method."
- **`users.email` is UNIQUE** (`users_email_idx`, `db/schema.sql`). When a listener signs in with a *second*
  provider whose email matches an existing user **and they are not already signed in**, Auth.js tries to
  `createUser`, the unique index rejects it, and the flow fails as `OAuthAccountNotLinked` / a redirect to
  `/auth/error`. This is the **duplicate-account / linking** root cause: the safe path is to **link the new
  `accounts` row to the existing `users.id` while the listener is authenticated**, not to create a second user.
- **Database sessions, not JWT** (`session.strategy = "database"`). Linking is a server-side insert of an
  `accounts` row keyed to the *current session's* `userId` — there is no client token to reconcile, which makes
  merge-safe linking tractable but means stale `sessions` rows can cause redirect-loop / stale-session states.
- **Spotify failure dead-ends.** A 403 from a non-allowlisted tester throws `SpotifyLimitedBetaAccessError`
  (`lib/spotify-limited-access.ts`); `app/auth/error/page.tsx` redirects to `/?spotify=<code>` and the board
  shows `SPOTIFY_LIMITED_BETA_MESSAGE`. The copy points at "use email instead" but offers **no request
  channel** and the 25-slot unblock is a manual, undocumented admin action in the Spotify dashboard.
- **The hand-off spine already works.** `migrateSessionSignalsToUser` (PRD 20) migrates this browser's
  anonymous signals on every sign-in; the `signIn` event records a music connection only for `spotify`. Linking
  must **preserve** this — a link is continuity, never a reset.
- **The request-queue shape already has a precedent.** Curator self-serve (Phase 13) ships an admin-reviewed
  **pending queue** over a `requireUserId()`-gated `app/api/me/*` submit endpoint plus an admin
  `*Section.tsx`/`app/api/admin/*` review surface. The Spotify tester-access request reuses that exact pattern.

**Posture (locked).**

- **One human, one `users` row — with many emails.** A listener's email magic-link identity and their Spotify
  identity resolve to a single `users` record; the second provider is added as a linked `accounts` row, never a
  second user. An account associates **multiple verified emails** — the magic-link email plus the email each
  linked music platform (Spotify now; YouTube/Apple later) returns — recorded in a `user_emails` table, and
  signing in with *any* of them resolves to the same account. No preferences, saved shows, follows, curator
  status, or activity are lost in the process.
- **Link only while authenticated.** Linking a second provider requires an active session for the account being
  linked into (or a verified-email match the listener explicitly confirms). We do **not** enable
  `allowDangerousEmailAccountLinking` blindly; account-takeover by unverified email is designed out.
- **Honest, recoverable failures.** Every auth/linking failure maps to a specific, accurate message **and** a
  concrete next step (request access / re-send link / sign in first / clear stale session / open in a supported
  browser). No state dead-ends at a generic error.
- **Dev-mode access is requestable, not a wall.** A not-yet-approved listener can submit their Spotify email as
  an access request; the admin gets it, the listener is told "pending," and a successful retry lands on their
  existing account. The 25-slot add stays an external Spotify-dashboard action, but it is **prompted and
  tracked**, not tribal knowledge.
- **Anonymous-first preserved.** Linking and the request flow are signed-in add-ons; the anonymous board
  payload and ranking are unchanged.
- **`$0` & security-at-inception.** No new paid dependency; additive, `42P01/42703`-tolerant schema; OAuth
  tokens never leave the server; no Spotify writes; all new first-party code passes Snyk before "done."

### Desired Outcomes

1. **Account identity & merge-safe linking.** A magic-link listener can connect Spotify from their existing
   account; a Spotify listener can add email access to that same account; both methods then return the listener
   to **one unified identity** with all preferences/activity/account data intact — no duplicate `users` row.
2. **Spotify tester-slot access request.** A not-yet-approved listener submits a clear request that hands the
   admin their Spotify account email and communicates "pending"; the admin can add them to an available tester
   slot; the listener retries successfully **onto their existing account**.
3. **Clear, recoverable auth & linking failures.** "Beta testing," access-denied, redirect-loop, stale-session,
   duplicate-account, and browser-specific fallback states each produce accurate guidance and a recoverable
   next step rather than an unresolved error.
4. **Cross-browser predictability, proven.** A repeatable cross-browser/device test confirms that sign-in,
   account linking, access request, approval, reconnection, and returning-user sessions all behave consistently
   across supported browsers and devices.

### Out of Scope

- Lifting the Spotify 25-user cap in code (the slot add remains an external Spotify Developer Dashboard /
  Extended-Quota action — Phase 15 *prompts and tracks* it, it does not automate it).
- Merging two **already-separate** historical accounts that a listener created before linking existed
  (Phase 15 prevents new duplicates and links forward; a retroactive account-merge tool is a noted follow-up,
  not a Phase 15 cycle).
- **Wiring** the Google/YouTube and Apple Music sign-in providers — designed-for generically (their
  `user_emails.source` values and the linking callback accept them) but **backlogged** to future sprints; Phase
  15 wires Spotify only.
- Spotify writes, new ranking signals, any paid dependency.

### Success Criteria

- A listener can start from either method, add the other, and end on a single account with preferences and
  activity intact; a second provider never creates a duplicate `users` row.
- A non-allowlisted tester can request Spotify access (admin receives their Spotify email + "pending"), be
  added to a slot, and retry onto their existing account.
- Each named failure state shows accurate copy + a recoverable next step; no generic dead-end remains.
- A documented, repeatable cross-browser test passes for the full loop; `$0`; anonymous board payload + ranking
  unchanged; new code Snyk-clean; typecheck/lint/tests green.

### Locked Decisions

- **One `users` row per human; link the second provider as an `accounts` row to the existing id — never create
  a second user.** Link only while authenticated (or on an explicitly-confirmed verified-email match); no blind
  `allowDangerousEmailAccountLinking`.
- **Multiple verified emails per account.** A `user_emails` table (global `lower(email)` UNIQUE, one primary per
  account) holds the magic-link email plus each platform-returned email; email resolution consults it so any
  recorded email signs into the one account. `users.email` is demoted to primary/display only.
- **Provider-generic, Spotify-exercised now.** The linking + `user_emails` model is built generically for all
  music providers; **Spotify** is wired and tested in Phase 15, while **Google/YouTube and Apple Music auth are
  backlogged** to future sprints (stubs/"stems" reserved).
- **Database sessions retained;** linking is a server-side `accounts` insert keyed to the current session user.
- **Dev-mode access is a tracked request** carrying the listener's Spotify email through the existing
  `me/*` submit → admin `*Section.tsx` review precedent; the 25-slot add stays an external, but **prompted and
  documented**, admin action.
- **Every failure maps to {accurate message + recoverable action}.** Replaces the single `/auth/error` redirect
  and the `SPOTIFY_LIMITED_BETA_MESSAGE` dead-end.
- **No Spotify writes; `$0`; Snyk-clean; anonymous-first preserved; OAuth tokens stay server-side.**
- **Docs/workflow:** formalized as an EPIC (`account-signin-linking-prd.md`) + four cycle PRDs (numbering
  continues **35–38**, registered as **Phase 15**); recorded via `/ship`.

### Acceptance (initiative-level)

- Connect-Spotify-from-email and add-email-to-Spotify both resolve to one identity with no data loss and no
  duplicate user; verified by inspecting `users`/`accounts` after each flow.
- The access-request flow delivers the Spotify email + pending status to the admin, supports a slot add, and a
  retry lands on the existing account.
- Each named failure state is reproduced and shown to yield accurate, recoverable guidance.
- The cross-browser test script exists, is repeatable, and passes across the supported matrix; `$0` maintained;
  no Spotify writes; new code passes Snyk.
