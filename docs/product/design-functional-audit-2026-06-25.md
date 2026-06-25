# Design and Functional Audit — June 25, 2026

## Scope

Audit requested after screenshots showed newer pages becoming hard to read. I rendered the app locally with Playwright at desktop `1440x1000` and mobile `390x844`, inspected all `app/**/page.tsx` routes I could reach, and checked the global `app/error.tsx` and `app/not-found.tsx` states because several routes fell into those surfaces during the run.

Generated evidence lives in `output/playwright/design-audit-2026-06-25/`:

- `render-audit.json` — rendered URL/status diagnostics, low-contrast/form/overflow checks, and screenshot paths.
- `*.png` — full-page desktop/mobile screenshots for the rendered states.

## Re-Audit Update — June 25, 2026, after `5b45dcf design fixes`

I re-ran the audit after the design-fix commit using local Playwright desktop `1440x1000`,
mobile `390x844`, and a native production fetch of `https://avlmc.vercel.app/admin/curators`.
New evidence lives in `output/playwright/design-reaudit-2026-06-25/`:

- `summary.json` — rendered URL diagnostics, low-contrast/form/overflow checks, failing responses,
  and screenshot paths.
- `*.png` — full-page desktop/mobile screenshots for the re-audited surfaces.

Chrome status: the Chrome-control bridge failed before it could attach to the signed-in tab, so the
production signed-in admin state was not visually inspected through Chrome in this pass. Native
production access without that cookie redirects `/admin/curators` to `/admin`, as expected.

### What Looks Fixed

- `/curators/apply`, `/curators/recommend`, and `/curators/manage` now render in a readable dark
  shell at desktop and mobile widths. The original near-black-on-dark page headings and back links
  are gone.
- `app/error.tsx` now renders a legible dark error boundary when DB-backed local pages fail because
  `DATABASE_URL` is missing.
- `/auth/error?error=OAuthAccountNotLinked` no longer has the mobile CTA overflow found in the first
  audit.
- `/icon.png` now returns `200 image/png` locally and on production.
- `CuratorAdminPanel` and `SpotifyAccessSection` now show explicit retryable API error banners when
  their admin queue fetches fail.
- The curator promotion inputs now have accessible labels via `aria-label`.

### Still Failing Or Incomplete

1. **P0 — Long dark-shell pages still fall back to the light global background.**
   The shared shell fix paints a fixed `::before` backdrop, but the global `html` background still
   switches to light after `26rem`. Long pages such as the 404 detour and mobile admin curator page
   visibly hit white/light background bands below the first dark viewport. Source trail:
   `app/globals.css` dark shell backdrop around lines 67-76, and the global gradient around lines
   434-437. Screenshots:
   `output/playwright/design-reaudit-2026-06-25/mobile-not-found-local.png` and
   `output/playwright/design-reaudit-2026-06-25/mobile-admin-curators-local.png`.

2. **P0 — 404 CTAs remain unreadable.**
   `Open my board & tune it ->`, `Skip & go home`, and
   `Know someone with great taste? Explore & recommend curators ->` measured about `1.06:1`
   contrast because `.ghost-control` uses a pale `#edf5f2` background while the dark shell sets
   `--ink` to white. Source trail: `app/not-found.tsx` CTA links, `components/FeedbackForm.tsx`,
   and `.ghost-control` in `app/globals.css` around lines 1021-1025. This is still an
   "impossibly hard to read" failure.

3. **P1 — Admin queue failures are explicit, but still contradicted by empty states.**
   When `/api/admin/curators` or `/api/admin/spotify-access` returns 500, the UI now shows an error
   banner, but it also renders counts of `0` and copy such as "No pending applications",
   "No recommendations", "All curators have picks", "No curators yet", and
   "No open access requests." Those empty states read as truth even though the data did not load.
   Source trail: `components/admin/CuratorAdminPanel.tsx` empty states around lines 188, 222, 238,
   and 255; `components/admin/SpotifyAccessSection.tsx` empty state around line 109.

