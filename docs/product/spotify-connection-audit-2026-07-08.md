# Spotify connection audit - 2026-07-08

Audit-only handoff for Claude. No product code was changed in this pass; this markdown file is the
durable artifact.

## Scope

User report: "the spotify connection is broken AGAIN." The original temp screenshot paths attached
in the Codex UI were not available in WSL, but two untracked screenshots later appeared in the repo
root and were inspected:

- `/home/bam/projects/AVLmc/Screenshot 2026-07-08 150025.png`
- `/home/bam/projects/AVLmc/Screenshot 2026-07-08 150151.png`

They were not created or modified by Codex and are intentionally not part of this audit artifact.
The audit is based on those screenshots, repo inspection, focused tests, local env shape, and current
Spotify official docs.

Workspace: `/home/bam/projects/AVLmc`, WSL-native tools only.

## Executive summary

The concrete failure shown in the screenshots is gate-mirror drift:

- AVLmc says `brettmccall@gmail.com` "isn't on the beta list" in the Connect Spotify flow.
- Spotify Developer Dashboard User Management for the AVLmc app shows `brettmccall@gmail.com`
  already added, with `1/5 added`.

So the user appears allowlisted in Spotify, but AVLmc's own pre-redirect gate does not believe the
email is seated. That means the production `tester_requests` / `spotify_access_requests` mirror is
missing/stale for that email, the gate cannot read it, or the production app is pointed at a different
DB/env than the operator expects.

This is not obviously a new local gate-code regression. The focused gate/auth tests are green, and
direct `signIn("spotify")` is still guarded to `components/SignInChooser.tsx`.

The durable problem is drift between AVLmc's Spotify operating model and Spotify's current
Development Mode rules:

- AVLmc still has code, admin copy, tests, schema comments, and generated registry text that model
  Development Mode as a 25-user allowlist.
- Spotify's current docs now say Development Mode requires the app owner to have Spotify Premium and
  permits up to 5 authenticated users, with existing apps grandfathered only for already-created
  users and limits on what can be added going forward.
- AVLmc's gate tables are only a mirror of a manual Spotify Developer Dashboard action. If a DB row
  says `approved`, `invited`, or `slot_added` but the dashboard user is absent, over the cap, typoed,
  tied to a different Spotify login email, or the owner Premium requirement fails, AVLmc can say
  "allowed" while Spotify still rejects the user.

There are also two live-verification risks that the repo cannot prove locally:

- Spotify refresh tokens are now documented as expiring after 6 months. AVLmc refresh code treats a
  refresh failure as a generic error and does not classify `invalid_grant` into a reconnect flow.
- Spotify's 2026 Development Mode migration guide lists removed `GET /me` user fields including
  `email`. Auth.js's Spotify provider maps `profile.email`, and AVLmc's one-identity/linking path
  assumes the Spotify email exists. This must be verified against the actual AVLmc Spotify app mode,
  because Spotify's blog also says some endpoint-access changes were postponed for existing apps.

## Current Spotify facts checked

Official docs checked on 2026-07-08:

- Quota modes: Development Mode requires the owner to have Premium, allows up to 5 authenticated
  Spotify users, and non-allowlisted users may log in but API requests with their token receive 403:
  https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- February 2026 announcement: new Development Mode restrictions include Premium owner, one client ID,
  up to five authorized users, and reduced endpoint access. Existing integrations got the Premium,
  authorized-user cap, and one-client-ID limits; endpoint-access changes for existing integrations
  were postponed per the March 9 update:
  https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Migration guide: existing apps with more than 5 users are grandfathered for retained users, but
  limits restrict what can be created or added going forward; the guide also flags removed fields and
  restricted endpoints for Development Mode:
  https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Redirect URI rules: Spotify requires exact registered redirect URI match for OAuth, with HTTPS
  except loopback IP literals:
  https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- Refresh tokens: Spotify documents a 6-month refresh token lifetime and says `invalid_grant` should
  discard the refresh token and restart authorization:
  https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens

## Repo wiring map

Authoritative architecture references read first:

- `lib/system-registry.ts`
- `docs/product/system-map.generated.md`

Spotify-related runtime surfaces:

- OAuth provider: `auth.ts`
  - Scopes: `user-read-private`, `user-read-email`, `user-top-read`.
  - Provider registered only when `NEXT_PUBLIC_AUTH_ENABLED`, `AUTH_SPOTIFY_ENABLED`,
    `AUTH_SPOTIFY_ID`, and `AUTH_SPOTIFY_SECRET` are usable.
  - `allowDangerousEmailAccountLinking: true` relies on Spotify returning a verified email.
  - `events.signIn` records `music_connections` and writes tokens into the Auth.js `accounts` row.
