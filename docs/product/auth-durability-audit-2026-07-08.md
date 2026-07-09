# Auth durability audit — 2026-07-08

> **Disposition (July 8, 2026):** findings F2–F6 are tracked by the
> [Auth Durability Hardening epic](auth-durability-prd.md) (Phase 19, PRDs 47–49). **F1 is
> deliberately deferred** by owner decision — parked in [`backlog.md`](backlog.md) with a hard
> trigger (fix before `SPOTIFY_OPEN_ACCESS=true`; also pre-flight step 0 in the PRD 45 go-live
> runbook). F7 rides as an optional item in PRD 47.

Scope: Google OAuth, Spotify OAuth, and email magic-link sign-in across production
(https://avlmc.vercel.app), local/dev, and browser/device classes. Audit-only — no product code
changed in this pass. Evidence: repo code, `@auth/core` v5 source in `node_modules`, live production
endpoints (`/api/auth/providers`, `/api/spotify-gate`), production Neon DB (read-only), Vercel
production env inventory (names only), current Spotify official docs, and the four auth unit suites
(all green: `test:account-linking`, `test:auth-failures`, `test:auth-email`,
`test:account-integrity`).

Pass definition used: a user can reliably sign in, return to the app authenticated, and
reconnect/link providers without account duplication or broken sessions.

## Verdict

**PASS for production as it operates today, with one high-priority latent security issue (F1) that
must be fixed before `SPOTIFY_OPEN_ACCESS` is flipped, and one robustness issue (F2) that can turn a
prod schema drift into a total Spotify sign-in outage.** Session durability, redirect handling, and
the one-identity model are correct and verified live.

## What was verified good

### Providers & environment (production, live-checked)
- `GET /api/auth/providers` registers exactly resend (email), google (oidc), spotify (oauth) with
  correct callback URLs on `https://avlmc.vercel.app/api/auth/callback/{provider}`.
- `GET /api/spotify-gate` → `{openAccess:false, spotifyEnabled:true, emailEnabled:true,
  googleEnabled:true}` — all three doors live; gate up.
- Vercel Production env has every required var: `AUTH_SECRET`, `NEXT_PUBLIC_AUTH_ENABLED`,
  `AUTH_EMAIL_ENABLED` + `AUTH_RESEND_KEY` + `AUTH_EMAIL_FROM`, `AUTH_SPOTIFY_ENABLED` + ID/SECRET,
  `AUTH_GOOGLE_ENABLED` + ID/SECRET (added 2026-07-08), `DATABASE_URL`. `AUTH_URL` is correctly
  unnecessary (`trustHost: true` on Vercel). `SPOTIFY_OPEN_ACCESS` absent → gate enforced.

### Session durability (all OSes/browsers)
- Database session strategy (`@auth/pg-adapter`); cookie is `__Secure-authjs.session-token` —
  httpOnly, Secure, SameSite=Lax, path=/, 30-day expiry, rolling (extended after 24h of age on
  activity). Verified against `@auth/core` defaults in `node_modules`.
- Because the cookie is **server-set and first-party**, it survives refreshes and browser restarts
  on Chrome, Firefox, Safari, Edge, iOS, and Android. Safari ITP's 7-day cap applies only to
  `document.cookie` script writes, not `Set-Cookie` — not a risk here. SameSite=Lax is the correct
  setting for both OAuth top-level redirect returns and magic-link opens from email clients.
- Expired session → Auth.js deletes the row on next access and the app renders signed-out; the
  `stale_session` taxonomy entry gives a working "sign out and back in" recovery.

### One-identity model (production DB, verified)
- 2 users, 0 duplicate `users.email`, 0 emails owned by more than one account. User 1 holds
  **google + spotify on one account** with 8 live sessions and 1 live music connection — the linking
  path works in practice, not just in tests.
- `user_emails` has a global case-insensitive unique index (db/schema.sql) — cross-account email
  forks are impossible at the DB level. `resolveAccountLink` (pure, tested) never silently merges a
  conflict; `withMultiEmailResolution` makes any recorded email resolve to the one account.
- Signed-in "Connect Spotify" links onto the current account via Auth.js's session-first path
  (`getUserByAccount` → link to session user); a Spotify account already attached to another user
  raises `OAuthAccountNotLinked` → `duplicate_account` recovery. Correct.

### Spotify reconnect durability
- Re-running Spotify sign-in refreshes stored tokens (`updateStoredProviderTokens` updates the
  `accounts` row — the adapter alone would not). `invalid_grant` on refresh is classified
  (`lib/spotify-reconnect.ts`), tokens cleared, connection stamped disconnected → clean "Reconnect
  Spotify" UI. The prior audit's P1 on refresh expiry is fixed.

### Redirect safety
- `safeCallbackUrl` on the sign-in page accepts only same-origin relative paths; Auth.js's default
  redirect callback constrains everything else to same-origin. No open-redirect surface found.

## Findings (most severe first)

### F1 — HIGH (security): Spotify emails are unverified; `allowDangerousEmailAccountLinking` on Spotify enables account takeover once access opens

`auth.ts` justifies the flag with "Spotify verifies its emails." Spotify's own docs (Get Current
User's Profile, checked live today) say the opposite: *"This email address is unverified; there is
no proof that it actually belongs to the user."*

**Repro (once `SPOTIFY_OPEN_ACCESS=true`, or by any of the 5 seated testers today):**
1. Attacker sets their Spotify account email to `victim@example.com` (Spotify does not verify it).
2. Attacker opens avlmc → Continue with Spotify → authorizes.
3. Auth.js `getUserByEmail` (including the multi-email resolver) finds the victim's account; the
   flag links the attacker's Spotify onto it → attacker is signed into the victim's account.

Compounding: `isProviderEmailVerified` returns `true` for spotify, so the unverified Spotify email
is recorded in `user_emails` as `verified` — making it a working **magic-link sign-in key** for the
account via `withMultiEmailResolution`.

Exposure today is near-zero (5-seat allowlist; Spotify's dev-mode `/v1/me` 403 fails sign-in for
non-seated users), which is why this is latent — but it is a hard blocker for the PRD 45 open-access
flip. Note also that Spotify's Feb 2026 migration guide lists `email` among fields removed from
`/me` for Development Mode apps (postponed for existing integrations), so the email-convergence
premise is degrading on Spotify's side regardless.

**Smallest safe fix:**
- Remove `allowDangerousEmailAccountLinking: true` from the **Spotify** provider only (keep Google —
  Google emails are provider-verified). Unauthenticated Spotify sign-in with a matching email then
  raises `OAuthAccountNotLinked` → the already-built, already-tested `duplicate_account` recovery
  ("sign in with your account email, then connect Spotify from your profile"). Signed-in linking is
  unaffected (it doesn't use the flag).
- Change `isProviderEmailVerified` to return `false` for `spotify` so Spotify-sourced emails stop
  becoming magic-link identifiers.
- Update the `duplicate_account` copy's parenthetical (it currently claims matching emails converge
  automatically for both providers).

### F2 — HIGH (reliability): unguarded `recordMusicConnection` in `events.signIn` can fail every Spotify sign-in

`@auth/core` awaits `events.signIn` **inside** the callback handler
(`@auth/core/lib/actions/callback/index.js:114`); an exception aborts the response — the DB session
row exists but the session cookie is never returned, and the user lands on `/auth/error`. Every
other post-sign-in step in `auth.ts` (avatar refresh, `recordProviderEmail`, anonymous hand-off) is
deliberately try/caught as "best-effort — must never block sign-in"; `recordMusicConnection` is not,
and `upsertMusicConnection` is a plain insert with `on conflict (user_id, provider)` and **no
schema-error tolerance**.

This project's known failure mode is exactly prod schema drift (schema.sql is applied manually — see
`prod-schema-apply`). If `music_connections` or its unique constraint drifts, **Spotify sign-in
itself breaks**, not just taste import.