4. **P1 — Admin error banner contrast is below target.**
   The admin queue error text and retry button measured below AA in the re-audit (`2.54:1` for the
   error text and `1.91:1` for the retry button in the DOM contrast pass). The message is visible in
   screenshots, but the palette should be corrected instead of relying on large/bold text. Source:
   `.admin-curators-error` around `app/globals.css` lines 6927-6952.

5. **P1 — Admin promote button still inherits browser/default styling.**
   On mobile `/admin/curators`, the "Promote" button renders as a light default button inside the
   dark admin page, while adjacent inputs are dark. This is not a readability blocker, but it is a
   clear design-system miss in the updated surface.

6. **P1 — 404/auth/admin eyebrow and back-link colors are near/below AA.**
   The 404 eyebrow measured `4.17:1` against dark, auth recovery eyebrow measured `3.73:1`, and the
   production unauthenticated admin back link measured `3.67:1`. These are secondary labels, but
   they are still below the normal-text AA threshold.

7. **P1 — The local dev environment still cannot render DB-backed pages.**
   `.env` and `.env.local` are missing `DATABASE_URL`, so `/`, `/curators`, `/curator/[handle]`,
   and logged-in `/admin` still render the error boundary locally. The boundary is now readable, but
   the actual homepage, curator directory, curator profiles, and full admin overview remain
   unaudited locally until a DB-backed environment is available.

8. **P2 — Documentation was future-dated.**
   Several docs updated by the fix say `June 26, 2026` or `Jun 26, 2026`, but this re-audit was run
   on June 25, 2026. Affected files include `docs/product/design-system-readability-prd.md`,
   `docs/product/backlog.md`, `docs/product/master-roadmap.md`, `docs/product/prds/prd-39-dark-route-shell-readability.md`,
   and `docs/product/prds/prd-40-legible-failure-states-and-integrity.md`.

### Re-Audit Page Coverage

| Route / surface | Re-audit result | Status |
| --- | --- | --- |
| `/` local | 500 due missing `DATABASE_URL`; readable `app/error.tsx` | Error boundary fixed; homepage still unaudited locally |
| `/curators` local | 500 due missing `DATABASE_URL`; readable `app/error.tsx` | Error boundary fixed; directory still unaudited locally |
| `/curators/apply` | Rendered desktop/mobile | Readability fixed |
| `/curators/recommend` | Rendered desktop/mobile | Readability fixed |
| `/curators/manage` | Rendered desktop/mobile signed out | Readability fixed |
| `/auth/error?error=OAuthAccountNotLinked` | Rendered desktop/mobile | CTA overflow fixed; eyebrow contrast still low |
| `/not-a-real-page` 404 | Rendered desktop/mobile | Still failing: unreadable ghost CTAs and lower light background |
| `/curator/not-a-real-curator` local | 500 due missing `DATABASE_URL`; readable `app/error.tsx` | Error boundary fixed; profile still unaudited locally |
| `/admin` local after fallback login | 500 due missing `DATABASE_URL`; readable `app/error.tsx` | Error boundary fixed; admin overview still unaudited locally |
| `/admin/curators` local after fallback login | Rendered desktop/mobile with API 500 | Improved, but failure state still contradictory and bottom background leaks light |
| `/admin/spotify-access` local after fallback login | Rendered desktop/mobile with API 500 | Improved, but failure state still contradictory |
| `/admin/curators` production native unauthenticated | Redirected to `/admin` | Expected without signed-in cookie; signed-in production Chrome inspection blocked |

### Verification Commands

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run test:curators` — passed.
- `npm run test:spotify-access` — passed.
- `npm run test:auth-failures` — passed.
- `npm run test:registry` — passed.

## Executive Summary

The readability failure is real and systemic on newer surfaces. The main cause is a split design system: global tokens and the generic `.shell` still assume a light page (`--ink: #11201c`, `--muted: #5b6b66`, `--panel: #ffffff`), while the global `html` background now paints a dark first viewport. Routes that use the generic `.shell` without establishing their own dark color context render near-black headings, body copy, and links on a dark teal/black background.

