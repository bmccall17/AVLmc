# Open Spotify Access — Master PRD (Epic)

Created: July 2, 2026

**Status: C1–C4 shipped (July 2, 2026).** The gate, capture loop, auto-link convergence, and
privacy/runbook prerequisites are all in `main`; the two remaining actions are external/owner-side:
(1) file the Extension Request in the Spotify Developer Dashboard (checklist + ready-to-paste text
in [PRD 45](prds/prd-45-extended-quota-readiness.md)), and (2) the live in-browser OAuth pass in
production after deploy (Phase 15 precedent). Add `SPOTIFY_OPEN_ACCESS=false` to `.env.example` /
Vercel env docs manually — env files are permission-protected from the build session.

> **Numbering note (resolved July 2, 2026):** after `git pull`, the provisional claim (Phase 13, PRDs 28–31) was indeed taken — Phase 13 by Curator Onboarding, PRDs 28–31 by the personalization benchmark and curator cycles, and Phases 14–16 by the onboarding/linking/design epics. This epic is now **Phase 17, PRDs 42–45**; the roadmap row is added. The pulled work also shipped **PRD 36** (signed-in Spotify tester-slot request, `spotify_access_requests` keyed by `user_id`) — this epic's C1/C2 complement it with the *anonymous, pre-redirect* capture path (`tester_requests` keyed by email) and the gate reads **both** stores so neither loop strands an approved tester.

## One-Sentence Goal

**Any listener with an active Spotify account can sign in to AVL Music Companion, connect that account, and have their taste persistently feed personal discovery — one account per person, no dead ends: while Spotify's beta cap applies, sign-in intent is captured at the exact moment it's expressed and converted into tester approvals; once Spotify grants extended quota, the gate disappears without a redesign.**

## How To Use This Document

Umbrella tracker for the Open Spotify Access initiative, in the pattern of [`social-curator-prd.md`](social-curator-prd.md) (Phase 12) and [`deeper-personalization-prd.md`](deeper-personalization-prd.md) (Phase 11): the epic owns the goal, the locked posture, shared architecture, and sequencing; each cycle PRD in [`prds/`](prds/) owns one independently shippable increment.

## Why Now (The Observed Failure)

Audited July 2, 2026 against production (`avlmc.vercel.app`):

- **Working:** the Spotify OAuth handshake end-to-end (redirect, consent, token exchange, profile fetch), token persistence with pre-expiry refresh (`lib/music.ts`), database sessions, the Resend email door, and graceful copy on `/auth/error` for callback-stage failures.
- **Not working (Gap 1 — the core gap):** Spotify Development Mode rejects non-allowlisted users with a 403 **on Spotify's own domain**, before any callback. The user is stranded there; AVLmc never learns they tried. The deployed "Spotify import is invite-only" error page only catches users Spotify sends *back* (e.g. cancellations) — not the people we want to convert.
- **Not working (Gap 2):** the deployed "Request Spotify access" button links to the homepage. There is no capture form, no `tester_requests` store, no notification email — expressed intent evaporates.
- **Not working (Gap 3):** a listener with an email-created account who signs in fresh via Spotify hits `OAuthAccountNotLinked` (observed in production July 2, 2026). The strict no-auto-link posture bricks the exact convergence we want.
- **Inconsistent (Gap 4):** some error states land on NextAuth's unstyled default sign-in page rather than the product's own surfaces.
- **Structural (Gap 5):** the 25-user Development Mode cap itself; the permanent fix is Spotify's Extended Quota Mode review, which has external prerequisites (public app description, privacy policy URL).

## Decisions (Locked — inherited by every cycle)

Decided with product owner July 2, 2026:

