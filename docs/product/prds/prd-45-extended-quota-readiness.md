# PRD 45: Extended Quota Readiness

Part of the [Open Spotify Access initiative](../spotify-access-prd.md) (Phase 17). Cycle **C4** — a **parallel external track**, started day one because Spotify's review is the initiative's long pole. Satisfies epic outcome **6 (the permanent fix is filed)**. Only its final step (the flag flip) depends on C2 (PRD 43).

## Goal

**Retire the 25-seat Development Mode cap: get AVL Music Companion's Spotify app through Extended Quota Mode review by shipping the public prerequisites Spotify checks, filing a submission that accurately represents the app, and documenting the one-line flag flip that opens Spotify sign-in to everyone the day it's granted.**

## Summary

Spotify's Extension Request review checks that the app is a real, publicly-describable product with a privacy policy and compliant API usage. This cycle ships a `/privacy` page (truthful to the actual data practices: read-only scopes, server-side tokens, taste rows, deletion path), tightens the Spotify Developer Dashboard app record (name, description, website, redirect URIs), files the request, and writes the go-live runbook: on grant, set `SPOTIFY_OPEN_ACCESS=true`, retire the gate, and keep the tester table as history. Because review timelines are external and opaque, everything else in the epic works indefinitely at 25 seats.

## Implementation Status

**Code shipped; submission prepared — awaiting the owner's dashboard filing (July 2, 2026).**

Delivered in code:

- **`/privacy` page** (`app/privacy/page.tsx`, registered `ui-privacy-page`): dated, house voice,
  every claim verified against the code before publishing — read-only scopes exactly as `auth.ts`
  requests them (`user-read-private`, `user-read-email`, `user-top-read`), tokens server-side (the
  PRD 27 leak-audit posture), disconnect deletes tokens and "remove imported data" deletes
  `music_profile_items` (`lib/music.ts`), anonymous-session cookie behavior, cookieless Umami
  analytics (`app/layout.tsx`), no selling/ads/pay-to-play, deletion contact
  (`avlmc@agent828.com` — the address already public in the sign-in email copy).
- **Discoverability**: a site-wide footer (`app/layout.tsx`) links `/privacy` from every page —
  Spotify reviewers check for it — and `/spotify-access` links it too.
- **Flag-flip path verified** at the unit level: the C2 gate matrix (`test:spotify-gate`) proves
  `SPOTIFY_OPEN_ACCESS=true` ⇒ every outcome is `allowed` with zero store reads, and the chooser
  hides "Request access". Re-run in a preview deployment with the env set as the final pre-flip
  check (runbook step 3).

### Dashboard checklist (owner action, ~10 minutes)

In [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → the AVLmc app:

1. App name: **AVL Music Companion**.
2. Description: use the submission text below (first paragraph).
3. Website: `https://avlmc.vercel.app`.
4. Redirect URI (exact): `https://avlmc.vercel.app/api/auth/callback/spotify`.
5. Privacy policy URL: `https://avlmc.vercel.app/privacy` (live as of this cycle).
6. Then **Extension Request / Quota Extension** → submit the text below. Paste the submitted text
   + date here when sent (house snapshot discipline), and log Spotify's responses here as they
   arrive.

### Submission text (ready to paste)

> AVL Music Companion (avlmc.vercel.app) is a free community discovery board for live music in
> Asheville, NC. It lists upcoming local shows and helps listeners find the ones worth attending.
>
> Spotify integration is optional and read-only. We request three scopes: `user-read-email` and
> `user-read-private` to sign the listener in and attach their Spotify identity to one app
> account, and `user-top-read` to read their top artists and tracks so the public event listings
> can be ranked against their taste ("shows like what you already listen to"). We never write to
> Spotify: no playlist changes, no follows, no playback control, no posting.
>
> Tokens are stored server-side and never exposed to other users; listeners can disconnect in-app
> (which deletes our tokens and, optionally, the imported taste data) or revoke via Spotify. Our
> privacy policy is at https://avlmc.vercel.app/privacy. The app is free, carries no ads, and
> sells nothing — including placement (no pay-to-play).

### Go-live runbook (on grant)

1. Grant email received → paste date/terms here.
2. Vercel → Project → Settings → Environment Variables: set `SPOTIFY_OPEN_ACCESS=true`
   (Production) → redeploy.
3. Verify: the sign-in chooser shows no "Request access"; a non-allowlisted account completes
   Spotify sign-in in production; `GET /api/spotify-gate` returns `openAccess: true`.
4. Optional courtesy email to remaining `pending` rows in `tester_requests` (admin panel has the
   list): "no invite needed anymore — sign in now."
5. Update the epic + this PRD; the dev-mode allowlist and both request queues become inert
   history (keep the tables).

### Fallback stance (if declined or stalled)

The C1–C3 loop is the operating model at 25 seats indefinitely: the chooser catches every
would-be tester, the owner triages with the cross-store seat counter, and seats are recycled by
removing inactive entries in the dashboard's User Management (then declining/re-opening the
matching request rows). Nothing else in the epic depends on the grant.