The worst affected surfaces are:

- `app/error.tsx` route error boundary.
- `app/not-found.tsx` 404 detour.
- `app/curators/apply/page.tsx`, `app/curators/recommend/page.tsx`, `app/curators/manage/page.tsx`.
- `app/admin/curators/page.tsx` and `app/admin/spotify-access/page.tsx`.

The functional audit also found local blocking failures:

- `DATABASE_URL` is missing from `.env` and `.env.local`, so DB-backed routes render 500s locally.
- `GET /icon.png` returns 500 because both `app/icon.png` and `public/icon.png` exist, while UI code uses `/icon.png` as an image source.
- Focused admin subpages silently show empty queues when their API fetches fail.

## Root Causes

1. **Light tokens leak into dark routes.** `app/globals.css` defines light global tokens at the top (`--ink`, `--muted`, `--panel`) and applies `color: var(--ink)` to `html`. Later, the "Concept direction refresh" changes `html` to a dark-to-light gradient for the first `26rem`, but does not update the foreground tokens for generic `.shell` pages.

2. **Fallback token values do not apply when a light token exists.** Several newer styles use `var(--muted, #a1a1aa)` expecting the dark fallback, but `--muted` is already defined as the light value `#5b6b66`, so text stays too dark on dark panels.

3. **New route shells are only partially dark-mode aware.** Components such as curator cards and form fields use dark colors, but page-level containers, headings, intro copy, back links, empty states, and admin subpage sections inherit the old light foreground.

4. **Error/empty states were not visually verified against the dark background.** `app/error.tsx` uses generic `.shell` and inline layout only, so route-level failures become a dark-on-dark page. The 404 page has some dark-panel styling, but inherited light tokens and the global gradient create a jarring dark-to-light split.

5. **Functional failures are rendered as design failures.** Because the local DB is not configured, `/`, `/curators`, `/sandbox/discovery-actions`, and authenticated `/admin` all render the unreadable route error boundary. That makes an environment problem look like a broken UI.

## Page Coverage

| Route / surface | Result | Findings |
| --- | --- | --- |
| `/` (`app/page.tsx`) | Blocked by 500 | `DATABASE_URL is not set`; screenshot shows unreadable `app/error.tsx` dark-on-dark copy. |
| `/event/[id]` | Not reached | No event link could be discovered because `/` failed before the board rendered. Likely shares the DB failure path. |
| `/curators` | Blocked by 500 | `listCurators()` throws when `DATABASE_URL` is absent; screenshot shows unreadable `app/error.tsx`. |
| `/curators/apply` | Rendered | Header, intro copy, and `Back to curators` are near-black on the dark background. The sign-in notice is readable but visually disconnected. |
| `/curators/recommend` | Rendered | Same dark-on-dark shell issue as apply. |
| `/curators/manage` | Rendered | Same shell issue; signed-out panel text "Sign in to manage your curator profile" measured around `1.26:1`, far below AA. |
| `/curator/[handle]` | Not reached | No curator handle could be discovered because `/curators` failed. Re-audit once DB-backed directory renders. |
| `/saved` | Redirected to `/` | Auth is disabled locally, then `/` hits the DB failure. Signed-in saved state was not audited. |
| `/auth/error?error=OAuthAccountNotLinked` | Rendered | Readable, but uses a white recovery card outside the dark monochrome spec; mobile primary CTA overflows the viewport (`right: 409` on a `390px` viewport). |
| `/sandbox/discovery-actions` | Blocked by 500 | `DATABASE_URL is not set`; screenshot shows unreadable `app/error.tsx`. |
| `/admin` logged out | Rendered | Mostly readable, but logo is broken by `/icon.png` conflict and the back link is below AA (`3.86:1`). |
| `/admin` logged in | Blocked by 500 | `listContributions()` throws when `DATABASE_URL` is absent; screenshot shows unreadable `app/error.tsx`. |
| `/admin/curators` | Rendered | Dark-on-dark page header/copy/back link; bottom crosses into light gradient mid-page; four inputs rely on placeholders only; API 500 is silently rendered as empty queues. |
| `/admin/spotify-access` | Rendered | Dark-on-dark page header/copy/back link; API 500 is silently rendered as "No open access requests." |
| 404 (`app/not-found.tsx`) | Rendered | Header and lede are hard to read on dark background; cards drift from dark to gray/white as the global background changes; input area looks disabled/washed out. |