- **One identity per person.** A person = one `users` row with two doors (email magic link, Spotify OAuth). Spotify is a **capability attached to the identity**, never a competing identity. `allowDangerousEmailAccountLinking: true` on the Spotify provider — acceptable because **both** providers prove email ownership (Spotify verifies; a Resend magic link *is* email possession). Error-page copy that promises "we never merge accounts behind your back" is updated to match the new stance ("both methods verify your email, so they safely become one account").
- **The tester offer lives at the sign-in prompt, pre-redirect.** Because the dev-mode 403 happens on Spotify's domain, any post-redirect catch loses the user. Every surface that today calls `signIn("spotify")` directly instead presents a chooser: **Continue with Spotify** / **Request Spotify access** / **Sign in with email**.
- **Email sign-in is the universal, always-works door.** No Spotify required for an account, preferences, or persistence. Spotify enriches; it never gates membership.
- **The gate is scaffolding, not architecture.** The chooser reads a single config flag (`SPOTIFY_OPEN_ACCESS`); when extended quota is granted the "request access" option drops out with a flag flip, no redesign.
- **$0, no Spotify writes, read-only scopes.** Inherited from the product principles. (Optional scope addition `user-read-recently-played` for fresher taste signal is **deferred and unscoped** — it forces re-consent for existing connections; revisit after open access.)

## Definition Of Done (Outcomes)

1. **No silent losses** ✅ (C2/PRD 43): every Spotify entry point routes through the chooser's pre-redirect gate; misses land on the inline tester form, never on Spotify's 403.
2. **The owner hears about every request** ✅ (C1/PRD 42): Resend notification per genuine new request (`ADMIN_NOTIFY_EMAIL`); admin queue on `/admin/spotify-access` with the cross-store seat counter (vs. 25, warning at 22+).
3. **The loop closes** ✅ (C1/PRD 42): approve (dashboard-first order enforced by copy) sends the "you're in" invite (`approved → invited`); the gate then passes that email straight to Spotify.
4. **One person, one account, no dead ends** ✅ (C3/PRD 44): `allowDangerousEmailAccountLinking` on Spotify; both convergence directions proven in real SQL (`test:one-identity` against a throwaway Neon branch, 9/9); `OAuthAccountNotLinked` remains only for the documented email-mismatch edge with working recovery copy.
5. **Every auth surface is the product's own** ✅ (C2/PRD 43): custom `pages.signIn` (`/auth/signin`) + existing `pages.error`; no NextAuth default reachable in the funnel.
6. **The permanent fix is filed** ◐ (C4/PRD 45): `/privacy` live + footer-linked, submission text + dashboard checklist + one-flag go-live runbook recorded in the PRD; the dashboard filing itself is the owner's action (external) — PRD 45 parks in "prepared — awaiting filing."

## Outcome → PRD Map

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 42 — Tester Request Loop](prds/prd-42-tester-request-loop.md) | 2, 3 | The capture-and-close machinery: `tester_requests` table, request API + form, Resend notification to the owner, admin list/approve against the 25-seat budget, "you're in" email. Self-contained; wires the deployed dead "Request Spotify access" button immediately. |
| C2 | [PRD 43 — Sign-In Chooser & Pre-Redirect Gate](prds/prd-43-signin-chooser-and-gate.md) | 1, 5 | The interception point: one chooser component replacing every direct `signIn("spotify")` call (9 surfaces found in the pulled code), gate check against approved testers before redirecting, custom `pages.signIn`, `SPOTIFY_OPEN_ACCESS` flag. |
| C3 | [PRD 44 — One Identity: Auto-Link & Recovery](prds/prd-44-one-identity-autolink.md) | 4 | The convergence fix: `allowDangerousEmailAccountLinking`, link-while-signed-in verified end-to-end, error-copy updates, tests that `OAuthAccountNotLinked` is unreachable in supported flows. |
| C4 | [PRD 45 — Extended Quota Readiness](prds/prd-45-extended-quota-readiness.md) | 6 | The exit ramp: privacy policy page, public app description, dashboard submission checklist, and the documented open-access flag flip that retires the gate. |

## Delivery Sequence & Dependencies

