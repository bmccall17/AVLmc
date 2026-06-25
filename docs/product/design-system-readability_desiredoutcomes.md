## Design-System Readability & Integrity Repair — Desired Outcomes

Updated: June 26, 2026

### Purpose & Posture

**Goal.** Make every AVLmc surface render in one coherent, AA-legible dark design language, and close the
functional blockers that the [June 25 design + functional audit](design-functional-audit-2026-06-25.md)
surfaced as "design" failures. The audit found a **split design system**: light-era global tokens
(`--ink: #11201c`, `--muted: #5b6b66`, `--panel: #fff`) still drive the generic `.shell`, while the global
first viewport now paints dark — so newer pages render near-black text on a dark background, and the route
error boundary, 404, curator apply/recommend/manage, auth recovery, and focused admin subpages became hard or
impossible to read.

This is a **brownfield repair + codification** initiative, not a redesign. The dark aesthetic in
[`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md) is correct; the implementation drifted
from it and the spec itself no longer matches the code (it describes Tailwind classes + framer-motion the
project never adopted — the app is plain CSS custom properties in `app/globals.css`).

**Current state (brownfield).** Plain Next.js App Router + a single large `app/globals.css` driven by CSS
custom properties (no Tailwind, no framer-motion). Three isolated dark shells already work (`.sandbox-shell`,
`.admin-shell`, the curator directory cards), but the generic `.shell` carries no color context, so any page
that uses it on top of the dark gradient inherits light-on-dark text.

**Posture (locked).**
- **Dark mode exclusively**, per the design spec. No light-theme route is in scope.
- **Token-first repair.** Re-establish the dark context by re-declaring the existing tokens on the route
  wrapper, not by hard-coding colors on every element — so descendants flip automatically and future pages
  opt in by adding a class.
- **`$0` & security-at-inception.** No new dependency, no new paid service; all new first-party code passes
  Snyk before "done."
- **No behavior change beyond the audit findings.** Readability + integrity only; no product/data changes.

---

### 1. Every non-home surface is legible in the dark language

Done looks like: every page outside the home/sandbox/admin-portal surfaces (curator apply/recommend/manage,
admin curators, admin spotify-access, auth recovery, 404, route error) renders headings, body copy, back
links, empty states, form helper text, and notices at AA contrast against the dark background at both desktop
(`1440`) and mobile (`390`) widths. No surface drifts from dark into the light gradient mid-page.

### 2. The token strategy is consolidated so future pages can't regress

Done looks like: a single, documented dark route-shell token context exists; a new route opts into the dark
language by adding one class, and never inherits light-on-dark text by accident. The multiple style eras in
`globals.css` (light tokens, the concept gradient, per-route dark shells, one-off sections) are reconciled
around one canonical dark token set.

### 3. Failure & recovery surfaces are legible and on-brand

Done looks like: the route error boundary (`app/error.tsx`), the 404 detour, and the auth recovery page read
clearly in the dark language — the error boundary no longer renders dark-on-dark, the auth recovery card is no
longer a white box outside the monochrome spec, and the auth recovery primary CTA no longer overflows a
`390px` viewport.

### 4. Functional integrity behind the "design" failures is restored

Done looks like: `/icon.png` resolves (no 500, no broken logo) from one canonical source; admin API failures
surface as an explicit, retryable error instead of silently-empty queues; the promote-curator form inputs
carry accessible labels (not placeholder-only); and the local missing-`DATABASE_URL` behavior is a deliberate,
documented decision rather than an unreadable route error.

### 5. The gains are codified and guarded

Done looks like: `AVLmc-Design-Spec.md` documents the **real** implementation (CSS custom properties + the
canonical dark token set + the dark route-shell contract), so it is usable ground truth for humans and agents;
and an automated readability/visual smoke check guards the route table so a future page can't silently
reintroduce light-on-dark text.
