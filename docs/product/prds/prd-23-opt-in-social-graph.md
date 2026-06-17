# PRD 23: Opt-In Social Graph

Part of the [Social / Curator Graph initiative](../social-curator-prd.md) (Phase 12). Cycle **C1** (first of five). Satisfies desired outcome **1 (An Opt-In Social Graph)**. The spine every other cycle plugs into; Outcomes 2–5 are explicitly out of scope here.

## Goal

**Let a signed-in listener build a private, one-way, reversible circle — follow friends and curators, and choose whether their own activity is visible to people they approve — with zero leakage into any public or community response.**

There is no follow/friend graph today. Per-person state is `fire`/`planning`/`removed` plus private `saved_items`; everything social on the board is anonymous crowd heat. This cycle adds the **edge** (one listener follows another) and the **consent switch** (activity-sharing opt-in, off by default) on a `requireUserId()`-gated `app/api/me/*` API — and nothing else. It changes the board not at all. The value is the spine: C2 (attribution), C3 (curators), and C4 (the ranking signal) all read from it.

## Summary

A new additive `listener_follows` table stores **one-way** follow edges (unique per `(follower, followee)`, `on delete cascade`), managed through a `requireUserId()`-gated `GET/POST/DELETE /api/me/follows`. An **activity-sharing opt-in** ("Let people you approve see what you're going to / firing"), **off by default**, is added to the existing listener-preferences surface (`app/api/me/listener-preferences`) — it is the consent gate every later "your people" read checks. Following is reversible (unfollow deletes the row). The graph is **private by construction**: a `lib/social-graph.ts` service exposes only what the signed-in caller is entitled to (who *I* follow, my follower count), and **no** follow data ever appears in `app/api/community/*`, `app/api/events/[id]/*`, the anonymous board, or OG images. A reusable **Follow button** is wired where a person can be followed in C2/C3 (a minimal affordance this cycle; the curator/friend surfaces are later). Anonymous users get a sign-in nudge, mirroring `SaveButton`.

## Implementation Status

**Shipped — June 17, 2026.**

The follow-graph spine is live and the board is unchanged:

- **Data.** `listener_follows` (one-way edges, `unique (follower, followee)`, `check (follower <> followee)`, `on delete cascade` on both FKs, `(followee, status)` index) and an additive `share_activity boolean default false` column on `listener_discovery_preferences` — both in `db/schema.sql` (idempotent; `migrate-missing-tables.sql` is retired, schema.sql is the single source of truth).
- **Pure gate.** `lib/social-graph-core.ts` owns `isSelfFollow` and `canViewActivity` (true only with an active edge **and** the followee's sharing opt-in; self is always visible). Unit-tested in `tests/social-graph.test.ts`.
- **Service.** `lib/social-graph.ts` (`server-only`) — `followUser` (idempotent, rejects self-follow and non-existent followee), `unfollowUser`, `listFollowing`, `isFollowing`/`getFollowState`, `getFollowerCount` (aggregate only — no follower-identity method), and `canViewActivityOf` (joins the edge against `share_activity`). 42P01/42703-tolerant (degrades to empty/false).
- **Opt-in.** `shareActivity` (default false) added to `ListenerDiscoveryPreferences` (normalize/serialize) and persisted via the prefs store (writes the new column; falls back gracefully on a pre-migration DB). Surfaced as a clearly-worded toggle in the listener prefs panel.
- **API.** `app/api/me/follows/route.ts` — `requireUserId()`-gated GET/POST/DELETE; returns only the caller's own following list + their follower count, never another listener's followers.
- **UI.** Reusable `components/FollowButton.tsx` (distinct iconography, optimistic with rollback, anonymous sign-in nudge mirroring `SaveButton`); placement on friend/curator surfaces is C2/C3.
- **Architecture & quality.** `svc-social-graph`, `db-listener-follows` (+ `listener_follows` count), and `api-follows` registered in `lib/system-registry.ts`; count query added to `lib/admin/registry.ts`; `docs/product/system-map.generated.md` regenerated; `npm run test:registry`, `test:social-graph`, and the discovery/shared-songs/insight suites green; typecheck, lint, and `next build` clean; Snyk code scan clean; $0.
- **Privacy verified.** Social graph code is imported only by the signed-in `/api/me/follows` route (and the registry); no follow edge, follower/followee identity, or sharing state appears in any `app/api/community/*`, `app/api/events/[id]/*`, anonymous board, or OG response; the board ranking and anonymous payload are byte-for-byte unchanged.

## Goals

- A signed-in listener can **follow** and **unfollow** another listener; following is one-way (no reciprocation required) and reversible.
- A signed-in listener can **turn activity-sharing on/off** (off by default); when off, they are absent from every "your people" read (C2+).
- A `lib/social-graph.ts` service answers entitlement-scoped questions: *do I follow X?*, *who do I follow?*, *how many follow me?* — never exposing a followee's full follower list.
- The graph is **private by construction**: no follow edge, follower/followee identity, or sharing state appears in any public/community/OG response.
- A reusable **FollowButton** (distinct from Save / going / fire) with an anonymous sign-in nudge, ready for C2/C3 to place.

## Non-Goals

- **No** activity attribution ("your people are going") — that is C2.
- **No** curator concept, profile, or admin promotion — that is C3.
- **No** discovery-scoring change; the board ranking and the anonymous payload are byte-for-byte unchanged this cycle.
- **No** follower/following *lists* shown to others, no "X started following you" notifications, no friend-request/approval handshake (following is one-way and immediate; visibility is gated by the followee's *sharing* switch, not a per-follower approval).
- **No** Spotify writes; no new OAuth scope.

## Requirements

### Data — `listener_follows` (`db/schema.sql` + `db/migrate-missing-tables.sql`)

- Columns: `id`, `follower_user_id int not null references users(id) on delete cascade`, `followee_user_id int not null references users(id) on delete cascade`, `status text default 'active' check (active/blocked)`, `created_at timestamptz default now()`.
- `unique (follower_user_id, followee_user_id)`; `check (follower_user_id <> followee_user_id)` (no self-follow); index on `(followee_user_id, status)` for follower-count reads.
- Additive; follows the `migrate-missing-tables.sql` precedent (reads tolerate a not-yet-migrated table — Postgres `42P01` → degrade to empty, matching `lib/community.ts` / `lib/shared-songs.ts`).

### Activity-sharing opt-in (`lib/listener-preferences.ts` + `app/api/me/listener-preferences`)

- Add a boolean `shareActivity` (default **false**) to `ListenerDiscoveryPreferences` (normalize/serialize updated), persisted in the existing `listener_discovery_preferences` store — **no new table**. It is the single consent gate later cycles check before any "your people" read.
- Surfaced as a clearly-worded toggle in the listener preferences UI (`components/` listener-preferences surface): *"Let people you approve see what you're going to and firing. Off by default. This never changes the public community counts everyone already sees."*

### Service — `lib/social-graph.ts` (+ pure `lib/social-graph-core.ts` where logic warrants)

- `followUser(followerId, followeeId)` — idempotent upsert (`on conflict do nothing`), rejects self-follow and a non-existent followee.
- `unfollowUser(followerId, followeeId)` — deletes the edge (reversible follow).
- `listFollowing(userId)` — the people *I* follow (ids + minimal display fields the viewer is entitled to).
- `isFollowing(followerId, followeeId)` / `getFollowState(...)` — for the FollowButton and later gating.
- `getFollowerCount(userId)` — aggregate only; **never** a follower identity list for a regular listener.
- `canViewActivityOf(viewerId, targetId)` — the reusable gate: `true` only when an active follow edge exists **and** the target's `shareActivity` is on. Pure, unit-tested; C2/C4 import this rather than re-deriving the rule.

### API — `app/api/me/follows`

- `requireUserId()`-gated. `GET` → `{ following: [...] }` (the caller's own list + counts). `POST { followeeUserId }` → follow. `DELETE { followeeUserId }` → unfollow. Validates ids; never returns another listener's follower list. Mirrors the `app/api/me/saved-items` shape and error handling.

### Frontend — `components/FollowButton.tsx`

- A reusable follow/unfollow control (distinct iconography from Save / going / fire), optimistic with rollback, reflecting `isFollowing`. Anonymous users see a minimal sign-in affordance (mirrors `SaveButton`'s anonymous nudge), carrying a return path. The activity-sharing toggle lands in the existing listener-preferences panel. (Placement of FollowButton on friend/curator surfaces is C2/C3.)

### Architecture & quality

- Register `db-listener-follows` (+ `countKey`) and `svc-social-graph` and the follow flow in `lib/system-registry.ts`; add the count query in `lib/admin/registry.ts`; regenerate `docs/product/system-map.generated.md`; `npm run test:registry` passes.
- Unit-test the pure gate (`tests/social-graph.test.ts`): self-follow rejected, idempotent follow, `canViewActivityOf` true only with edge **and** opt-in, false when sharing off or edge absent.
- Snyk scan; confirm **no** follow/sharing data in any public/community/OG response; $0.

## Dependencies

- `requireUserId()` / `getOptionalUserId()` (auth helpers) + the `app/api/me/*` pattern.
- `lib/listener-preferences.ts` + `app/api/me/listener-preferences` (extended with `shareActivity`).
- `users(id)` (FK target); the `saved_items` / `SaveButton` precedent for the private-action + anonymous-nudge pattern.
- `db/migrate-missing-tables.sql` not-yet-migrated tolerance precedent.

## Risks

- **Privacy leak (headline).** A follow graph is the first person-to-person link in the product. Mitigated by `requireUserId()`-gating, entitlement-scoped service methods (no follower-list exposure), the off-by-default sharing switch, and a no-leak assertion in tests + Snyk.
- **Self-follow / dangling edges.** Mitigated by the `check` constraint, FK `on delete cascade`, and idempotent upsert.
- **Consent ambiguity.** A listener must understand that following is one-way and that *their* activity stays private until they opt in. Mitigated by the explicit toggle copy and off-by-default.
- **Deploy-before-migrate.** Mitigated by the `42P01`-tolerant reads (degrade to empty), matching the shipped pattern.

## Acceptance Criteria

- A signed-in listener can follow and unfollow another listener; re-following is idempotent (no duplicate rows); self-follow is rejected.
- The activity-sharing toggle defaults **off**; `canViewActivityOf` returns `true` only when both an active edge and the target's opt-in exist.
- `GET /api/me/follows` returns only the caller's own following list/counts; no endpoint exposes a regular listener's follower identities.
- No follow edge, sharing state, or follower/followee identity appears in any `app/api/community/*`, `app/api/events/[id]/*`, anonymous board, or OG response; the board ranking and anonymous payload are unchanged.
- `db-listener-follows` + `svc-social-graph` registered; `npm run test:registry` + the new unit tests pass; new code is Snyk-clean; $0.

## Test Scenarios

- Follow a listener → one `listener_follows` row; follow again → still one row (idempotent). Unfollow → row deleted.
- Attempt to follow yourself → rejected.
- A follows B; B's sharing is off → `canViewActivityOf(A, B)` is false. B turns sharing on → it is true. A unfollows → false again.
- Hit `GET /api/me/follows` as anonymous → 401/sign-in path; as a signed-in user → only own following + counts, never another's followers.
- Grep the anonymous board + community + OG payloads → no follow/sharing fields present.
- Delete a user → their follow edges cascade away (no orphans).
</content>
