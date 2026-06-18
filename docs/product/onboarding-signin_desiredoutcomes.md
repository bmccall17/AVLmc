## Onboarding & Sign-in — Desired Outcomes

Updated: June 17, 2026

### Purpose & Posture

**Goal.** A first-time visitor immediately understands how AVL Music Companion personalizes their board
and can start in one click. They can create a **persistent account with just an email** (magic link) —
**no Spotify required** — so their taste, saved shows, follows, and curator status travel across devices.
Connecting Spotify is presented honestly as an **optional, currently invite-only beta** enhancement that
never dead-ends. Anonymous local tuning stays a zero-friction default for the un-signed-in. The board is
**legible** (the curator directory reads clearly even when empty) and **time-flexible** (a listener can
change the date range within the rolling window). All `$0`, anonymous-first, no Spotify writes,
security-at-inception.

This is a **test-user-feedback fix** (June 17, 2026). Three friction points were reported from the live app
and all three are addressed here.

**Reported feedback (verbatim themes).**

1. **No clear onboarding / sign-in.** The only entry is the top-right "Guest listener" button; its one real
   action is "Connect Spotify," which returns a *"still in beta testing"* notice. Users don't understand how
   personalization works or how to get it.
2. **Curator directory empty state is hard to read** — "No curators yet" renders near-invisible.
3. **The date window isn't editable** — the board is locked to a rolling ~21-day window (e.g. "Jun 17 – Jul 8").

**Current state (brownfield) & root causes.**

- **Spotify is the only sign-in path, and it's gated.** `auth.ts` registered **only** the Spotify provider.
  Spotify is in **Development Mode** (hard 25-user allowlist), so non-allowlisted testers hit a **403** on the
  taste sync (`lib/music.ts` → `SpotifyLimitedBetaAccessError` / `SPOTIFY_LIMITED_BETA_MESSAGE`). **This is a
  Spotify dashboard limitation, not a code bug** — the real unblock is adding testers to *User Management* in
  the Spotify Developer Dashboard (≤25) or applying for *Extended Quota Mode*.
- **Anonymous personalization already works but is invisible.** The `ListenerProfileButton` tuning sliders +
  custom boosts (persisted to `localStorage`) fully personalize the board for guests, but nothing presents
  this as "the way to personalize."
- **Auth.js email prerequisites are in place.** `users` / `accounts` / `sessions` / `verification_token`
  tables exist (`db/schema.sql`) and the anonymous→account hand-off already runs on sign-in
  (`migrateSessionSignalsToUser`, PRD 20) — an email provider plugs straight in.
- **Empty-state color** uses `var(--muted)` (`#5b6b66`) — too low-contrast on dark shells (`app/globals.css`).
- **Date window is server-fixed.** `getDateWindow()` (`lib/events.ts`) hardcodes `today → today+21d` and feeds
  both ingest and view; the "When" chips only narrow within it. All 21 days are already loaded client-side,
  so a range control can filter without any server/ingest change.

**Posture (locked).**

- **Email magic-link is the primary, Spotify-independent sign-in.** Persistent account with no password and
  no Spotify. Built on the Auth.js **Resend** provider (HTTP API, **no new dependency**, free tier → `$0`),
  gated behind a feature flag so it stays dark until a verified sender + key are configured.
- **Spotify is optional and honest.** Labeled "optional · invite-only beta" *before* OAuth; the beta message
  points at the working path (email / local tuning), never a dead-end. The 25-user unblock is an external
  Spotify-dashboard action, documented for the operator.
- **Anonymous-first preserved.** Local tuning remains the zero-friction default; the anonymous board payload
  and ranking are unchanged.
- **Security at inception.** Auth changes keep the Spotify path working; the `signIn` event only records a
  music connection for music providers (email sign-in creates no bogus `accounts` row). New first-party code
  passes Snyk.

### Desired Outcomes

1. **Email magic-link sign-in.** A guest enters their email, gets a one-tap link, and lands signed in with a
   persistent profile — no Spotify, no password — with their anonymous tuning carried over.
2. **Clear onboarding + honest Spotify gating.** The profile entry reads as onboarding ("Personalize your
   board"), explains personalization in a line, and presents Spotify as optional invite-only beta up front.
3. **Anonymous tuning surfaced as the default** for the un-signed-in.
4. **Legible curator directory** — the empty state is readable and invites the viewer to be the first curator.
5. **Editable date window** — a listener can narrow the browsing range within the rolling window.

### Out of Scope

- Lifting the Spotify 25-user cap in code (external Spotify-dashboard / Extended-Quota action).
- Widening the ingest horizon beyond ~21 days (date control narrows *within* the existing window).
- Spotify writes, new ranking signals, any paid dependency.

### Success Criteria

- A signed-out tester can create a persistent account by email and see their tuned board persist; Spotify is
  clearly optional and never a dead-end; the curator empty state is legible; the date range is changeable.
- `$0` (Resend free tier, no new dep); anonymous board payload + ranking unchanged; new code Snyk-clean;
  typecheck/lint/tests green.