```
C1 Tester Request Loop        (standalone; ships value day one — the dead button comes alive)
 └──> C2 Sign-In Chooser & Gate   (the chooser's "Request access" option calls C1's form/API;
        │                          the gate reads C1's approved-tester status)
        └──> C3 One Identity      (auto-link matters most once C2 routes approved testers through;
                                   its copy changes touch C2's surfaces)
C4 Extended Quota Readiness   (parallel external track; only its flag-flip step depends on C2)
```

- **C1 first** — no dependencies, immediately stops the intent bleed via the existing error page's button.
- **C2 second** — the epic's centerpiece; depends on C1's table and status read.
- **C3 third** — a small cycle; sequenced after C2 so copy/UX changes land once.
- **C4 runs in parallel from day one** (Spotify review time is the long pole); its final step (flag flip, gate retirement) waits on C2.

## Shared Architecture (decided once here)

- **`tester_requests`** — `id, email (citext/lowercased, unique), note, source (which surface), status ('pending'|'approved'|'declined'|'invited'), created_at, updated_at`. Requests are upserted by email (re-applying refreshes `updated_at`, never duplicates). Not joined to `users` — applicants usually have no account yet; convergence happens naturally when they later sign in with the same email.
- **Gate truth lives in `tester_requests.status`**, mirroring the Spotify dashboard allowlist by owner discipline (approve here **after** allowlisting there — the admin UI copy enforces the order). The gate check needs an email: signed-in users are checked directly; anonymous chooser users who pick "Continue with Spotify" state their email once (also pre-fills the request form on a miss).
- **All emails via Resend** — already a production dependency (magic links); notification + invite emails reuse it. New env: none beyond the existing `AUTH_RESEND_KEY`; owner notification address configured, not hardcoded.
- **`SPOTIFY_OPEN_ACCESS`** env flag (via `lib/auth-flags.ts` pattern): `false` = gate + chooser "request access" active; `true` = chooser goes straight to Spotify for everyone. One flag, read in one place (the chooser/gate), so the C4 flip is a config change.
- **Admin follows the established pattern** (`app/api/admin/*`, password-gated): a Tester Requests panel with the pending queue, seat count (approved / 25), and approve/decline actions.
- **System Registry discipline:** new nodes registered in `lib/system-registry.ts`, system map regenerated, `npm run test:registry` green — every cycle.

## Risks

- **Numbering/phase collision with unpulled upstream work** — see the note up top; resolve at C1 kickoff.
- **Dashboard/table drift:** the Spotify allowlist and `tester_requests` are reconciled by hand; if they drift, an approved user still 403s (or a dashboard-added user is still gated). Mitigated by the enforced approve-order copy, the seat counter, and treating Spotify's 403 fallthrough as a visible error state (C2), not a silent one.
- **Auto-link stance change:** deployed copy promises no behind-the-back merging. Mitigated by C3 shipping the copy update in the same commit as the behavior change, and by the fact both doors verify email possession.
- **Extended quota review is external and slow;** the epic's structure assumes the gate may live for months — hence C4 files early and everything else works at 25 seats.
- **Email mismatch edge:** a user whose Spotify email differs from their AVLmc email can still produce `OAuthAccountNotLinked` post-C3. Handled: the recovery path (sign in first, connect from profile) stays intact and tested; the error page explains it.

## Acceptance Criteria (epic level)

- A brand-new visitor with zero context can: try Spotify → get caught by the chooser → apply → (owner approves) → receive the invite → sign in with Spotify → see taste-fed discovery — with the owner notified at the apply step, and no step landing on a Spotify error page or an unstyled default.
- An email-first user who becomes a tester converges onto their existing account with their preferences intact — automatically.
- With `SPOTIFY_OPEN_ACCESS=true` in a preview deployment, the chooser offers Spotify directly to everyone and no gate code executes.
- All four cycle PRDs carry shipped Implementation Status sections per house discipline.
