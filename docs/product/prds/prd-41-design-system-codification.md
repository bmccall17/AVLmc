# PRD 41: Design-System Codification & Visual Guardrails

Part of the [Design-System Readability & Integrity Repair initiative](../design-system-readability-prd.md)
(Phase 16). Cycle **C3** (third of three). Satisfies desired outcome **5 (codify + guard the gains)**. Depends
on **C1 (PRD 39)** and **C2 (PRD 40)**.

## Goal

**Make the design system self-documenting and regression-proof**: rewrite `AVLmc-Design-Spec.md` to match the
real CSS custom-property implementation (including the dark route-shell token contract from C1), decide the
local missing-`DATABASE_URL` behavior, and add an automated readability/visual smoke test over the route table.

## Summary

The audit found the design system is split not only in code but in documentation: `AVLmc-Design-Spec.md`
describes Tailwind utility classes (`bg-zinc-900`, `backdrop-blur-xl`, `font-black`) and framer-motion
(`motion/react`) that the project never adopted — the app is plain CSS custom properties in `app/globals.css`.
That makes the spec unreliable ground truth for humans and agents. This cycle rewrites the spec to describe the
real implementation and the canonical dark token contract, decides the local-DB failure behavior (so the
audited routes can render without a live DB), and adds a Playwright readability smoke test so a future page
can't silently reintroduce light-on-dark text.

## Implementation Status

**Shipped — July 7, 2026.** All three C3 pieces are now in: the Design Spec rewrite (June 25), plus
the two remaining engineering items below.

**Delivered (July 7, 2026) — the two open items:**