## Design Gaps To Backlog

### P0 — Repair Dark Shell Readability

Create a shared dark route shell treatment for all non-home pages that should live in the dark AVLmc design language:

- `.curators-directory-shell`
- `.admin-curators-shell`
- `.auth-recovery-shell`
- `.not-found-shell`
- `app/error.tsx`

The fix should set a page-level dark background, foreground, muted, panel, border, and link context instead of relying on light `:root` variables. Verify headings, paragraphs, back links, empty states, form helper text, and notices at desktop and mobile widths.

### P0 — Make Error States Legible

The route error boundary is currently the most visible failure state and it is nearly unreadable. Give `app/error.tsx` a dedicated dark error class and avoid generic `.shell` inheritance. This should be verified by forcing a route error locally.

### P0 — Decide Local DB Failure Behavior

Right now a missing `DATABASE_URL` breaks the homepage, curator directory, sandbox, and admin portal. Either:

- require `DATABASE_URL` before `npm run dev` with a clear setup message, or
- make local/dev reads degrade to seed/empty data where the product already claims resilience.

This is especially important because `lib/events.ts` has feed-level seed fallback, but the DB read happens first and fails before that fallback can run.

### P1 — Resolve `/icon.png` Conflict

`GET /icon.png` returns 500 because both `app/icon.png` and `public/icon.png` exist. Admin login and any `Image src="/icon.png"` usage show a broken image. Pick one canonical icon source and update UI references accordingly.

### P1 — Surface Admin API Failures

`CuratorAdminPanel.refresh()` and `SpotifyAccessSection.refresh()` ignore non-OK responses. When `/api/admin/curators` or `/api/admin/spotify-access` returns 500, the UI shows empty queues, which looks like truth. Add explicit error state and retry affordance.

### P1 — Fix Admin Curator Form Labels

The promote-curator form has four inputs with placeholders but no labels. Add visible or screen-reader labels and keep placeholders as examples only.

### P1 — Fix Auth Recovery Mobile CTA Overflow

The primary action on the account-conflict auth page overflows a `390px` viewport. Make action buttons width-constrained and allow text wrapping or use shorter mobile copy.

### P2 — Consolidate Token Strategy

The repo now has multiple style eras in one `globals.css`: early light tokens, the concept gradient, dark sandbox/admin shells, and newer one-off page sections. Add explicit route-level themes or dark token aliases so future pages cannot accidentally inherit light text on dark backgrounds.

### P2 — Add Automated Visual Checks

Add a small Playwright visual/readability smoke test once the DB/auth test environment is settled:

- Visit every public and admin route in the route table.
- Capture desktop/mobile screenshots.
- Assert no horizontal overflow.
- Assert error/404/auth pages are readable.
- Add a DOM contrast pass that is aware of dark route shells and not just CSS background-color.

## Functional Gaps To Re-Audit After Environment Setup

These could not be fully audited in this run:

- Homepage event cards, hover action bar, Local Pulse, filters, and listener profile modal.
- Event detail pages and community contribution surfaces.
- Public curator directory with real curator cards.
- Public curator profile pages.
- Saved signed-in state.
- Main admin portal tabs: Health, Architecture, Knowledge Graph, Recommendation Insight, Listener Trace, Stewardship, Analytics, Gaps, Resources, Moderation.

Re-run the audit with a valid `DATABASE_URL` and auth/test user state before closing the design pass.
