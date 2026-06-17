# PRD 29: Self-Serve Promotion & Threshold Gate

Part of the [Curator Onboarding & Self-Management initiative](../curator-onboarding-prd.md) (Phase 13).
Cycle **C1** (first of five). Satisfies desired outcome **1 (Self-Serve Promotion, threshold-gated)**. This
is the spine every other cycle plugs into; depends on nothing new beyond the shipped Phase 12 curator spine.

## Goal

**Let a signed-in listener become a curator without an admin in the loop while the platform is small — instant
under a configurable gate, an admin-reviewed pending queue above it — by authoring their own persona, with
admin demote/hide retained at every level and no pay-to-play.**

Today the only path to curator status is an admin calling `promoteCurator` with a user id
(`app/api/admin/curators`, `CuratorAdminPanel`). This cycle adds the **listener-side** path and the **gate**
that keeps it spam-resistant at scale, without yet building the apply UI (C2) — the API + data + gate logic.

## Summary

Extend the existing `curators` row to carry a self-serve lifecycle (`status` gains `pending`/`rejected`, plus
an `application_note` pitch column) — **no new table**. A pure, unit-tested gate predicate
(`isSelfServeOpen`) decides, from the live active-curator + user counts, whether a new application is promoted
**instantly** (`status='active', promoted_by_admin=false`) or lands **`pending`** for admin review. A new
`requireUserId()`-gated `app/api/me/curator-application` route lets a listener submit a self-authored persona
and read their own status; the existing admin route is extended to list pending applications and
approve/reject. Public reads are unchanged — they already filter `status='active'`, so `pending`/`rejected`
rows are invisible by construction.

## Implementation Status

**Shipped (June 17, 2026).**

Delivered:
- **Data** — `curators.status` widened to `('active','hidden','pending','rejected')` and an
  `application_note text` column added, both as idempotent additive changes in `db/schema.sql`
  (drop+re-add the named `curators_status_check`; `add column if not exists`).
- **Pure core** (`lib/curators-core.ts`) — `CURATOR_SELF_SERVE_GATE` (`25` curators / `250` users,
  tunable), the pure `isSelfServeOpen()` predicate, `cleanApplicationNote()`, the widened
  `CuratorStatus`, and the new `CuratorSelfStatus` (`none` + the stored states).
- **Service** (`lib/curators.ts`) — `getSelfServeAvailability()` (live counts → gate),
  `applyForCurator()` (instant-under-gate vs `pending`, always `promoted_by_admin=false`, with a
  no-self-downgrade / no-self-un-hide guard that preserves admin-controlled states),
  `getMyCuratorStatus()`, and `listCuratorApplications()` for the admin queue; `setCuratorStatus`
  now accepts `pending→active` (approve) / `pending→rejected` (reject) via the widened type.
- **APIs** — new `requireUserId()`-gated `app/api/me/curator-application` (`GET` my status +
  gate state, `POST` apply; user id from the session, never the body); admin
  `app/api/admin/curators` GET now also returns the pending `applications` queue.
- **Architecture & quality** — `api-me-curator-application` node + edge to `svc-curators`
  registered; system map regenerated; `test:registry` green. Gate boundaries + `cleanApplicationNote`
  unit-tested (`test:curators`, 8 pass). Typecheck + lint clean; new/changed code Snyk-clean; `$0`;
  no PII in responses (applications private to applicant + admin); nothing public changed.

## Goals

- A signed-in listener can submit a curator application (self-authored handle / display name / bio / pitch).
- Under the gate, the application is promoted **instantly**; above it, it lands **`pending`** for admin review.
- The gate is a **pure, unit-tested predicate** with tunable constants.
- An admin can list **pending applications** and **approve** (→ active) or **reject** (→ rejected); existing
  promote/demote/hide is unchanged.
- A listener can read **their own** curator/application status.
- Self-serve rows are flagged `promoted_by_admin = false`; nothing public changes.

## Non-Goals

- **No** apply UI / onboarding flow — that is C2 (PRD 30); this cycle is API + data + gate.
- **No** curator self-management of picks/persona — that is C3 (PRD 31).
- **No** discovery-ranking change — onboarding is graph/presentation; `socialCircle` (PRD 26) is untouched.
- **No** new table, no new dependency, no pay-to-play, no Spotify writes.

## Requirements

### Data (`db/schema.sql` + `db/migrate-missing-tables.sql`)

- Widen the `curators.status` check from `('active','hidden')` to `('active','hidden','pending','rejected')`.
  Migration drops + re-adds the named constraint: `alter table public.curators drop constraint if exists
  curators_status_check, add constraint curators_status_check check (status in
  ('active','hidden','pending','rejected'))`.
