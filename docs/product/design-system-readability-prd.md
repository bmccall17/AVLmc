# Design-System Readability & Integrity Repair — Master PRD (Epic)

Updated: June 26, 2026

**Status: In progress (June 26, 2026).** C1 + C2 shipped — the dark route-shell repair, token
consolidation, legible failure states, the `/icon.png` fix, honest admin failure states, and the curator
form labels are live. C3 is partially shipped: the Design Spec is rewritten to match the implementation; the
local-DB degradation decision and the automated readability smoke test remain open. This is **Phase 16** in
[`master-roadmap.md`](master-roadmap.md), a direct follow-up to the
[June 25 design + functional audit](design-functional-audit-2026-06-25.md).

## One-Sentence Goal

Make every AVLmc surface render in one coherent, AA-legible dark design language, close the functional
blockers the audit surfaced as design failures, and codify the result so the system can't silently regress.

## How To Use This Document

This is the umbrella tracker for the Design-System Readability & Integrity Repair initiative (**Phase 16**).
It synthesizes the desired outcomes in
[`design-system-readability_desiredoutcomes.md`](design-system-readability_desiredoutcomes.md) into a small
sequence of focused PRDs in [`prds/`](prds/) (PRDs **39–41**). Treat it the way
[`curator-onboarding-prd.md`](curator-onboarding-prd.md) serves Phase 13: the epic owns the shared token
strategy and cross-cutting rules; each cycle PRD owns one independently shippable increment.

This initiative does not redesign anything. The dark aesthetic in
[`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md) is correct; the **implementation** drifted
from it (light tokens leaking into dark routes) and the **spec** drifted from the implementation (it describes
Tailwind + framer-motion the project never adopted). C1–C2 repair the implementation; C3 reconciles the spec
and guards the result.

## Current State (Brownfield Baseline)

- **One large CSS file, custom-property driven.** `app/globals.css` defines light global tokens at `:root`
  (`--bg`, `--ink`, `--muted`, `--line`, `--panel`, `--teal`, `--gold`) and applies `color: var(--ink)` to
  `html`. The later "Concept direction refresh" repaints `html` with a dark→light gradient (dark for the first
  `26rem`) **without** updating the foreground tokens. No Tailwind, no framer-motion (the design spec's class
  names are aspirational).
- **Three dark shells already work.** `.sandbox-shell` (home + discovery sandbox) and `.admin-shell` (admin
  login + portal) set their own full-bleed `#0a0a0a` background + light foreground; the curator directory
  cards (`.curators-directory-card`) carry dark surfaces. These are the precedent the repair generalizes.
- **The generic `.shell` carries no color context.** It only sets `max-width`/`padding`, so any page that uses
  it inherits `--ink` (near-black) on the dark gradient. The route shells the audit named
  (`.curators-directory-shell`, `.admin-curators-shell`, `.auth-recovery-shell`, `.not-found-shell`) were
  declared on the `<main>` but had no token context of their own; `app/error.tsx` used bare `.shell`.
- **Admin fetches fail silently.** `CuratorAdminPanel.refresh()` / `SpotifyAccessSection.refresh()` only acted
  on `response.ok`, so a 500 rendered as empty queues.
- **Icon collision.** `app/icon.png` (a Next.js metadata route) and `public/icon.png` both claimed `/icon.png`
  (which the UI references via `next/image`), 500-ing the request and breaking the logo.
- **Drift discipline exists.** `lib/system-registry.ts` + `npm run test:registry` + `generate:system-map` keep
  the architecture map honest; `tests/` holds per-feature `node --test` suites and Playwright e2e (`test:e2e`).

**Reusable spine every cycle plugs into:** the existing CSS custom-property tokens (re-declared, not replaced);
the `.sandbox-shell` / `.admin-shell` full-bleed dark pattern; the admin-review fetch/panel pattern
(`app/api/admin/*`, `components/admin/*Section.tsx`); the `lib/events.ts` seed-fallback precedent; and the
System Registry / Playwright e2e discipline.

## Posture (Locked — inherited by every cycle)

- **Dark mode exclusively** (per the design spec). No light-theme route is in scope.
- **Token-first repair.** Re-establish dark context by re-declaring the existing tokens on the route wrapper
  so descendants flip automatically — never by hard-coding colors element-by-element.
- **Opt-in by class.** A future route joins the dark language by adding a shell class; bare `.shell` must not
  be relied on for color.
- **No behavior change beyond the audit findings.** Readability + integrity only.
- **`$0` & security-at-inception.** No new dependency or paid service; all new first-party code passes Snyk
  before "done."

## Definition Of Done (Outcomes 1–5, Synthesized)

1. Every non-home surface is legible in the dark language at desktop + mobile (no dark-on-dark, no mid-page
   drift into the light gradient).
2. The token strategy is consolidated around one canonical dark route-shell context; future pages opt in by
   class and can't inherit light-on-dark by accident.
3. The route error boundary, 404 detour, and auth recovery page are legible and on-brand, with no mobile CTA
   overflow.
4. Functional integrity is restored: `/icon.png` resolves; admin API failures surface with retry; the
   promote-curator form is labeled; missing-local-`DATABASE_URL` is a deliberate, documented behavior.
5. The Design Spec documents the real implementation + dark route-shell contract, and an automated
   readability/visual smoke test guards the route table.

## Outcome → PRD Map

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 39 — Dark Route-Shell Readability & Token Consolidation](prds/prd-39-dark-route-shell-readability.md) | 1, 2 | The token fix: one canonical dark route-shell context + full-bleed dark backdrop, applied to every audited shell. |
| C2 | [PRD 40 — Legible Failure States & Functional Integrity](prds/prd-40-legible-failure-states-and-integrity.md) | 3, 4 | Error boundary / 404 / auth recovery legibility + mobile CTA, `/icon.png`, honest admin failure states, labeled form. |
| C3 | [PRD 41 — Design-System Codification & Visual Guardrails](prds/prd-41-design-system-codification.md) | 5 | Rewrite the Design Spec to match the code + document the dark token contract; add a readability smoke test; decide local-DB degradation. |

