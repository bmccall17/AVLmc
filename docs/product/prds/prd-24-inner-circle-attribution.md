# PRD 24: Inner-Circle Attribution

Part of the [Social / Curator Graph initiative](../social-curator-prd.md) (Phase 12). Cycle **C2** (second of five). Satisfies desired outcome **2 (Inner-Circle Attribution — your people, not the crowd)**. Depends on **C1 (PRD 23 — the follow graph)**; the discovery-ranking signal (Outcome 4) is out of scope here.

## Goal

**Let a signed-in listener see what the friends and curators they follow are going to and firing — and share shows and song lists with their circle — strictly gated so a person's activity is shown only to followers they have opted into sharing with, never to anonymous viewers, never as public popularity.**

This is the attribution Shared Listening (PRD 17) intentionally deferred: it turns the server-side `event_shared_songs.seeded_by_user_id` on-ramp into a visible, privacy-respecting **"your people are into this"** layer — clearly separate from the anonymous community heat the board already shows.

## Summary

Building on the C1 graph + the `canViewActivityOf` gate, this cycle adds a **read** layer (no new activity store): a `lib/social-activity.ts` service joins `listener_follows` against the existing `event_person_event_state` (going/firing) and `event_shared_songs.seeded_by_user_id`, returning **only** the activity of followees the viewer follows **and** who have activity-sharing on. It powers (a) a per-event **"People you follow"** strip on the event detail page ("3 people you follow are going · 1 firing"), (b) a per-card compact badge, and (c) attributed shared-song rows ("shared by Maya") — all behind `requireUserId()`, all absent from anonymous responses. A listener can **share a show or its song list with their circle** via a lightweight share affordance that is private to the graph (it does not write to Spotify and does not feed scoring). The anonymous public path (PRD 17's unattributed list, anonymous heat) is unchanged.

## Implementation Status

**Shipped — June 17, 2026.**

The "your people, not the crowd" read layer is live, gated by C1, with no new table:

- **Service.** `lib/social-activity.ts` (`server-only`) — `getCircleEventActivity` (one batched query joining `listener_follows` × `event_person_event_state`, gated at the join by the active edge **and** `share_activity = true`; "going"/"firing" = current planning/fire not overridden by a later removal), `attributeSharedSongs` (resolves `event_shared_songs.seeded_by_user_id` → display name **server-side at the gate**, attaches `sharedBy` only for entitled viewers, leaves every other row the PRD 17 unattributed shape), and `shareWithCircle` (idempotent, best-effort, marks the listener going — the state their circle reads; no Spotify write, no new ranking pathway). 42P01/42703-tolerant.
- **Pure shaping.** `lib/social-activity-core.ts` — `shapeCircleActivity` (bucket/count/dedupe), `summarizeCircleLabel` ("3 people you follow are going · 1 firing"), `circleBadgeCount`. Unit-tested in `tests/social-activity.test.ts`.
- **APIs.** `GET /api/me/circle-activity` (`?eventId=` or `?eventIds=`), `POST /api/me/circle-share` — both `requireUserId()`-gated, empty/401 for anonymous. `GET /api/events/[id]/shared-songs` now attaches `sharedBy` only when signed-in and entitled; the anonymous response is byte-for-byte the PRD 17 shape.
- **UI.** `components/CirclePresence.tsx` "People you follow" strip on the event detail page (distinct from anonymous heat); `sharedBy` attribution + a "Share with your circle" action in `components/SharedListening.tsx`; a compact "👥 N from your circle" badge on `components/EventBoard.tsx` cards (signed-in + entitled only). Board data fetched batched in `app/page.tsx` (one query/page), detail in `app/event/[id]/page.tsx`.
- **`PublicSharedSong`** gained an optional `sharedBy?: string | null` (absent on the anonymous/public path; never the raw `seeded_by_user_id`).
- **Architecture & quality.** `svc-social-activity`, `api-circle-activity`, `api-circle-share` registered (+ edges to `db-listener-follows`/`db-person-event-state`/`db-shared-songs` and to the board/detail surfaces); **no new table** (attribution is live-computed); system map regenerated; `test:registry`, `test:social-activity`, `test:shared-songs`, `test:discovery`, typecheck, lint, `next build`, and Snyk all green; $0.
- **Privacy verified.** Social-activity code is reached only from signed-in-gated paths; `getCircleEventActivity` returns `{}` and `attributeSharedSongs` is a no-op for anonymous callers; no circle/`sharedBy` data appears in any `app/api/community/*` or OG response; the anonymous board ranking and PRD 17 list are unchanged. A followee who turns sharing off (or is unfollowed) disappears immediately because gating happens at read time.

## Goals

- A signed-in listener sees, per event, **which followed-and-opted-in people are going / firing** — counts and (within their own circle) names — distinct from the anonymous community heat.
- A signed-in viewer sees shared songs **attributed** ("shared by …") **only** when the seeder is someone they follow who has opted in; everyone else (and all anonymous viewers) keep PRD 17's unattributed list.
- A listener can **share a show and its song list with their circle** through a private, in-app affordance (no Spotify write, no public post).
- All inner-circle attribution is **strictly gated** by `canViewActivityOf` (C1): follow edge **and** followee opt-in; never anonymous, never public popularity.

## Non-Goals

- **No** new per-event social-activity table — attribution is **live-computed** by joining the C1 graph against existing `event_person_event_state` + `event_shared_songs.seeded_by_user_id` (caching as needed).
- **No** discovery-scoring change — "your people" activity is a presentation layer this cycle; it becomes a ranking input only in C4. (Mirrors PRD 17's deliberate "shared songs don't feed scoring.")
- **No** change to the anonymous/public path — PRD 17's unattributed list and anonymous community heat are untouched.
- **No** curator-specific surface (C3); **no** Spotify writes; **no** external sharing/notifications.

## Requirements

### Service — `lib/social-activity.ts` (+ pure core for shaping)

- `getCircleEventActivity(viewerId, eventIds)` → per-event `{ goingCount, fireCount, people: [{ displayName }] }` computed by joining `listener_follows` (viewer's following, `status='active'`) against `event_person_event_state`, **filtered through `canViewActivityOf`** so a followee who turned sharing off contributes nothing. Batched for the board (one query per page, not per card).
- `attributeSharedSongs(viewerId, eventId, songs)` → augments PRD 17's public shared-song rows with `sharedBy` **only** for seeders the viewer is entitled to see; otherwise the row stays unattributed. Reuses `lib/shared-songs-core.ts`'s public-stripping discipline — `seeded_by_user_id` is resolved to a display name **server-side at the gate**, never shipped raw.
- `shareWithCircle({ userId, eventId, kind })` — records the listener's intent to surface a show/song-list to their circle (a lightweight, idempotent action; reuses existing state where possible). Best-effort, never blocks; no Spotify write.
- All reads return empty for anonymous callers and for events where no entitled activity exists.

### APIs

- **Per-event circle activity:** extend the event detail data path / add `GET /api/me/circle-activity?eventId=…` (`requireUserId()`-gated) → `{ goingCount, fireCount, people }` for that viewer's circle. Anonymous → empty/401.
- **Attributed shared songs:** the existing `GET /api/events/[id]/shared-songs` gains a viewer-gated `sharedBy` field **only** when signed in and entitled — the anonymous response is byte-for-byte the PRD 17 shape (no `sharedBy`).
- **Share with circle:** `POST /api/me/circle-share { eventId, kind }`, `requireUserId()`-gated, failure-safe.

### Frontend

- **Event detail** (`app/event/[id]/page.tsx`, `components/SharedListening.tsx`): a **"People you follow"** strip ("3 people you follow are going · 1 firing", with names within the viewer's circle), visually distinct from the anonymous community-heat counts; attributed "shared by …" labels on entitled shared-song rows; a **"Share with your circle"** action.
- **Board cards** (`components/EventBoard.tsx`): a compact, lazy "👥 N from your circle" badge when the signed-in viewer has entitled activity (absent for anonymous and when empty). Respects the board's lazy/`force-dynamic` posture.

### Architecture & quality

- Register `svc-social-activity` and the circle-activity/share routes in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` passes. (No new table — note that explicitly in the registry rationale.)
- Unit-test the gating (`tests/social-activity.test.ts`): activity from a not-followed person is excluded; a followed-but-sharing-off person is excluded; `sharedBy` appears only for entitled viewers; anonymous gets the unattributed PRD 17 shape.
- Snyk scan; confirm **no** `sharedBy`/circle data in anonymous responses or OG images; $0.

## Dependencies

- **C1 (PRD 23)** — `listener_follows`, `canViewActivityOf`, the `shareActivity` opt-in.
- **PRD 17 (Shared Listening)** — `event_shared_songs.seeded_by_user_id`, `lib/shared-songs-core.ts` public-stripping, the existing public read route.
- `event_person_event_state` (going/firing source); `users` display fields.
- The event detail + board surfaces (`components/SharedListening.tsx`, `components/EventBoard.tsx`).

## Risks

- **Privacy leak (headline).** Attribution is exactly where one person's activity reaches another. Mitigated by routing every read through `canViewActivityOf`, resolving `seeded_by_user_id`→name only server-side at the gate, an anonymous-empty contract, and leak tests + Snyk.
- **"Your people" confused with "the crowd."** Visually conflating the two would double-count popularity. Mitigated by a distinct strip/label and copy ("from your circle" vs. community counts).
- **Hot-path cost.** Per-event circle joins on the board could be expensive. Mitigated by batched one-query-per-page reads and caching; live-first, no denormalized table unless measured.
- **Stale entitlement.** A listener turning sharing off must immediately disappear. Mitigated by gating at read time (no cached attribution that outlives the opt-in).

## Acceptance Criteria

- A signed-in listener sees, per event, the going/firing of followees who opted in — counts and in-circle names — visually distinct from anonymous community heat.
- Shared songs show "shared by …" **only** to entitled viewers; anonymous and non-following viewers get PRD 17's unattributed list unchanged.
- A followee who turns sharing off immediately stops appearing in any "your people" read; a not-followed person never appears.
- A listener can share a show/song list with their circle; it performs no Spotify write and does not change ranking.
- No circle/`sharedBy` data in any anonymous or OG response; `npm run test:registry` + new unit tests pass; Snyk-clean; $0.

## Test Scenarios

- A follows B and C (both sharing on); B is going, C is firing an event → A's detail strip shows "1 going · 1 firing" with B and C named; an anonymous viewer sees none of it.
- B turns sharing off → A no longer sees B's activity on any event.
- B seeded a shared song → A (follows B, B opted in) sees "shared by B"; an anonymous viewer and a non-follower see the same row unattributed.
- Board page for a signed-in viewer with circle activity → batched badge renders; anonymous viewer → no badge, no extra queries leaking circle data.
- `Share with your circle` on an event → idempotent, no Spotify call, ranking unchanged.
</content>