- Feature flags: `lib/auth-flags.ts`
  - `SPOTIFY_OPEN_ACCESS=true` bypasses the gate and lets everyone go straight to Spotify.
- Gate route: `app/api/spotify-gate/route.ts`
  - `GET` returns `{ openAccess, spotifyEnabled, emailEnabled }`.
  - `POST` reads `tester_requests` and `spotify_access_requests`.
- Gate decision core: `lib/spotify-gate-core.ts`
  - `tester_requests`: `approved` / `invited` => allowed.
  - `spotify_access_requests`: `slot_added` / `approved` => allowed.
  - Most-permissive-wins across the two stores.
- UI gate: `components/SignInChooser.tsx`
  - The only real `signIn("spotify")` calls are here.
  - On gate failure it shows email entry, pending copy, or a tester request form instead of sending
    the user to Spotify.
- Spotify user-token reads: `lib/music.ts`
  - Syncs `/v1/me/top/artists` and `/v1/me/top/tracks`.
  - Refreshes tokens when access token expiry is near.
  - Maps any Spotify API 403 during user-token reads to `SpotifyLimitedBetaAccessError`.
- App-token catalog reads: `lib/spotify-app-token.ts`, `lib/artist-match.ts`
  - Uses Client Credentials for `/v1/search?type=artist`.
  - Still calls `/v1/artists/{id}/top-tracks`, which is known/expected to 403 in Development Mode
    for this app class; code makes top-tracks failure non-fatal for artist embeds.
- Seat-free fallback: `app/api/me/taste-import/route.ts`, `lib/taste-import-core.ts`
  - CSV import writes `music_profile_items` without Spotify OAuth/API or any allowlist seat.

## Findings

### P0 - Development Mode seat model is stale in durable sources

Evidence:

- `lib/tester-requests-core.ts` sets `TESTER_SEAT_BUDGET = 25` and warning at 22.
- `tests/tester-requests.test.ts` asserts "seat budget constants match Spotify Development Mode (25,
  warn at 22)".
- `components/admin/SpotifyAccessSection.tsx` tells admins "hard 25-user allowlist" and "<=25 users".
- `app/admin/spotify-access/page.tsx`, `app/api/admin/spotify-access/route.ts`, `db/schema.sql`,
  `lib/system-registry.ts`, and `docs/product/system-map.generated.md` all preserve 25-seat language.
- PRD 45 already says the premise changed: Development Mode tightened to 5 Premium test users and
  seat-free CSV taste import is the practical exit ramp, but that update did not propagate into the
  live admin/gate model.

Impact:

- Admins can over-approve against a fake 25-seat budget.
- AVLmc can show "slot added" / "approved" / "allowed" even when Spotify will still reject.
- Generated system map is now misleading and should be regenerated after registry updates once code
  is changed.

Claude fix direction:

- Decide whether OAuth is now explicitly "owner plus up to 5 testers" or whether old grandfathered
  users remain supported but no new seats are promised.
- Update constants, tests, admin copy, schema comments, system registry nodes, PRDs/runbooks that
  operators actually use, then run `npm run generate:system-map` and `npm run test:registry`.
- Do not rely on the old "25" language except as historical context.

### P0 - Gate state is not the Spotify source of truth

Evidence:

- Screenshot `Screenshot 2026-07-08 150025.png`: AVLmc signed-in profile modal says
  `brettmccall@gmail.com` is not on the beta list.
- Screenshot `Screenshot 2026-07-08 150151.png`: Spotify Developer Dashboard User Management for the
  AVLmc app shows `brettmccall@gmail.com`, dated July 2, 2026, and `1/5 added`.
- `lib/spotify-gate.ts` only checks AVLmc tables.
- `components/admin/TesterRequestsSection.tsx` and `components/admin/SpotifyAccessSection.tsx` rely
  on operator copy/confirmation to add the email in the Spotify dashboard first.
- There is no Spotify dashboard API check in code and likely none available for this use case.
- `lib/admin/health.ts` checks config and stale `music_connections` metadata, not a live OAuth
  authorization/API call or dashboard allowlist state.

Impact:

- Any dashboard/table drift produces exactly the "broken again" class: AVLmc allows a user to proceed,
  then Spotify rejects the token/API call with 403.
- The current screenshot is the inverse drift: Spotify dashboard is already allowlisted, but AVLmc
  blocks before redirect because its DB mirror does not say the email is seated.

Claude investigation checklist:

1. In Spotify Developer Dashboard for the AVLmc app, verify:
   - App owner account has active Spotify Premium.
   - App Status / quota mode.
   - Current User Management allowlist count and exact emails.
   - Whether new users can still be added or the cap is reached.
   - Redirect URI exactly includes `https://avlmc.vercel.app/api/auth/callback/spotify`.
