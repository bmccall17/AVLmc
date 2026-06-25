# PRD 40: Legible Failure States & Functional Integrity

Part of the [Design-System Readability & Integrity Repair initiative](../design-system-readability-prd.md)
(Phase 16). Cycle **C2** (second of three). Satisfies desired outcomes **3 (legible failure/recovery
surfaces)** and **4 (functional integrity)**. Depends on **C1 (PRD 39 — the dark token context)**.

## Goal

**Make the failure and recovery surfaces legible and on-brand, and fix the functional blockers the audit
surfaced as design failures** — the dark error boundary, the auth recovery mobile CTA, the `/icon.png`
collision, silent admin API failures, and the placeholder-only curator form.

## Summary

With C1's dark token context in place, this cycle gives the route error boundary its own dark class, prevents
the auth recovery primary CTA from overflowing a `390px` viewport, resolves the `app/icon.png` vs
`public/icon.png` collision that 500-ed `/icon.png` and broke the logo, makes the admin queue components
surface non-OK responses as a retryable error (instead of rendering empty queues as truth), and adds
accessible labels to the four promote-curator inputs.

## Implementation Status

**Shipped — June 25, 2026.** Delivered:

- **Legible route error boundary.** `app/error.tsx` `<main>` is now `className="shell error-shell"`; with
  C1's `.error-shell` token context, the previously dark-on-dark retry screen reads clearly. (Verify by
  forcing a route error.)
- **Auth recovery mobile CTA.** New `@media (max-width: 460px)` rule in `app/globals.css` stacks
  `.auth-recovery-actions` full-width and sets `white-space: normal` on the primary/ghost actions, so the CTA
  wraps instead of overflowing (`.primary-action` is otherwise `white-space: nowrap`). The recovery card is
  dark via C1's `--surface`/`--border` re-declaration.
- **`/icon.png` collision resolved.** Removed the duplicate `app/icon.png` (byte-identical to
  `public/icon.png`); kept `public/icon.png` as the single canonical asset the UI references via `next/image`;
  added `icons: { icon: "/icon.png" }` to the `metadata` export in `app/layout.tsx` so the favicon still
  resolves. `GET /icon.png` now serves the static asset (no 500), and the admin/login/home logos render.
- **Honest admin failure states.** `CuratorAdminPanel.refresh()` and `SpotifyAccessSection.refresh()` now wrap
  the fetch in `try/catch`, set an explicit `loadError` on non-OK or network failure, and render a retryable
  `.admin-curators-error` banner (new style in `app/globals.css`) with a **Retry** button — replacing the
  silently-empty queues. A clean load clears the error.
- **Labeled curator form.** The four promote-curator inputs in `components/admin/CuratorAdminPanel.tsx` gained
  `aria-label`s (User id / Handle / Display name / Bio (optional)); placeholders remain as examples.
- **Quality.** `typecheck` / `lint` / `test:registry` (7) green; changed admin components Snyk-clean (0
  issues); no new dependency; `$0`.

**Post-ship re-audit follow-up — June 25, 2026.** The Playwright re-audit found the admin failure surface
improved but still imperfect; now fixed:

- **No more contradictory empty states.** When a queue fetch fails, the panels showed the error banner *and*
  still rendered reassuring empty copy ("No pending applications", "No recommendations", "All curators have
  picks", "No curators yet", "No open access requests") plus `(0)` counts in the section headings. Each
  empty-state line **and** each heading count is now gated on `!loadError` in
  `CuratorAdminPanel`/`SpotifyAccessSection`, so a failed load shows only the error + Retry — no "(0)" or
  "none" copy that reads as a true-empty queue. *(The heading-count suppression was a third-audit follow-up.)*
- **Admin error banner contrast → AA.** `.admin-curators-error` text measured `2.54:1` and its retry button
  `1.91:1`; darkened the banner/button backgrounds (`rgba(127,29,29,.4)` / `rgba(248,113,113,.28)`) and
  brightened the text to near-white (`#fee2e2` / `#fef2f2`) to clear AA.
- **Styled the admin buttons.** The promote/approve/reject/hide buttons inherited light default browser
  styling on the dark page; added a dark `.admin-curators-form/-list/-actions button` treatment, with the
  primary **Promote** action carrying the teal accent.

## Goals

- The route error boundary, 404, and auth recovery read clearly in the dark language at desktop + mobile.
- `/icon.png` resolves from one canonical source; the logo renders everywhere it's used.
- Admin API failures are visible + retryable; the curator form is accessible.

## Non-Goals

- The token context itself (C1 / PRD 39).
- Local-DB degradation behavior, the Design Spec rewrite, and the automated readability smoke test (C3 / PRD 41).

## Requirements

### Frontend (`app/error.tsx`, `app/layout.tsx`, components)

- `app/error.tsx`: add `error-shell` to the `<main>` className.
- `app/layout.tsx`: add `icons: { icon: "/icon.png" }` to `metadata`; remove `app/icon.png`.
- `components/admin/CuratorAdminPanel.tsx` + `components/admin/SpotifyAccessSection.tsx`: `try/catch` +
  `loadError` state + retryable `.admin-curators-error` banner; `aria-label` on the four promote inputs.

### Styles (`app/globals.css`)

- `@media (max-width: 460px)` rule stacking `.auth-recovery-actions` and wrapping the action labels.
- `.admin-curators-error` banner + its retry button.

### Architecture & quality

- No System Registry change (`app/icon.png` is not a registry node). `test:registry` stays green.
- Snyk scan on the changed admin components; `typecheck` / `lint` green; `$0`.

## Dependencies

- C1 (PRD 39) for the `.error-shell` token context and the dark `.auth-recovery` card.
- `public/icon.png` as the canonical asset; the `next/image` `src="/icon.png"` references in
  `app/page.tsx`, `app/admin/page.tsx`, `app/sandbox/discovery-actions/page.tsx`, `components/AdminPortal.tsx`.

## Risks

- **Favicon regression** if `metadata.icons` is omitted after deleting `app/icon.png`. Mitigated by adding the
  explicit `icons` entry pointing at the public asset.

## Acceptance Criteria

1. A forced route error renders a legible dark retry screen (no dark-on-dark).
2. The auth recovery primary CTA stays within a `390px` viewport (wraps, doesn't overflow).
3. `GET /icon.png` returns 200 and the logo renders on home/admin/login; the favicon resolves.
4. When `/api/admin/curators` or `/api/admin/spotify-access` returns non-OK, the panel shows an error + Retry,
   not an empty queue.
5. The four promote-curator inputs expose accessible names.
6. `typecheck` / `lint` / `test:registry` green; changed code Snyk-clean; `$0`.

## Test Scenarios

- Force a route error (throw in a server component) and confirm the boundary is legible at `390` + `1440`.
- Load `/auth/error?error=OAuthAccountNotLinked` at `390` and confirm the CTA wraps within the viewport.
- `curl -i /icon.png` → `200`; load `/admin` and confirm the logo renders.
- Stub the admin APIs to 500 and confirm both panels show the retryable error banner; restore and confirm the
  banner clears on a successful refresh.
- Inspect the promote form with an a11y tool and confirm each input has an accessible name.
