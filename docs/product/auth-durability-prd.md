# Auth Durability Hardening — Master PRD (Epic)

Updated: July 12, 2026

**Status: C1 shipped (Jul 12, 2026); C2–C3 open.** Decomposed into three dependency-sequenced
cycle PRDs (47–49). [PRD 47 — Sign-In Event Resilience](prds/prd-47-signin-event-resilience.md)
(**shipped Jul 12, 2026** — F2 closed; see the C1 build note below; the manual F2 repro remains an
owner action, tracked in `backlog.md`); [PRD 48 — Right-Door Failure Recovery](prds/prd-48-right-door-failure-recovery.md)
and [PRD 49 — Environment Reach](prds/prd-49-environment-reach.md) are next.

This is **Phase 19** in [`master-roadmap.md`](master-roadmap.md). It is driven directly by the
[July 8, 2026 auth durability audit](auth-durability-audit-2026-07-08.md), which graded production
auth **PASS** (all three doors live, sessions durable, one-identity model verified in prod data)
and surfaced findings F1–F7. This epic hardens the findings that are about *durability* —
**F2 through F6** — so the pass holds under schema drift, expired links, provider mix-ups, hostile
browsers, and non-production environments.

> **Deliberately excluded: F1** (Spotify auto-link rests on an unverified email — a latent
> account-takeover surface once Spotify access opens). The product owner deferred it (July 8, 2026)
> because exposure today is ≈ 0 (5-seat allowlist; Spotify dev-mode `/v1/me` 403 fails sign-in for
> non-seated users). It is **parked in [`backlog.md`](backlog.md)** with a hard trigger — *fix
> before `SPOTIFY_OPEN_ACCESS=true` is ever flipped, or if the project grows* — and the PRD 45
> go-live runbook now carries it as pre-flight step 0. F7 (expired token/session hygiene, info-level)
> rides along as an optional item inside C1.

## One-Sentence Goal

Make a **passing** auth system **unbreakable in the ways it can still break**: no post-sign-in side
effect can fail a successful sign-in, every failure recovers through the *right* door for the
provider the listener actually used, and every environment a listener arrives from — in-app
webviews, local dev, preview deploys — either works or says honestly why not.

## How To Use This Document

Umbrella tracker for Phase 19, same contract as the other epics
([`account-signin-linking-prd.md`](account-signin-linking-prd.md) /
[`spotify-access-prd.md`](spotify-access-prd.md)): the epic owns shared posture, cross-cutting
rules, and sequencing; each cycle PRD owns one independently shippable increment. The audit doc is
the evidence base — each cycle names the findings it closes.

## Current State (Brownfield Baseline — what the audit verified good)

- **All three doors live in production** with correct callback URLs (`/api/auth/providers`
  checked live); prod env complete; `AUTH_URL` correctly unnecessary (`trustHost`).
- **Sessions are durable everywhere**: database strategy, server-set first-party
  `__Secure-authjs.session-token` (httpOnly, Secure, SameSite=Lax, 30-day rolling) — survives
  refresh/restart on Chrome/Firefox/Safari/Edge/iOS/Android; Safari ITP does not apply to
  server-set cookies.
- **One-identity model proven in prod data**: google + spotify linked on one `users` row, zero
  duplicate or cross-owned emails; `user_emails` global case-insensitive unique index; the
  linking decision matrix and failure taxonomy are pure and unit-tested (suites green).
- **Spotify reconnect durability shipped**: re-sign-in refreshes stored tokens;
  `invalid_grant` → typed reconnect state.

What can still break — and what this epic closes:

| Audit finding | The break | Cycle |
| --- | --- | --- |
| **F2** (High) | `events.signIn` is awaited inside the `@auth/core` callback; the one unguarded step (`recordMusicConnection`) can fail the entire Spotify sign-in on schema drift — the project's known prod failure mode | **C1** |
| **F3** (Medium) | Expired/used magic link (`?error=Verification`) has no taxonomy mapping → falls to `unknown`, whose primary action is the **Spotify** gate — wrong door for an email user; also the exact path scanner-burned links hit | **C2** |
| **F4** (Medium) | All OAuth callback errors map to Spotify-beta copy — a failed **Google** callback shows "Spotify import is invite-only" + a Spotify CTA | **C2** |
| **F5** (Low) | In-app webviews (Instagram/Facebook/TikTok) dead-end on Google's `disallowed_useragent` page; the shipped `browser_fallback` taxonomy entry is unreachable dead code — nothing detects webviews | **C3** |
| **F6** (Low) | Local-dev and preview callback posture is unverified/undocumented: Google needs a localhost redirect URI; Spotify dev requires loopback-IP (`127.0.0.1`, not `localhost`); OAuth on preview deploys always fails `redirect_uri_mismatch` while the env vars suggest it should work | **C3** |
| **F7** (Info) | Expired `verification_token` / `sessions` rows are never purged (Auth.js deletes on use/access only) | C1 (optional) |

