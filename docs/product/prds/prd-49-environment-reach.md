# PRD 49: Environment Reach — Webviews, Local Dev & Previews

Part of the [Auth Durability Hardening initiative](../auth-durability-prd.md) (Phase 19). Cycle
**C3** (capstone; ends with the epic's manual verification pass). Closes audit findings **F5 +
F6** (Low) from the [July 8, 2026 auth durability audit](../auth-durability-audit-2026-07-08.md).
Depends on **C2 (PRD 48)** — it surfaces the finalized taxonomy copy in new places.

## Goal

**Every environment a listener arrives from either works or says honestly why not.** In-app
webviews get the browser-fallback guidance *before* they bounce off Google's refusal page; local
dev OAuth round-trips on documented origins; preview deployments stop advertising doors that
cannot work there.

## Summary

Three environment classes fail silently today. (1) **In-app webviews** (Instagram, Facebook,
TikTok, Google app): Google refuses OAuth in embedded webviews with `disallowed_useragent` **on
Google's own page** — the listener never returns to avlmc, so the shipped `browser_fallback`
taxonomy entry (PRD 37) is unreachable dead code. (2) **Local dev**: Google needs a
`http://localhost:3000` callback registered; Spotify's current rules require HTTPS **except
loopback IP literals** — `http://127.0.0.1:3000/api/auth/callback/spotify` is registerable,
`http://localhost` is not; none of this is verified or written down. (3) **Preview deploys**: all
auth env vars are exposed to Preview, but per-deploy `*.vercel.app` URLs can't be pre-registered
with either provider — OAuth on previews always dies with `redirect_uri_mismatch` while magic link
(which derives its origin from the request) works fine. This cycle adds a pure, unit-tested
webview detector feeding the chooser, and turns the registration/preview posture from tribal
knowledge into a decided, documented, executed checklist.

## Implementation Status

**Planned.**

## Background: evidence

- Audit F5 repro: open an avlmc link from Instagram DMs (iOS or Android) → Continue with Google →
  Google's `disallowed_useragent` screen inside the webview; no path back. Magic link is naturally
  immune — the emailed link opens in the default browser, where the session then correctly lives.
- Audit F6: Spotify redirect-URI rules (HTTPS except loopback literals) per
  https://developer.spotify.com/documentation/web-api/concepts/redirect_uri; PRD 45 records only
  the production URI. Preview env exposure confirmed via `vercel env ls` (all `AUTH_*` vars are
  Production + Preview).

## Goals

- **Webview detection, pure + tested:** a small `lib/browser-env.ts` (`isEmbeddedWebview(ua)`)
  recognizing the common tokens (`FBAN|FBAV|Instagram|Line|Twitter|TikTok|GSA/|; wv)`), unit
  tested against a fixture list of real UA strings (positive + negative — desktop/mobile
  Safari/Chrome/Firefox must not match).
- **Chooser becomes environment-aware:** in a detected webview, `SignInChooser` renders the
  `browser_fallback` message (from the taxonomy — single source of copy) above the doors and
  suppresses the Google door; email stays primary (it self-heals into the default browser). The
  Spotify door follows the same suppression (same webview cookie/UA risks), unless testing shows
  it reliably works — decide during the cycle with the device pass.
- **Local-dev registration executed + documented:** Google console gains the
  `http://localhost:3000/api/auth/callback/google` URI; Spotify dashboard gains
  `http://127.0.0.1:3000/api/auth/callback/spotify`; the dev origin guidance ("use 127.0.0.1 for
  Spotify") lands in the schema-apply/deployment runbook doc
  ([`deployment-auth-investigation.md`](../deployment-auth-investigation.md)) next to the existing
  env guidance.
- **Preview posture decided + implemented:** default per the epic — scope `AUTH_GOOGLE_*` and
  `AUTH_SPOTIFY_*` to **Production only** in Vercel so `lib/auth-flags.ts` hides the OAuth doors
  on previews automatically (the flags system already renders absent-cred doors gracefully); magic
  link remains the preview sign-in. Documented in the same runbook.
- **Epic verification pass (owner checklist, dated in this PRD when run):** webview spot-check
  (Instagram or Facebook on one iOS + one Android device), local-dev Google + Spotify round-trip,
  a preview deploy showing email-only doors, plus a production pass of the C1/C2 behaviors
  (Spotify sign-in round-trip; `?error=Verification` copy).

## Non-Goals

- **No** attempt to *complete* OAuth inside webviews (escape-to-browser tricks like
  `x-safari-`/intent URLs are brittle); the fix is honest guidance + the door that works.
- **No** custom preview domains or per-preview redirect-URI automation.
- **No** change to production OAuth behavior for normal browsers.

## Requirements

### Detection + chooser

- `lib/browser-env.ts`: pure, no imports, exported token list; unit suite
  (`tests/browser-env.test.ts` or folded into an existing pure suite) with real-UA fixtures.
- `components/SignInChooser.tsx`: reads `navigator.userAgent` client-side (it's already a client
  component); webview state renders the `browser_fallback` taxonomy message + suppressed OAuth
  door(s). No layout change for normal browsers.

### Ops + docs (owner actions recorded, PRD 45 dashboard-checklist pattern)

- Google + Spotify dashboard URI additions executed; date + what-was-added recorded here.
- Vercel env scoping change executed (`vercel env` — move the four OAuth creds to
  Production-only); verified by loading a preview deploy and seeing email-only doors.
- Runbook doc updated (dev origins, preview posture); `Updated:` stamps bumped.

### Architecture & quality

- Register nothing new unless `browser-env` earns a registry node (it should not — it's a chooser
  implementation detail; add an `implementationNotes` line to the chooser/auth node instead).
- typecheck / lint / new unit suite / `test:registry` green; touched files Snyk-clean.

## Risks

- **UA sniffing is approximate.** Missed webview → today's behavior (no worse). False positive →
  truthful warning + a still-working email door. Token list is pure/tested, cheap to tune.
- **Env scoping could break a legitimate preview test of OAuth.** Accepted: preview OAuth never
  worked (URI mismatch); if a real need appears, a stable preview alias + registered URI is the
  future fix, not re-exposing the creds.
- **Device checklist needs a human.** Everything code-side ships regardless; the checklist is
  written, small, and dated when run — same discipline as PRD 45.

## Acceptance Criteria

- In a simulated webview UA (unit + a real device spot-check), the chooser shows browser-fallback
  guidance, no Google door, and a working email door; normal browsers render exactly today's
  chooser.
- Local dev completes a full Google round-trip on `localhost` and a full Spotify round-trip on
  `127.0.0.1`, both documented.
- A preview deployment shows the email door only; production shows all three doors (live
  `GET /api/spotify-gate` check on both).
- Owner checklist executed and dated in this PRD.
- typecheck / lint / unit suites / `test:registry` green; touched files Snyk-clean.

## Test Scenarios

- `isEmbeddedWebview` fixtures: Instagram iOS, FBAV Android, Android `; wv)`, TikTok, Google app
  (GSA) → true; Safari iOS, Chrome Android, Firefox desktop, Edge desktop → false.
- Chooser with webview UA → fallback message + no Google door; with desktop UA → unchanged DOM.
- Preview deploy: `/api/spotify-gate` reports `googleEnabled: false, spotifyEnabled: false,
  emailEnabled: true` once creds are Production-scoped.
- Regression: production chooser + gate behavior unchanged (existing e2e still green).
