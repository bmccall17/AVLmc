# PRD 33: Guardrails & Oversight at Scale

Part of the [Curator Onboarding & Self-Management initiative](../curator-onboarding-prd.md) (Phase 13).
Cycle **C5** (fifth of five — the capstone). Satisfies desired outcome **5 (Guardrails & Oversight at
Scale)**. Depends on **C1–C4** — you can only grade/guard a surface that exists.

## Goal

**Keep the self-serve curator surface healthy as it grows: the threshold gate as the primary anti-spam valve,
an admin pending-review queue + curator-growth/not-activated oversight, hardened anti-abuse, a re-asserted
no-pay-to-play guarantee, and a PII/leak audit of every new surface this initiative added.**

This is the accountability capstone — the safety story that makes instant self-serve responsible.

## Summary

Make the gate **operable and visible**: record its thresholds in the roadmap's **Scaling Milestones & Tracking**
table, and give admins a **pending-review queue** (approve/reject) plus a **curator-growth + not-activated**
read in `CuratorAdminPanel`. Harden anti-abuse on the self-serve write surfaces (handle-change rate limiting,
one-persona-per-user reconfirmed, application re-submit handling). Re-assert and unit-test **no money buys
status or rank** against the PRD 27 invariant, and run a codified **PII/leak audit** confirming no application,
pending row, or self-management field ever reaches a public/community/OG response. Curator influence on ranking
stays graded by the existing PRD 27 Social & Curator Benchmark — unchanged by this initiative.

## Implementation Status

**Shipped (June 17, 2026). Phase 13 complete.**

Delivered:
- **Admin oversight** (`app/api/admin/curators` + `CuratorAdminPanel`) — GET now also returns the
  `pending` applications queue, the not-activated set (`listNotActivatedCurators`, C4), and a `gate`
  block (active-curator/user counts vs. `CURATOR_SELF_SERVE_GATE` + open/closed). The panel renders a
  gate/growth banner, a **Pending applications** section with **Approve** (→ active) / **Reject** (→
  rejected), a **Not activated** section (with Hide), and the full curator list; the manual
  promote-by-user-id form stays.
- **Anti-abuse** — handle-change rate limiting: new `handle_changed_at` column (additive, idempotent)
  + pure `canChangeHandle()` (one change / 24h, unit-tested); enforced in `updateMyCuratorPersona`
  only when the handle actually changes. One-persona-per-user stays (`curators.user_id` unique);
  re-submit is idempotent + no-downgrade (C1).
- **No-pay-to-play** — re-asserted + unit-tested (`test:social-guardrails`): no payment/entitlement
  token may appear in any curator self-serve write surface (service, core, all three routes).
- **PII/leak audit** (codified, re-runnable) — public curator surfaces never reference
  `application_note` / pending rows / self-management reads; every public curator read filters
  `status='active'` so pending/rejected rows are invisible by construction.
- **Roadmap** — Scaling Milestones & Tracking row added for the curator self-serve gate with the
  tuned thresholds; Phase 13 marked complete across status surfaces.
- **Quality** — `test:curators` (12) + `test:social-guardrails` (12) + `test:registry` green;
  typecheck + lint clean; new code Snyk-clean; `$0`.

## Goals

- The gate thresholds are recorded in the **Scaling Milestones** table and tunable from one place
  (`CURATOR_SELF_SERVE_GATE`).
- Admins have a **pending-review queue** (approve → active / reject → rejected) and a **curator-growth +
  not-activated** oversight read in `CuratorAdminPanel`.
- Anti-abuse hardened: handle-change rate limiting, one-persona-per-user reconfirmed, sane re-submit behavior.
- **No money buys status or rank** — re-asserted + unit-tested against the PRD 27 invariant.
- A **PII/leak audit** confirms no application / pending / self-management data in any public surface.

## Non-Goals