2. In production DB, compare dashboard emails with AVLmc mirror rows:

```sql
select email, status, updated_at
from public.tester_requests
where status in ('approved', 'invited')
order by updated_at desc;

select spotify_email, status, requested_at, resolved_at
from public.spotify_access_requests
where status in ('slot_added', 'approved')
order by requested_at desc;

select distinct lower(email) as email, source
from (
  select email, 'tester_requests' as source
  from public.tester_requests
  where status in ('approved', 'invited')
  union all
  select spotify_email as email, 'spotify_access_requests' as source
  from public.spotify_access_requests
  where status in ('slot_added', 'approved')
) seats
order by email;
```

3. For the affected user, check whether the email they entered in AVLmc exactly matches the email shown
   in Spotify Developer Dashboard User Management.
4. If the dashboard is correct, fix the AVLmc mirror row for `brettmccall@gmail.com` in production
   (`tester_requests.status in ('approved','invited')` or `spotify_access_requests.status in
   ('slot_added','approved')`, depending on which request loop owns the row), then retry the Connect
   Spotify button.

### P1 - Refresh-token expiry is not handled as a reconnect state

Evidence:

- `lib/music.ts` refreshes with `grant_type=refresh_token`.
- If Spotify token refresh returns non-OK, the code throws `Could not refresh Spotify access.`
- It does not parse Spotify's error body, detect `invalid_grant`, clear unusable tokens, mark the
  connection stale/disconnected, or render a "Reconnect Spotify" recovery path.
- Spotify docs now say refresh tokens issued through Developer Dashboard apps expire after 6 months
  and `invalid_grant` should trigger reauthorization.

Impact:

- A previously working connection can "break again" after refresh token expiry or revocation.
- The user gets a generic sync failure instead of a clean reconnect flow.

Claude fix direction:

- In `refreshSpotifyAccessToken`, parse non-OK JSON/text.
- If `invalid_grant`, clear the provider tokens or mark the connection as needing reconnect, then
  return a typed error that the API/UI maps to the existing gated `SpotifyGateButton` reconnect flow.
- Add a focused unit test around refresh-token error classification.

Safe metadata query, no tokens:

```sql
select
  a."userId",
  u.email,
  a.provider,
  a.expires_at,
  a.refresh_token is not null as has_refresh_token,
  a.access_token is not null as has_access_token,
  mc.connected_at,
  mc.last_synced_at,
  mc.disconnected_at
from public.accounts a
left join public.users u on u.id = a."userId"
left join public.music_connections mc
  on mc.user_id = a."userId" and mc.provider = a.provider
where a.provider = 'spotify'
order by mc.last_synced_at nulls first;
```

### P1 - Spotify email availability must be live-verified

Evidence:

- Auth.js Spotify provider maps `email: profile.email` from `https://api.spotify.com/v1/me`.
- `auth.ts` relies on Spotify email for automatic account convergence and `recordProviderEmail`.
- Current Spotify migration docs list `email` among removed `GET /me` fields for Development Mode,
  while the 2026 announcement update says some endpoint-access changes were postponed for existing
  integrations. The actual AVLmc app behavior must be tested live.

Impact:

- If `email` is absent for this app mode, fresh Spotify sign-in and auto-linking can degrade or fork,
  and the request/gate loop that is keyed by Spotify email becomes fragile.

Claude verification:

- With an allowlisted tester token, inspect the `/v1/me` response shape server-side without logging the
  access token. Confirm whether `email` is present.
- Confirm a fresh Spotify-first sign-in creates a `users.email` value and a `user_emails` row.
- Confirm email-first -> connect Spotify still lands on the same `users.id`.

### P1 - App-token artist top-tracks is expected to be broken under Development Mode

Evidence:

- `docs/product/spotify-extended-quota-request.md` explicitly says app-token
  `GET /v1/artists/{id}/top-tracks` returns HTTP 403 under Development Mode.
- `lib/spotify-app-token.ts` still has stale comments saying the 25-user allowlist gates user
  authorization, not app-token catalog reads, and includes top-tracks in that assumption.
- `lib/artist-match.ts` mitigates this by treating top-tracks failure as non-fatal and stopping
  repeated top-tracks calls after a 403 in a run.

Impact:

- If the reported "Spotify connection" is actually hover preview / track-list failure, that is an
  expected Spotify restriction, not an OAuth connection break.
- Artist iframe embeds can still work because they are plain Spotify embed URLs and do not require API
  auth.

Claude fix direction:

- Update comments/operator docs to distinguish: artist search/embed path vs restricted top-tracks
  hover-preview path.
