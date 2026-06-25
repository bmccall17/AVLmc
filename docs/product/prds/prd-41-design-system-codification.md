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

**In progress — June 26, 2026.** Delivered so far:

- **Design Spec rewritten to match the implementation.** `docs/design/AVLmc-Design-Spec.md` now states the
  stack honestly (plain CSS + custom properties in `app/globals.css`; no Tailwind, no framer-motion), adds a
  **Design Tokens & Theming** section documenting the light `:root` tokens, the canonical **dark route-shell
  token context** from PRD 39, and the **opt-in-by-class** contract, and marks the Tailwind/framer-motion class
  names as illustrative of the *target visual language* rather than the current implementation.

Remaining (open):

- **Local missing-`DATABASE_URL` behavior (audit P0).** Decide and implement: either require `DATABASE_URL`
  before `npm run dev` with a clear setup message, or degrade local/dev DB reads to seed/empty data where the
  product already claims resilience (note: `lib/events.ts` already has a feed-level seed fallback, but the DB
  read throws before it runs; the same degrade pattern would extend to `listCurators` / `listContributions`).
- **Automated readability/visual smoke test (audit P2).** A Playwright check (alongside the existing
  `test:e2e`) that visits every public + admin route in the audit's route table, captures desktop/mobile
  screenshots, asserts no horizontal overflow, asserts error/404/auth pages are readable, and runs a DOM
  contrast pass that is aware of dark route shells (not just CSS `background-color`).

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

### Behavior (local DB) — open

- Implement the chosen missing-`DATABASE_URL` strategy; extend the `lib/events.ts` seed-fallback pattern to the
  other audited reads if "degrade" is chosen, or add a clear `npm run dev` precondition message if "require".

### Tests — open

- Playwright smoke test over the audit route table: render checks, no-overflow assertions, error/404/auth
  readability, dark-shell-aware DOM contrast pass.

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
2. Missing-local-`DATABASE_URL` produces either a clear setup message or graceful seed/empty rendering on the
   audited routes — not an unreadable route error. *(open)*
3. A Playwright smoke test visits the audit route table, asserts no overflow, and asserts error/404/auth
   readability with a dark-shell-aware contrast pass. *(open)*
4. `typecheck` / `lint` / `test:registry` green; any new first-party code Snyk-clean; `$0`.

## Test Scenarios

- An agent reading only the spec can correctly predict the token names + the dark route-shell opt-in and not
  reach for Tailwind. *(done)*
- With no `DATABASE_URL`, `npm run dev` + the audited routes render readably (or fail with a clear setup
  message), not the dark error boundary. *(open)*
- The smoke test fails if a new page renders light-on-dark or overflows horizontally at `390`. *(open)*