**Reusable spine every cycle plugs into:** the `events.signIn` handler in `auth.ts` (whose
avatar / `recordProviderEmail` / anonymous-hand-off steps already model the "best-effort — never
block sign-in" posture C1 completes); the pure failure taxonomy `lib/auth-failures.ts` +
`tests/auth-failures.test.ts` + `AuthRecovery` / custom sign-in page (C2 extends the table, no new
surface); `SignInChooser` as the single guarded entry to every door (C3 adds environment awareness
there); the `/api/sync/cleanup` cron (F7); and the System Registry discipline
(`lib/system-registry.ts` → `npm run generate:system-map` → `npm run test:registry`).

## Posture (Locked — inherited by every cycle)

- **Sign-in is sacred.** Once Auth.js has created/linked the user and session, *nothing* in our
  event handlers may throw. Every side effect is best-effort: log and continue. (This generalizes
  the posture three of the four existing steps already follow.)
- **One taxonomy, right door.** Every failure keeps mapping to exactly one
  `{accurate copy + one primary recoverable action}` entry in `lib/auth-failures.ts` — and the
  action must match the door the listener actually came through. Email failures never route to the
  Spotify gate; Google failures never show Spotify-beta copy.
- **Honest environments.** An environment that cannot complete OAuth (webview, preview deploy)
  says so up front and offers the door that works (magic link works everywhere), rather than
  letting the listener bounce off a provider error page.
- **No behavior change to what passes today.** Successful sign-in, linking, session, and
  reconnect flows are untouched; this epic only changes failure paths, side-effect error handling,
  and environment messaging.
- **`$0`, additive, Snyk-clean.** No new dependency or paid service; schema untouched (C1 is a
  try/catch posture fix, not a migration); all new first-party code passes the Snyk scan before
  "done."
- **Anonymous-first preserved.** The anonymous board payload and ranking stay byte-for-byte
  unchanged.

## Definition Of Done (Synthesized)

1. **No side effect can break sign-in** — a thrown `recordMusicConnection` (or any future
   post-sign-in step) is logged, and the sign-in still completes with a session cookie set;
   regression-tested.
2. **Every failure recovers through the right door** — an expired/used magic link offers a fresh
   link; a failed OAuth callback shows provider-neutral copy with retry + email; Spotify-beta copy
   appears only for the app's own Spotify-gate codes.
3. **Every environment is honest** — webviews get the `browser_fallback` guidance proactively
   (email door stays primary); local-dev OAuth is documented and registered
   (localhost for Google, `127.0.0.1` loopback for Spotify); the preview-deploy OAuth posture is
   decided, implemented, and documented.

## Outcome → PRD Map

| Cycle | PRD | Findings | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 47 — Sign-In Event Resilience](prds/prd-47-signin-event-resilience.md) — **Shipped (Jul 12, 2026)** | F2 (F7 not taken) | Sign-in survives its side effects: every `events.signIn` step becomes best-effort by construction, with a regression test that a throwing side effect cannot fail sign-in. Optional: expired token/session purge in the cleanup cron. |
| C2 | [PRD 48 — Right-Door Failure Recovery](prds/prd-48-right-door-failure-recovery.md) | F3 + F4 | The taxonomy learns two truths it's missing: `expired_link` (mapped from Auth.js `Verification`) recovers through the email door, and generic OAuth callback errors get provider-neutral copy — Spotify-beta copy is reserved for the app's own Spotify codes. |
| C3 | [PRD 49 — Environment Reach: Webviews, Local Dev & Previews](prds/prd-49-environment-reach.md) | F5 + F6 | The chooser becomes environment-aware (webview detection surfaces the existing `browser_fallback` guidance; Google door suppressed where Google will refuse), and the callback-registration + preview posture is verified, decided, and documented. |

## Delivery Sequence & Dependencies

```
C1 Sign-In Event Resilience        (the flow itself can no longer break — do first, it's the outage class)
 └──> C2 Right-Door Failure Recovery   (with the flow solid, every remaining failure gets honest, door-correct copy)
       └──> C3 Environment Reach        (extend the now-correct doors + copy to webviews, local dev, previews;
                                         its manual verification pass exercises C1+C2's shipped behavior)
```

- **C1 first** — it is the only finding that can take down a *working* flow (High), it's the
  smallest diff, and every later cycle's testing rides on sign-in being unbreakable.
