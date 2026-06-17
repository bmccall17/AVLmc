# PRD 31: Curator Self-Management

Part of the [Curator Onboarding & Self-Management initiative](../curator-onboarding-prd.md) (Phase 13).
Cycle **C3** (third of five). Satisfies desired outcome **4 (Curator Self-Management)**. Depends on **C1
(PRD 29 — a promoted curator exists)**; independent of C2.

## Goal

**Let a promoted curator manage their own profile and picks — add/remove picks, edit their bio / display name /
avatar — from a curator-owned, `requireUserId()`-gated surface, so onboarding produces a self-sufficient
curator instead of one who still depends on an admin for every change.**

Today every pick and persona edit routes through the admin (`addCuratorPick` / `setPickStatus` /
`promoteCurator` via `app/api/admin/curators`). This cycle gives the curator a self-scoped plane; admin
moderation still overrides.

## Summary

A new `requireUserId()`-gated `app/api/me/curator` plane resolves the caller's **own** curator row from the
session, then exposes self-management: edit persona (display name / bio / avatar — handle changes optionally
allowed with re-validation), add a pick (event + note), and hide/remove one's own picks. It reuses the existing
service writes (`addCuratorPick` / `setPickStatus` / a new self-scoped persona update) and the pure
validation/shaping — but **scoped to the caller's curator id**, never an id from the body. A curator-owned
management surface (a "Manage my curator profile" page, reachable from the profile menu / the curator's own
profile when viewing as owner) drives it. Admin hide/demote (`app/api/admin/curators`) still overrides; a
hidden curator cannot self-unhide.

## Implementation Status

**Shipped (June 17, 2026).**

Delivered:
- **Service** (`lib/curators.ts`) — `getMyCurator(userId)` (caller's own row + all picks incl.
  hidden), `updateMyCuratorPersona` (display name / bio / avatar, handle re-validated if changed,
  unspecified fields preserved), `addMyPick`, `setMyPickStatus`, `removeMyPick`. All route through
  `requireOwnActiveCuratorId(userId)` which resolves the curator id from the **session** and refuses
  a non-active row; pick writes additionally enforce ownership in the SQL `where` (`curator_id` =
  the caller's id), so a crafted pick id for another curator matches nothing. The pure
  `canSelfManageCurator(status)` rule (active-only) is unit-tested.
- **API** — new `requireUserId()`-gated `app/api/me/curator` plane: `GET` my curator + picks;
  `PATCH` persona (or `target='pick'` show/hide); `POST` add pick; `DELETE` remove pick. 401
  anonymous, 404 if not a curator.
- **Frontend** — `app/curators/manage/page.tsx` + owner-only `components/CuratorManagePanel.tsx`:
  edit persona + a pick manager (add by event, show/hide, remove); read-only with an explanatory
  banner when the row is moderated (hidden/pending/rejected). Reachable from the apply-flow success
  state (C2) and an owner-only "Manage my profile" button on `/curator/[handle]` (shown instead of
  Follow when the viewer owns the profile).
- **Architecture & quality** — `api-me-curator` node + edge to `svc-curators` registered; map
  regenerated; `test:registry` green. Ownership-scoping + active-only rule covered (`test:curators`,
  10 pass). Typecheck + lint clean; new code Snyk-clean; no cross-curator access; admin moderation
  overrides; `$0`.

## Goals

- A promoted curator edits **their own** display name / bio / avatar (handle re-validated if changed).
- A curator **adds** a pick (event + optional note) and **hides/removes** their own picks.
- All actions are scoped to the caller's own curator id, resolved from the session — never the body.
- Admin moderation overrides: a hidden curator cannot self-reactivate; admin hide of a pick wins.

## Non-Goals

- **No** admin-route change (admin keeps its own plane; moderation overrides remain there).
- **No** ability to touch another curator's persona/picks — ever.
- **No** ranking change; **no** new pick store (reuse `curator_picks`); no Spotify writes; no pay-to-play.
- **No** first-pick activation UX — that's C4 (this cycle provides the self-pick capability it reuses).

## Requirements

### Service — `lib/curators.ts` (`server-only`)

- `getMyCurator(userId)` → the caller's own curator row (any status) or null.
- `updateMyCuratorPersona(userId, { displayName, bio, avatarUrl, handle? })` — resolve the caller's curator id,
  re-validate via the pure rules; **refuse if the row is `hidden`/`rejected`** (admin must restore).
- `addMyPick(userId, { eventId, eventTitle, note })` and `setMyPickStatus(userId, pickId, status)` — wrap the
  existing `addCuratorPick`/`setPickStatus` but **assert the pick belongs to the caller's curator id** before
  acting (ownership check at the SQL `where`).
- All self-scoped: the curator id is derived from `userId`, never accepted from the caller.

### APIs

- **New** `app/api/me/curator/route.ts` (+ nested as needed, e.g. `app/api/me/curator/picks/route.ts`),
  `requireUserId()`-gated: `GET` → my curator + my picks (incl. hidden, for management); `PATCH` persona;
  `POST` add pick; `PATCH/DELETE` hide/remove a pick. 403/404 if the caller has no active curator row.

### Frontend

- A **"Manage my curator profile"** surface (e.g. `app/curators/manage/page.tsx` or an owner-mode panel on
  `app/curator/[handle]/page.tsx`): edit persona form + a pick manager (add by event, hide/remove). Reachable
  from the profile menu and the apply-flow success state (C2). Owner-only; renders nothing for non-owners.

### Architecture & quality

- Register the new `api-me-curator` route(s) (+ edge to `svc-curators`) in `lib/system-registry.ts`; regenerate
  the map; `test:registry` green.
- Unit-test (`tests/curators.test.ts`) the ownership-scoping shape (a caller can only resolve/modify their own
  curator id) + persona re-validation + the hidden-row refusal.
- Snyk scan the new write surface; confirm no cross-curator access and no PII leak; `$0`.

## Dependencies

- **C1 (PRD 29)** — a promoted curator row exists; `getMyCuratorStatus`.
- Existing `addCuratorPick`/`setPickStatus`/`promoteCurator` upsert + the pure validation in `lib/curators-core.ts`.
- `requireUserId()`; the `app/api/me/*` route-shape precedent.

## Risks

- **Cross-curator access (the central risk).** A self-management write surface must never let A edit B.
  Mitigated by deriving the curator id from the **session** and an ownership `where` on every write + a unit
  test asserting it.
- **Self-unhide of a moderated curator.** Mitigated by refusing persona/pick writes on a `hidden`/`rejected`
  row (admin restore required).
- **Handle churn.** Optional handle edits could break links/collide. Mitigated by re-validation + uniqueness;
  consider rate-limiting handle changes (note for C5).

## Acceptance Criteria

- A curator edits their own persona and manages their own picks via `app/api/me/curator`; changes appear on
  their public profile (visible picks) and directory.
- A curator cannot read or modify another curator's persona/picks (ownership enforced + unit-tested).
- A hidden curator cannot self-reactivate; an admin-hidden pick stays hidden.
- New route registered; `test:registry` + `test:curators` pass; Snyk-clean; no cross-curator access; `$0`.

## Test Scenarios

- Curator A edits bio/display name → reflected on `/curator/a`; A adds a pick for event E → E shows "curated by a."
- A attempts (via crafted request) to modify B's pick id → 403/404, no change (ownership check).
- Admin hides A → A's `PATCH` persona is refused until admin restores.
- A hides their own pick → it disappears from public surfaces; A can re-show it.
- A changes handle to a taken/invalid value → rejected by re-validation.