**Repro:** remove (or never apply) the `music_connections (user_id, provider)` unique constraint in
a test branch → every Spotify sign-in redirects to the error page despite valid credentials.

**Smallest safe fix:** wrap the `recordMusicConnection` call in `auth.ts` in try/catch + log, same
posture as the neighboring steps. (Taste sync degrades gracefully; sign-in survives.)

### F3 — MEDIUM (email flow): expired/used magic link recovers through the wrong door

Auth.js redirects a consumed or expired verification token to `/auth/error?error=Verification`.
`resolveAuthFailure` has no `verification` case → falls to `unknown`, whose primary action renders
the **SpotifyGateButton** ("Try again"). An email-only user with a stale link is pushed into the
Spotify beta gate.

This is also the exact path hit when corporate email scanners (Outlook SafeLinks etc.) prefetch the
magic link's GET and burn the one-time token before the user clicks — a real deliverability class of
failure for the email door. (Prod has 12 verification tokens, 11 expired-unclaimed.)

**Repro:** request a magic link, click it twice (or after 24h). The error page offers Spotify.

**Smallest safe fix:** add an `expired_link` taxonomy entry (severity `error`, primary action
`use_email` — "Send yourself a fresh link", href `/`) and map `case "verification"` to it in
`resolveAuthFailure`. Add the one-line test alongside the existing taxonomy tests. (A fuller
mitigation for scanner-burned links — an interstitial "confirm sign-in" button page — can wait until
there's evidence of real users hitting it.)

### F4 — MEDIUM (provider-generic copy): every OAuth callback error shows Spotify-beta copy, including Google's

`resolveAuthFailure` maps `oauthcallbackerror` / `oauthsignin` / `callback` →
`spotify_limited_beta` ("Spotify import is invite-only… Request Spotify access"). That was accurate
when Spotify was the only OAuth door; Google is now live (enabled today). A failed Google callback —
lost state cookie, aborted consent, a misregistered redirect URI — shows Spotify-beta copy and a
Spotify CTA.

**Repro:** start Continue with Google, clear cookies mid-flow (or abort at the consent screen in a
way that returns `error=Callback`) → "Spotify import is invite-only right now."

**Smallest safe fix:** Auth.js doesn't put the provider in the error param, so make these codes
resolve to a provider-neutral entry ("That sign-in didn't complete — try again, or use email") with
retry + email actions; keep `spotify_limited_beta` for the explicit
`spotify_limited_beta(_access)` codes the app raises itself.

### F5 — LOW (device-specific): in-app browsers (Instagram/Facebook/TikTok webviews) dead-end on Google, and nothing triggers the existing `browser_fallback` copy

Google blocks OAuth in embedded webviews with `disallowed_useragent` **on Google's own page** — the
user never returns to avlmc, so the taxonomy's `browser_fallback` entry (which exists and has good
copy) is currently unreachable dead code: nothing detects webviews or maps to it.