- **No** new ranking signal or change to `socialCircle` (PRD 26) / its benchmark (PRD 27) — only re-assertion.
- **No** new public surface; this cycle is admin oversight + hardening + audit.
- **No** removal of instant self-serve — the gate governs it; this cycle makes the gate operable.

## Requirements

### Admin oversight — `app/api/admin/curators` + `components/admin/CuratorAdminPanel.tsx`

- A **Pending applications** section: list `pending` rows (persona + `application_note`) with **Approve** /
  **Reject** (reuse C1's `setCuratorStatus` transitions). The manual promote-by-user-id form stays.
- A **curator-growth / not-activated** read: total active curators vs. the gate, and the not-activated set
  (`listNotActivatedCurators`, C4) so an admin can nudge or hide stale empty profiles.

### Anti-abuse & invariants

- **Handle-change rate limiting** on `updateMyCuratorPersona` (C3) — bound changes per window (note-only if a
  store is needed; prefer a cheap timestamp check on `updated_at`).
- **One persona per user** reconfirmed (`curators.user_id` unique) and re-submit behavior defined (idempotent;
  no downgrade — from C1).
- **No-pay-to-play invariant** (re-assert PRD 27 style): a fabricated payment field on the apply/self-management
  payloads leaves status + ranking identical; no code path reads money to set/raise status or rank. Unit-tested.

### Privacy / leak audit

- A codified audit (test or documented checklist, mirroring PRD 27's audit) confirming: no `application_note`,
  no `pending`/`rejected` row, no self-management field, and no `user_id`/PII appears in `app/api/community/*`,
  `app/api/events/[id]/*`, `app/api/curators*` (public), OG images, or the anonymous board payload. Public
  curator reads still expose only the persona + visible picks.

### Roadmap / docs

- Add a **Scaling Milestones & Tracking** row in `master-roadmap.md` for the curator self-serve gate
  (instant while `< Y curators` and `< X users`; admin-reviewed above) with the concrete tuned thresholds.
- Mark the Phase 13 initiative complete on ship across the status surfaces (per `workflow.md`).

### Architecture & quality

- Any oversight count added to the registry where countable; regenerate the map; `test:registry` green.
- Unit-test the no-pay-to-play invariant + the leak audit assertions (`tests/`); Snyk scan; `$0`.

## Dependencies

- **C1–C4** — the gate, application API, apply flow, self-management, and activation signal all exist.
- The PRD 27 guardrail/benchmark precedent (`test:social-guardrails`, the influence-concentration read).
- `CuratorAdminPanel` / `app/api/admin/curators`; the Scaling Milestones table.

## Risks

- **Gate set wrong.** Too high → spam slips in; too low → needless admin load. Mitigated by tunable constants in
  one place + the oversight read to observe growth and adjust.
- **Audit drift.** A future change could leak an application field. Mitigated by a codified, re-runnable audit
  test, not a one-time manual check.
- **Admin queue neglect above the gate.** Mitigated by surfacing pending count prominently in the panel.

## Acceptance Criteria

- The gate thresholds are recorded in the Scaling Milestones table and tunable from `CURATOR_SELF_SERVE_GATE`.
- Admins can approve/reject pending applications and read curator-growth + the not-activated set in the panel.
- Handle-change rate limiting + one-persona-per-user are enforced; re-submit is idempotent.
- The no-pay-to-play invariant and the PII/leak audit are unit-tested and green; no application/pending/self-mgmt
  data appears in any public response.
- `test:registry` + new tests pass; Snyk-clean; `$0`. **Phase 13 complete on ship.**

## Test Scenarios

- Above the gate, an application is `pending` → admin sees it in the queue → approve makes it live; reject hides
  it; the manual promote form still works.
- A fabricated `paid: true` / `amount` field on the apply or self-management payload changes nothing (status +
  ranking identical) — unit-tested.
- The leak-audit test asserts no `application_note` / pending row / `user_id` in any public/community/OG response.
- Rapid repeated handle changes are rate-limited.
- The admin panel shows the active-curator count vs. the gate and the not-activated curators.