## Delivery Sequence & Dependencies

```
C1 (PRD 39) ── the token context everything else renders inside
   │
   ├─► C2 (PRD 40) ── failure/recovery surfaces + integrity fixes render inside C1's dark context
   │
   └─► C3 (PRD 41) ── codify C1's token contract in the spec; guard C1+C2 with a visual smoke test
```

C1 is the foundation (the dark token context). C2 depends on C1 for the error/404/auth surfaces to read
correctly. C3 documents and guards C1+C2; its readability smoke test is most valuable once the local-DB
degradation decision lets the audited routes render without a DB.

## Shared Architecture & Cross-Cutting Design

**The canonical dark route-shell context.** A single grouped rule in `app/globals.css` re-declares the tokens
as dark **on the wrapper element** for every dark route shell:

```css
.curators-directory-shell,
.admin-curators-shell,
.auth-recovery-shell,
.not-found-shell,
.error-shell {
  --ink: #fafafa;
  --muted: #a1a1aa;
  --line: rgba(63, 63, 70, 0.7);
  --panel: rgba(24, 24, 27, 0.9);
  --border: rgba(63, 63, 70, 0.7);
  --surface: rgba(24, 24, 27, 0.9);
  color: var(--ink);
  min-height: 100vh;
  position: relative;
}
/* + a fixed, inset:0, z-index:-1 ::before painting #0a0a0a behind the page */
```

Because the tokens are re-declared on the wrapper, **every descendant** that reads `var(--ink/--muted/--panel/
--line/--border/--surface)` flips to dark with zero per-element edits — including the existing
`var(--surface, #fff)` / `var(--border, #e5e7eb)` fallbacks on `.auth-recovery` and the
`var(--muted, #a1a1aa)` fallbacks on `.not-found-*`. The fixed full-bleed `::before` covers the dark→light
gradient so the surface stays uniformly dark. This is the contract C3 codifies in the design spec.

**Honest failure states.** Admin queue components catch non-OK responses + network errors and render a
retryable `.admin-curators-error` banner instead of empty lists — the audit's "silent failure looks like
truth" finding. Same pattern is the model for the local-DB degradation decision in C3.

**`$0` / no new deps.** Everything is CSS + small TSX changes against the existing stack; no Tailwind, no
framer-motion, no new packages.

## Dependencies

- The audit itself: [`design-functional-audit-2026-06-25.md`](design-functional-audit-2026-06-25.md).
- The design language of record: [`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md).
- The parked **"Design-spec alignment pass for the new Phase 15 / account surfaces"** backlog item folds into
  C2/C3 (the auth recovery surface is repaired by C1's token context; remaining ad-hoc styling is C3's spec
  pass).

## Risks

- **Over-broad token flip.** Re-declaring `--panel`/`--surface` on a shell could darken a child that assumed a
  white surface. Mitigated by scoping the re-declaration to named route-shell classes (not `:root`/`.shell`)
  and verifying each audited route at both widths.
- **Re-audit needs a DB/auth test state.** Several audited routes 500 locally without `DATABASE_URL`; the
  full re-audit (and the C3 smoke test) is most reliable after the local-DB degradation decision lands.