- Add `application_note text` (nullable) — the applicant's pitch.
- Additive; `42P01/42703`-tolerant. `promoted_by_admin` (exists) set `false` on self-serve rows.

### Pure core — `lib/curators-core.ts`

- `CURATOR_SELF_SERVE_GATE = { maxCurators, maxUsers }` (proposed defaults `25` / `250`, tunable).
- `isSelfServeOpen(activeCuratorCount: number, userCount: number, gate = CURATOR_SELF_SERVE_GATE): boolean`.
- `cleanApplicationNote(raw): string | null` (bounded, mirrors `cleanBio`).
- `CuratorSelfStatus = "none" | "pending" | "active" | "hidden" | "rejected"`.

### Service — `lib/curators.ts` (`server-only`)

- `getSelfServeAvailability(): Promise<{ open: boolean; activeCurators: number; users: number }>` — live counts
  through `isSelfServeOpen`.
- `applyForCurator({ userId, handle, displayName, bio, note })` — validate handle (reuse
  `isValidHandle`/`normalizeHandle`/`cleanDisplayName`/`cleanBio`/`cleanApplicationNote`); branch on
  `getSelfServeAvailability().open` → upsert `status='active'` (instant) or `status='pending'`, always
  `promoted_by_admin=false`; **guard: never downgrade an already-`active` curator**; reuse the unique-violation
  → "handle taken" and FK-violation mappings.
- `getMyCuratorStatus(userId): Promise<{ status: CuratorSelfStatus; handle?: string; … }>`.
- `listCuratorApplications(): Promise<…>` (admin) — `status='pending'` rows + persona + `application_note`.
- Reuse `setCuratorStatus` for approve (`pending→active`) / reject (`pending→rejected`); widen its accepted
  status values.

### APIs

- **New** `app/api/me/curator-application/route.ts` (`requireUserId()`-gated, mirrors `app/api/me/follows`):
  `GET` → `{ myStatus, selfServeOpen }`; `POST` → submit self-authored persona, returns resulting status
  (`active` instantly or `pending`). The user id comes from the **session**, never the body.
- **Extend** `app/api/admin/curators/route.ts`: `GET` includes pending (via `listCuratorsForAdmin` /
  `listCuratorApplications`); `PATCH` accepts `pending→active` (approve) and `pending→rejected` (reject).

### Architecture & quality

- Register `api-me-curator-application` (+ edge to `svc-curators`) in `lib/system-registry.ts`; regenerate the
  system map; `npm run test:registry` passes. No new table node (reuse `db-curators`).
- Unit-test (`tests/curators.test.ts`): `isSelfServeOpen` boundaries, `cleanApplicationNote`, instant-vs-pending
  branching shape, "no downgrade of an active curator", handle validation reuse.
- Snyk scan the new route + service code; confirm no PII in responses (application private to applicant +
  admin); `$0`.

## Dependencies

- The shipped Phase 12 curator spine: `curators` / `curator_picks`, `lib/curators.ts`, `lib/curators-core.ts`,
  `app/api/admin/curators`.
- `requireUserId()` (`lib/current-user.ts`); the `app/api/me/follows` route-shape precedent.

## Risks

- **Spam via instant promotion.** Mitigated by the gate (auto-falls back to admin review at scale), handle
  safety, one-persona-per-user (`user_id` unique), and admin demote/hide.
- **Accidental downgrade.** A re-submitting active curator must not drop to pending — explicit guard +
  unit test.
- **Pay-to-play.** No money path sets status; re-asserted against the PRD 27 invariant in C5.

## Acceptance Criteria

- Under the gate, `POST /api/me/curator-application` promotes instantly (`active`, `promoted_by_admin=false`);
  the curator appears in `/curators`.
- Above the gate, the same call lands `pending` (invisible publicly); an admin sees + approves it (→ active) or
  rejects it (→ rejected).
- `GET /api/me/curator-application` reports the caller's status across none/pending/active.
- An already-active curator re-submitting is not downgraded.
- `isSelfServeOpen` + shaping are unit-tested; `npm run test:registry` + `test:curators` pass; new code is
  Snyk-clean; no PII/tokens in responses; `$0`.

## Test Scenarios

- Gate open, listener U applies with handle `maya` → instant `active`; `/curator/maya` renders.
- Force gate closed (seed > Y curators or lower the constant) → U's application is `pending`, absent from
  `/curators`; admin approves → live; reject → stays hidden.
- Anonymous `POST` → 401 (gating); no body-supplied user id can promote another user.
- Duplicate/unsafe handle → rejected by validation.
- Active curator re-applies → status unchanged (no downgrade).