- Do not spend time trying to fix hover previews via OAuth unless product explicitly wants an
  allowlisted-user fallback.

### P2 - Local checkout cannot verify production DB or Vercel env

Local env shape checked without printing secrets:

- `NEXT_PUBLIC_AUTH_ENABLED`: present enabled.
- `AUTH_EMAIL_ENABLED`: present enabled.
- `AUTH_RESEND_KEY`: present but empty.
- `AUTH_EMAIL_FROM`: present nonempty.
- `AUTH_SPOTIFY_ENABLED`: present enabled.
- `AUTH_SPOTIFY_ID`: present nonempty.
- `AUTH_SPOTIFY_SECRET`: present nonempty.
- `SPOTIFY_OPEN_ACCESS`: absent.
- `AUTH_SECRET`: present but empty.
- `AUTH_URL`: absent.
- `NEXTAUTH_URL`: absent.
- `DATABASE_URL`: present but empty.

This matches the older `docs/product/design-functional-audit-2026-06-25.md` note that local
DB/auth-backed audit was blocked until `DATABASE_URL` and `AUTH_SECRET` are real values.

Vercel CLI is not installed (`which vercel` returned no path), so Codex could not run
`vercel env pull`, inspect production env, or fetch deployment logs from this environment. Installing
it with `npm i -g vercel` would unlock `vercel env pull`, `vercel logs`, and deployment inspection.

## Focused verification run in this audit

Commands run:

```sh
pwd
uname -a
which node
which npm
which python3
which git
npm run test:spotify-gate
npm run test:auth-failures
npm run test:spotify-access
npm run test:tester-requests
node --import tsx --test tests/taste-import.test.ts
```

Results:

- `test:spotify-gate`: pass, 5/5.
- `test:auth-failures`: pass, 6/6.
- `test:spotify-access`: pass, 7/7.
- `test:tester-requests`: pass, 13/13.
- `tests/taste-import.test.ts`: pass, 6/6.

One docs search command included a nonexistent `README.md` path and exited 2, but it still returned
the relevant grep hits. It is not a product failure.

## Immediate handoff plan for Claude

1. Reproduce the exact user failure with the affected account and capture the visible URL/error:
   - Current captured failure: AVLmc says `brettmccall@gmail.com` is not on the beta list while
     Spotify Dashboard shows that same email as `1/5 added`.
   - Spotify-hosted 403 before callback.
   - `/auth/error?error=OAuthCallbackError`.
   - `/api/me/music-profile` 403 `spotify_limited_beta_access`.
   - `/api/me/music-profile` 400 `Could not refresh Spotify access.`
   - Hover preview / top-tracks missing.
2. Verify Spotify Developer Dashboard state:
   - Owner Premium active.
   - App Status / quota mode.
   - Exact redirect URI.
   - Exact User Management allowlist emails and count.
   - Whether the affected user is actually in the allowlist under their Spotify account email.
3. Pull production env/logs:
   - Prefer `vercel env pull .env.local` and `vercel logs` once Vercel CLI is installed.
   - Confirm `AUTH_SECRET`, `DATABASE_URL`, `AUTH_SPOTIFY_ID`, `AUTH_SPOTIFY_SECRET`,
     `NEXT_PUBLIC_AUTH_ENABLED`, `AUTH_SPOTIFY_ENABLED`, and `SPOTIFY_OPEN_ACCESS`.
4. Reconcile DB mirror rows to dashboard:
   - `tester_requests` approved/invited.
   - `spotify_access_requests` slot_added/approved.
   - `accounts`/`music_connections` metadata for affected user, without selecting token values.
5. Decide and implement the product posture:
   - If OAuth remains invite-only: update budget/copy/tests/docs from 25 to current 5/Premium model,
     and make CSV import the primary path.
   - If Spotify granted Extended Quota: set `SPOTIFY_OPEN_ACCESS=true`, redeploy, verify
     `GET /api/spotify-gate` returns `openAccess: true`, then retire the request copy.
   - If refresh expiry is the failure: add typed invalid-grant handling and reconnect UI.

## Files Claude should inspect first

- `auth.ts`
- `lib/auth-flags.ts`
- `components/SignInChooser.tsx`
- `app/api/spotify-gate/route.ts`
- `lib/spotify-gate.ts`
- `lib/spotify-gate-core.ts`
- `lib/music.ts`
- `lib/tester-requests-core.ts`
- `components/admin/TesterRequestsSection.tsx`
- `components/admin/SpotifyAccessSection.tsx`
- `lib/admin/health.ts`
- `docs/product/prds/prd-45-extended-quota-readiness.md`
- `docs/product/spotify-extended-quota-request.md`
- `lib/system-registry.ts`
- `docs/product/system-map.generated.md`