**Repro (iOS or Android):** open an avlmc link from Instagram DMs → Continue with Google →
Google's disallowed_useragent screen inside the webview; no path back.

**Smallest safe fix:** in `SignInChooser`, detect the common webview UA markers (`FBAN|FBAV|
Instagram|Line|TikTok|GSA/`, or `wv` on Android) and render the `browser_fallback` message above
the doors (or hide the Google door there). Magic link is naturally immune — the emailed link opens
in the default browser, where the session then correctly lives.

### F6 — LOW (local/dev + preview): callback registration checklist

Not verifiable from this environment (provider dashboards); confirm once:
- **Google console** redirect URIs must include `https://avlmc.vercel.app/api/auth/callback/google`
  and, for local dev, `http://localhost:3000/api/auth/callback/google`.
- **Spotify dashboard**: `https://avlmc.vercel.app/api/auth/callback/spotify` (PRD 45 records this).
  For local dev, Spotify's current rules require HTTPS **except loopback IP literals** — register
  `http://127.0.0.1:3000/api/auth/callback/spotify` and run dev against `127.0.0.1`, not
  `localhost`.
- **Preview deployments**: all auth env vars are exposed to Preview, but per-deploy
  `*.vercel.app` preview URLs can't be pre-registered with Google/Spotify → OAuth on previews fails
  with `redirect_uri_mismatch` by design. Magic link works on previews (the link derives its origin
  from the requesting host). Treat OAuth-on-preview as unsupported, or don't expose the OAuth env
  vars to Preview so the doors hide gracefully there.
- Local dev fallback secret (`local-auth-secret-change-me`) is dev-only; prod correctly hard-fails
  without `AUTH_SECRET`.

### F7 — INFO: token/session hygiene

Auth.js only deletes verification tokens on use and sessions on access. Prod carries 11 expired
verification tokens and 2 expired sessions — harmless at this scale; if desired, add
`delete from verification_token where expires < now()` (and same for sessions) to the existing
`/api/sync/cleanup` cron.

## Browser/device matrix (analysis basis)

| Surface | Verdict | Why |
| --- | --- | --- |
| Chrome / Firefox / Edge on Windows & Linux | Pass | First-party, server-set Lax cookie; no tracker-blocking interaction. |
| Safari macOS / iOS | Pass | ITP does not cap `Set-Cookie` session cookies; Lax survives OAuth top-level redirects. |
| Android Chrome / mobile web | Pass | Same first-party cookie model. |
| Private/incognito windows | Pass (session-scoped) | Sign-in works; cookie gone when window closes — expected. Gate's remembered-email localStorage degrades gracefully. |
| In-app webviews (IG/FB/TikTok) | **Fail for Google** (F5) | Google blocks webview OAuth; no proactive fallback. Magic link self-heals into the default browser. |
| Corporate email (Outlook/SafeLinks) | **At risk for magic link** (F3) | Scanner prefetch can burn the one-time token; recovery copy currently points at Spotify. |

## Recommended order of fixes

1. **F2** — try/catch around `recordMusicConnection` (one-line class of fix; removes a whole outage
   class).
2. **F1** — drop `allowDangerousEmailAccountLinking` from Spotify + mark spotify emails unverified.
   Blocker for the `SPOTIFY_OPEN_ACCESS` flip; safe to do now (recovery path already shipped).
3. **F3 + F4** — two small taxonomy entries + mappings (pure code, existing test suite pattern).
4. **F5** — webview detection in the chooser.
5. **F6** — 10-minute dashboard checklist; decide the preview posture.
