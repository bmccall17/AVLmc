# PRD 39: Dark Route-Shell Readability & Token Consolidation

Part of the [Design-System Readability & Integrity Repair initiative](../design-system-readability-prd.md)
(Phase 16). Cycle **C1** (first of three). Satisfies desired outcomes **1 (legible non-home surfaces)** and
**2 (consolidated token strategy)**. Foundation for C2 (PRD 40) and C3 (PRD 41).

## Goal

**Re-establish one canonical dark token context for every non-home route shell**, so headings, body copy,
back links, empty states, helper text, and notices all render at AA contrast on the dark background — and so
future pages opt into the dark language by adding a class instead of accidentally inheriting light-on-dark.

## Summary

`app/globals.css` defines light-era tokens at `:root` (`--ink: #11201c`, `--muted: #5b6b66`,
`--panel: #fff`) and applies `color: var(--ink)` to `html`, but the "Concept direction refresh" repaints
`html` with a dark→light gradient without updating those tokens. Pages rendering inside the generic `.shell`
(curator apply/recommend/manage, admin curators, admin spotify-access, auth recovery, 404, route error) inherit
near-black text on the dark gradient. This cycle adds a single grouped rule that re-declares the tokens as dark
**on the route-shell wrapper itself** plus a fixed full-bleed dark backdrop, so every descendant reading
`var(--ink/--muted/--panel/--line/--border/--surface)` flips to dark with no per-element edits.

## Implementation Status

**Shipped — June 25, 2026.** Delivered:

- **Canonical dark route-shell context** (`app/globals.css`, immediately after `.shell`): one grouped rule for
  `.curators-directory-shell, .admin-curators-shell, .auth-recovery-shell, .not-found-shell, .error-shell`
  re-declares `--ink: #fafafa`, `--muted: #a1a1aa`, `--line`/`--border`/`--panel`/`--surface` to dark zinc
  values, sets `color: var(--ink)` + `min-height: 100vh` + `position: relative`, and paints a fixed
  `inset: 0; z-index: -1` `::before` of `#0a0a0a` so the page never drifts into the light gradient.
- **Automatic descendant flip.** Because tokens are re-declared on the wrapper, the existing
  `var(--surface, #fff)` / `var(--border, #e5e7eb)` fallbacks on `.auth-recovery` and the
  `var(--muted, #a1a1aa)` fallbacks on `.not-found-*` now resolve to the dark values — no edits to those rules.
  The `.back-link` border (`var(--line)`), `.empty-copy` / `.form-help` (`var(--muted)`), and inherited
  `h1/h2/p` (`var(--ink)`) all darken-correctly inside these shells.
- **No JSX change for the curator/admin/auth/404 surfaces** — those `<main>` elements already carried the
  shell classes; the CSS now gives them a color context. (The error boundary gains its class in C2/PRD 40.)
- **Quality.** `typecheck` / `lint` / `test:registry` (7) green; no new dependency; `$0`.

**Post-ship re-audit follow-up — June 25, 2026.** A Playwright re-audit after the first fix found three
residual readability gaps, now fixed:

- **Full-document dark background.** The fixed `::before` backdrop only covers the viewport, so tall pages
  (404 detour, mobile admin curators) leaked the global gradient's light band below `26rem` (and in full-page
  screenshots). Added `html:has(.curators-directory-shell, …, .error-shell) { background: #0a0a0a }` so the
  whole document is dark whenever a dark route shell is present, regardless of page height.
- **`.ghost-control` CTAs.** The pale `#edf5f2` `.ghost-control` background rendered white-on-pale (~1:1) under
  the dark shells (404 "tune it"/"skip"/"recommend curators" links, feedback Skip). Re-skinned `.ghost-control`
  within the dark shells as a dark panel button (`rgba(24,24,27,.9)` + `var(--line)` + `var(--ink)`).
- **Eyebrow contrast.** The teal `.eyebrow`/`.card-kicker` accent (`#087f8c`) missed AA on dark (404 `4.17:1`,
  auth `3.73:1`); switched to teal-400 `#2dd4bf` inside dark shells. Also brightened the admin-login back link
  (`.admin-login-back` `#71717a` → `#a1a1aa`, `3.67:1` → AA).

## Goals

- Every audited non-home surface renders AA-legible at desktop (`1440`) and mobile (`390`).
- One documented dark token context; adding a shell class is the only step to opt a route into dark.
- Zero behavior/data change; CSS-only.

## Non-Goals

- The route error boundary class wiring, the auth mobile CTA overflow, `/icon.png`, admin failure states, and
  the form labels (all C2 / PRD 40).
- Rewriting the design spec or adding the visual smoke test (C3 / PRD 41).
- Any light-theme route (dark mode is exclusive).

## Requirements

### Frontend / Styles (`app/globals.css`)

- A grouped selector re-declaring `--ink`/`--muted`/`--line`/`--panel`/`--border`/`--surface` as dark on the
  five route-shell classes, with a fixed full-bleed `#0a0a0a` `::before` backdrop.
- Re-declaration scoped to the named route-shell classes only — never `:root` or `.shell` — to avoid darkening
  surfaces that assume light.

### Architecture & quality

- No System Registry node change (CSS only; no new file-backed node). `test:registry` stays green.
- `typecheck` / `lint` green; new CSS reviewed against the audited route list.

## Dependencies

- The light tokens + `html` gradient in `app/globals.css`; the `.shell` wrapper; the route-shell class names
  already present on the audited `<main>` elements.

## Risks

- **Darkening a child that assumed white** (`--panel`/`--surface`). Mitigated by scoping to named shells and
  verifying each route.

## Acceptance Criteria

1. Curator apply/recommend/manage, admin curators, admin spotify-access, auth recovery, and 404 render
   legible body/heading/back-link/empty-state/helper text on a uniform dark background at `1440` + `390`.
2. No audited surface shows a dark→light gradient split mid-page.
3. Adding a route-shell class is sufficient to put a new page in the dark language.
4. `typecheck` / `lint` / `test:registry` green; `$0`; no new deps.

## Test Scenarios

- Render each audited route at `1440x1000` and `390x844` (DB/auth test state) and confirm AA contrast on
  headings, paragraphs, back links, empty states, and notices.
- Confirm the auth recovery card is dark (not white) and the 404 cards no longer drift to gray/white.
- Confirm the home/sandbox and admin-portal surfaces are visually unchanged (not in the re-declared set).