## Goals

- A public **`/privacy`** page covering, accurately and plainly: what is collected (email for magic links; Spotify profile, top artists/tracks under read-only scopes; per-listener preference/activity rows), where tokens live (server-side in Auth.js `accounts`, never in public payloads — per the PRD 27 leak-audit posture), what is never done (no Spotify writes, no selling data, no pay-to-play), retention, and a contact/deletion path.
- Footer/nav link to `/privacy` (Spotify reviewers look for discoverability).
- Spotify Developer Dashboard record audit: production app name ("AVL Music Companion"), accurate description, website `https://avlmc.vercel.app`, exact redirect URI(s), privacy policy URL attached.
- The **Extension Request** submitted, with the submission text (scopes used and why: `user-read-private`, `user-read-email`, `user-top-read` — taste-informed local show discovery) recorded in this PRD for the record.
- A **go-live runbook** in this PRD: grant received → set `SPOTIFY_OPEN_ACCESS=true` in Vercel → verify chooser drops "Request access" and gate short-circuits (C2's flag test) → announce to `tester_requests` emails (optional courtesy send) → mark epic outcome 6 done.
- A documented **fallback stance** if Spotify declines or stalls: the C1–C3 loop is the operating model at 25 seats; seats are recycled by removing inactive dashboard entries (admin panel's seat counter supports the triage).

## Non-Goals

- **No** new scopes in the submission (`user-read-recently-played` stays deferred per the epic — don't complicate review).
- **No** terms-of-service page unless review feedback requires one (keep $0-effort posture; add reactively).
- **No** marketing site work beyond the privacy page and dashboard record.

## Requirements

### `/privacy` page

- Static server component, house voice, dated; sections: data collected, how it's used (discovery personalization), Spotify specifics (read-only, revocable at accounts.spotify.com, tokens server-side), email specifics (magic links via Resend), sharing (none), retention & deletion (contact email; disconnect removes tokens per existing `MusicAccountPanel` flow), changes.
- Reviewed against actual behavior in the pulled code before publishing — every claim must be true (the PRD 27 leak-audit tests are the evidence base).
- Registered in the system registry; linked from the site footer and the `/spotify-access` page (C1).

### Dashboard + submission

- Dashboard record fields verified against production; privacy URL added.
- Extension Request filed; submission text + date + scope justifications pasted into the Implementation Status section of this PRD when sent (house snapshot discipline).
- Any Spotify review feedback and resolution logged here as it arrives.

### Go-live runbook (recorded in this PRD)

1. Grant email received → paste date/terms here.
2. Vercel env: `SPOTIFY_OPEN_ACCESS=true` (production).
3. Verify: chooser shows no "Request access"; gate short-circuits (C2 acceptance tests re-run); a non-allowlisted account completes Spotify sign-in in production.
4. Optional courtesy email to remaining `pending` tester requests: "no invite needed anymore — sign in now."
5. Epic status updated; dev-mode allowlist becomes inert.

## Dependencies

- **C2 (PRD 43)** for the flag flip step only; the privacy page and submission have no code dependencies and start immediately.
- Truthfulness dependencies: the pulled code (verify claims), PRD 27's leak-audit posture (evidence).

## Risks

- **Review is slow, opaque, or declined.** Mitigated structurally: the epic's other cycles make 25 seats a workable operating mode indefinitely; the fallback stance documents seat recycling.
- **Privacy page drifts from behavior** as features ship. Mitigated: claims kept high-level and true-by-test where possible; future PRDs touching data practices must touch `/privacy` (noted in the epic's cross-cutting rules).
- **Policy changes on Spotify's side** (quota tiers, review criteria have shifted before). Accepted; the runbook is short enough to adapt.

## Acceptance Criteria

- `/privacy` is live, linked, accurate, and registered; `test:registry`, lint, typecheck, `next build` green.
- The dashboard record is complete and consistent with production; the Extension Request is filed and its text recorded here.
- The go-live runbook exists and the flag-flip path is verified in a preview deployment (C2's `SPOTIFY_OPEN_ACCESS=true` acceptance run).
- If granted during this cycle: production open access verified per the runbook. If not: fallback stance documented and the PRD parks in "Filed — awaiting review" state rather than blocking the epic.

## Test Scenarios

- Preview deployment with `SPOTIFY_OPEN_ACCESS=true` → chooser offers Spotify to all, no gate call, no "Request access" option (re-run of C2 flag tests).
- `/privacy` renders anonymously, is reachable from the footer and `/spotify-access`, and appears in the regenerated system map.
- Claim audit: each privacy-page claim maps to a code path or existing test (checklist in PR description).