- **C2 second** — pure-taxonomy work; independent of C1 in code but sequenced after so the failure
  copy that C3's environment messaging reuses (`browser_fallback`, the new neutral entries) is
  final before it's surfaced in new places.
- **C3 last** — it *consumes* C2's taxonomy (renders `browser_fallback` proactively) and ends with
  the owner's manual dashboard/device checklist, which doubles as the epic's live verification
  pass.
- Each cycle is independently shippable; recommended order **C1 → C2 → C3**.

**C1 build note (July 12, 2026).** Shipped as commit `bf2ed56`, closing F2. The open decision
resolved to the **helper** (`runBestEffort`), making the best-effort posture structural rather than
a convention each step could forget. The `events.signIn` body moved to `lib/auth-signin-event.ts`
(`handleSignInEvent`), where all four steps run through `runBestEffort` — which logs a stable
`signIn side-effect failed:` prefix and never throws; `auth.ts` now just delegates. Side effects are
injectable deps so `tests/signin-event.test.ts` (6) drives the contract with a throwing stub and no
DB. The `int-authjs` registry node carries the F2 gotcha. F7 (token/session purge) was **not** taken.
`lib/music.ts` was left unchanged — the wrap is the fix, not schema tolerance. The only remainder is
the owner's manual F2 repro (drop the `music_connections` unique constraint on a throwaway Neon
branch → sign-in still round-trips), tracked in `backlog.md`.

## Cross-Cutting Risks

- **Silent failure hiding real breakage (C1).** Making side effects best-effort could mask a
  genuinely broken taste-import path. Mitigated: failures are logged loudly (`console.error`
  reaches Vercel runtime logs), and the admin Health probe already surfaces stale
  `music_connections` — a swallowed write shows up there, not nowhere.
- **Taxonomy drift (C2).** New entries must not break the "exactly one primary action" contract or
  the existing e2e recovery spec. Mitigated: entries are added to the one table with unit tests in
  the existing suite; `e2e/auth-recovery.spec.ts` extended, not bypassed.
- **UA sniffing is inherently approximate (C3).** A missed webview UA degrades to today's behavior
  (no worse); a false positive shows a truthful "this view may block sign-in" notice with the email
  door still present — annoying, not blocking. The detector is pure and unit-tested so the token
  list is cheap to tune.
- **Owner-manual steps can stall (C3).** Dashboard registration and device spot-checks need a
  human. Mitigated: they're a written checklist in the PRD (same pattern as PRD 45's dashboard
  checklist), and everything code-side ships regardless.
- **Deferred F1 gets forgotten.** Mitigated three ways: parked in `backlog.md` with a named hard
  trigger, pre-flight step 0 in PRD 45's go-live runbook, and called out in this epic's exclusion
  note above.

## Initiative-Level Success Criteria

- A forced throw in any `events.signIn` side effect (test-injected) still yields a signed-in
  session; Spotify sign-in demonstrably survives a missing/drifted `music_connections` table.
- Clicking a consumed or expired magic link lands on copy that says the link expired and offers a
  fresh email link — no Spotify CTA anywhere in that path.
- A failed Google OAuth callback shows provider-neutral recovery copy; `spotify_limited_beta` copy
  is reachable only from the app's own Spotify-gate codes.
- Opening the sign-in chooser inside an Instagram/Facebook webview shows the browser-fallback
  guidance with email as the working door; Google's `disallowed_useragent` page is no longer
  reachable from a door we rendered.
- Local dev OAuth round-trips on the documented origins; the preview posture is implemented and
  documented; the owner checklist in PRD 49 is executed and dated.
- `$0`; no new deps; anonymous payload unchanged; typecheck / lint / affected suites /
  `test:registry` green; new code Snyk-clean.

## Open Decisions & Assumptions

- **Open (C1):** guard each side effect individually vs. extract a `runBestEffort(step)` helper
  applied to all four. Default: the helper — it makes the posture structural instead of a
  convention the next step can forget.
- **Open (C3):** preview-deploy posture — (a) document "OAuth unsupported on previews, use magic
  link" vs. (b) scope `AUTH_GOOGLE_*`/`AUTH_SPOTIFY_*` env vars to Production only so
  `lib/auth-flags.ts` hides the OAuth doors on previews automatically. Default: **(b)** — the
  flags system already renders absent-cred doors gracefully, so previews degrade honestly with
  zero new code.
- **Assumed:** PRD numbering continues **47–49**; this registers as **Phase 19**; cycle labels
  C1–C3 scope to this initiative.
- **Assumed:** no schema changes anywhere in the epic (F7's purge is `delete` statements in the
  existing cron route).