- **Missing-local-`DATABASE_URL` → graceful degrade (audit P0, acceptance #2).** Decision: *degrade*
  (not *require*). `lib/db.ts` gains `isDatabaseConfigured()` (true whenever `DATABASE_URL` is set —
  even to a wrong value — false only when entirely absent) and a **central short-circuit in `query()`**:
  with no `DATABASE_URL`, reads resolve to an empty result set instead of throwing
  `"DATABASE_URL is not set"` into the route error boundary. Callers already treat an empty result as
  "no data yet" (empty states; `lib/events.ts` falls through to its seed/live-feed fallback), so every
  audited route renders readably with no database. The degrade is **scoped strictly to not-configured**
  — a *set-but-unreachable* URL still throws a real connection error, so production Health probes keep
  surfacing outages, and prod (where `DATABASE_URL` is always set) is byte-for-byte unchanged. A one-time
  `console.warn` explains the mode and that writes cannot persist without a DB.
- **Playwright readability smoke test (audit P2, acceptance #3).** `playwright.smoke.config.ts` +
  `e2e-smoke/readability.spec.ts` (script `npm run test:readability`) sweep the audit route table —
  `/`, `/curators`, `/curators/apply`, `/curators/recommend`, a missing curator handle, `/auth/error`,
  a 404 route, and the authed `/admin` + `/admin/curators` (dev-fallback cookie) — at desktop **1440**
  and mobile **390**. Each route asserts (1) no horizontal overflow, (2) the serving content rendered
  (not the dark error boundary), and (3) a **dark-shell-aware DOM contrast pass**: an in-page WCAG
  ratio that walks ancestors for the effective (possibly translucent) background and composites over
  the canonical `#0a0a0a` backdrop, failing any body text below AA. The two operator-only near-AA
  colors this cycle's *Remaining (open)* section documents (zinc-500 `rgb(113,113,122)` / zinc-600
  `rgb(82,82,91)`) are an explicit, commented allowlist — the guard catches the split-token
  light-on-dark regression it exists for, not intentional dim-secondary styling. Runs against the
  degrade path above (no `DATABASE_URL`), so it needs no database — **18/18 green, `$0`**.

`typecheck` / `lint` / `test:registry` (7) green; `test:readability` (18) green; new first-party code
(`lib/db.ts`, `e2e-smoke/`) Snyk-clean; `$0`, no new deps. **This completes Phase 16 (Design-System
Readability & Integrity Repair), all three cycles C1–C3.**

**Delivered earlier (June 25, 2026):**

- **Design Spec rewritten to match the implementation.** `docs/design/AVLmc-Design-Spec.md` now states the
  stack honestly (plain CSS + custom properties in `app/globals.css`; no Tailwind, no framer-motion), adds a
  **Design Tokens & Theming** section documenting the light `:root` tokens, the canonical **dark route-shell
  token context** from PRD 39, and the **opt-in-by-class** contract, and marks the Tailwind/framer-motion class
  names as illustrative of the *target visual language* rather than the current implementation.
- **First DB-backed audit pass (June 25, 2026).** With a real `DATABASE_URL` wired locally (via
  `neonctl connection-string`, prod main branch), a one-off Playwright sweep finally reached the DB-backed
  surfaces the earlier audits couldn't. All 13 routes × {desktop 1440, mobile 390} rendered with **zero
  horizontal overflow** and **no DB 500s**; the C1/C2-repaired surfaces showed **0 contrast failures**. The
  sweep ran read-only (all non-GET requests blocked) and authed admin via the dev-fallback cookie. Two
  newly-reachable surfaces had real failures, **now fixed**: the **curator profile** (`/curator/[handle]`,
  `.curator-shell`) was a plain `.shell` page inheriting light `--ink` (h1/h2/back-link ≈1.18:1 + gradient
  leak) — added `.curator-shell` to the dark route-shell group; and the **event-detail Save chip**
  (`.save-button--chip`, indigo-200 text) dropped to ~1.5:1 on the intentionally-light `.detail-shell` —
  scoped a dark-indigo variant there. Re-audit confirmed both → 0 fails.

Remaining (open, tolerated):

- **Admin Portal contrast polish (operator-only, new from the DB-backed pass).** The signed-in `/admin`
  overview has ~15 dim secondary labels: zinc-600 stat captions on zinc-900 panels (`2.29:1`) and zinc-500
  tertiary text/chips on black (`4.1:1`, just under AA). Broadly readable, operator-only, but a focused
  contrast pass over the AdminPortal `#52525b`/`#71717a` text sites would clear AA. (Also a borderline `4.1:1`
  brand `<small>` on home/sandbox.) These are the two colors the smoke test's documented allowlist
  intentionally passes — they are dim-secondary styling, not the split-token regression the guard exists for.

## Goals

- The Design Spec is accurate, dark-token-aware ground truth for humans + agents.
- Missing-local-`DATABASE_URL` is a deliberate, documented behavior, not an unreadable route error.
- A route-table readability smoke test guards C1+C2 against regression.

## Non-Goals

- Re-implementing the token context or the failure-state fixes (C1 / C2).
- Adopting Tailwind or framer-motion (explicitly out of scope; the spec documents reality).

## Requirements

### Documentation (`docs/design/AVLmc-Design-Spec.md`)

- State the real stack; add the **Design Tokens & Theming** section (light `:root` tokens, the dark
  route-shell token context, the opt-in-by-class contract, the full-bleed backdrop technique).
- Mark Tailwind/framer-motion references as target-language illustration, not implementation.

### Behavior (local DB) — done

- **Degrade** chosen and implemented centrally in `lib/db.ts` (`isDatabaseConfigured()` +
  not-configured short-circuit in `query()`), so missing-`DATABASE_URL` reads resolve to empty and the
  `lib/events.ts` seed/live-feed fallback (and every empty-state) renders instead of throwing.

### Tests — done

- `e2e-smoke/readability.spec.ts` + `playwright.smoke.config.ts` (`npm run test:readability`): render
  checks, no-overflow assertions at 1440/390, error/404/auth readability, dark-shell-aware DOM contrast
  pass. Runs against the degrade path (no DB). 18/18 green.

### Architecture & quality

- If the DB-degradation work touches `lib/*` reads, register/adjust nodes in `lib/system-registry.ts` and
  regenerate the system map; `test:registry` stays green. Snyk scan any new first-party code; `$0`.

## Dependencies

- C1 (PRD 39) token contract (what the spec documents); C2 (PRD 40) failure states (what the smoke test
  asserts); `lib/events.ts` seed-fallback precedent; the existing Playwright `test:e2e` harness.

## Risks

- **Smoke test flakiness without a stable DB/auth test state.** The local-DB decision should land first so the
  audited routes render deterministically under test.

## Acceptance Criteria

1. `AVLmc-Design-Spec.md` accurately describes the CSS-custom-property implementation and the dark route-shell
   token contract; no claim that Tailwind/framer-motion is in use.
2. Missing-local-`DATABASE_URL` produces graceful seed/empty rendering on the audited routes — not an
   unreadable route error. *(done — `lib/db.ts` degrade)*
3. A Playwright smoke test visits the audit route table, asserts no overflow, and asserts error/404/auth
   readability with a dark-shell-aware contrast pass. *(done — `test:readability`, 18/18)*
4. `typecheck` / `lint` / `test:registry` green; any new first-party code Snyk-clean; `$0`.

## Test Scenarios

- An agent reading only the spec can correctly predict the token names + the dark route-shell opt-in and not
  reach for Tailwind. *(done)*
- With no `DATABASE_URL`, `npm run dev` + the audited routes render readably, not the dark error boundary.
  *(done — verified by `test:readability` running with no DB)*
- The smoke test fails if a new page renders light-on-dark or overflows horizontally at `390`. *(done)*
