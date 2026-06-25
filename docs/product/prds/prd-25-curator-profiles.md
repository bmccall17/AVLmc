# PRD 25: Curator & Influencer Profiles

Part of the [Social / Curator Graph initiative](../social-curator-prd.md) (Phase 12). Cycle **C3** (third of five). Satisfies desired outcome **3 (Curator & Influencer Profiles)**. Depends on **C1 (PRD 23 — the follow graph)**; independent of C2. The discovery-ranking signal (Outcome 4) is out of scope here.

## Goal

**Introduce first-class, admin-promoted curator/influencer profiles — public top-lists and per-show picks, a "curated by" signal on the board, and the ability to follow a curator's taste the way you follow a friend — while regular listeners never get a public profile.**

The homepage already promises this ("Curators — Coming soon", `components/EventBoard.tsx:1416`). This cycle makes it real: a curator is an **admin-granted public persona** on top of an existing user, following the established admin-moderation pattern; following a curator reuses the **same** `listener_follows` edge as following a friend (so C4 treats both uniformly).

## Summary

A small additive `curators` table records the **public persona** for an admin-promoted user (`handle`, `display_name`, `bio`, `status`), and a `curator_picks` table records **per-show picks** (a curator's deliberate, attributed endorsement of an event). Admins promote/demote and moderate via the existing `app/api/admin/*` pattern (`POST /api/admin/curators`). A **public** curator profile page (`/curator/[handle]`) shows the curator's **top-list** (their most-picked artists/venues/genres or a curated lineup) and **per-show picks**, all transparent and attributed. A **"curated by"** signal appears on board cards / event detail for events a curator has picked. Following a curator is the same `FollowButton` / `listener_follows` edge from C1. The "Curators — Coming soon" callout is replaced by the live surface. Regular listeners get **no** public profile — only admin-promoted curators do.

## Implementation Status

**Shipped — June 17, 2026.**

Admin-promoted curator profiles are live; following a curator reuses the C1 edge:

- **Data.** `curators` (one row per promoted user — `handle` URL-safe + unique, `display_name`, `bio`, `status` active/hidden, `promoted_by_admin`) and `curator_picks` in `db/schema.sql`. **Deviation from the PRD's literal FK:** `curator_picks` has **no FK to events** (events re-ingest daily and a FK would cascade-delete picks) — it follows the established contributions/person-event-state precedent, snapshotting `event_title` and resolving live metadata via a tolerant `left join events` at read time. 42P01/42703-tolerant.
- **Pure core.** `lib/curators-core.ts` — `isValidHandle`/`normalizeHandle` (URL-safe, blocks traversal), `cleanDisplayName`/`cleanBio`, `buildCuratorTopList` (ranks most-picked artists/venues/genres). Unit-tested in `tests/curators.test.ts`.
- **Service.** `lib/curators.ts` (`server-only`) — public reads `listCurators`, `getCuratorProfile` (persona + derived top-list + visible picks), `getCuratedByForEvents` (batched board lookup, active+visible only); admin writes `promoteCurator` (idempotent upsert, rejects unsafe/duplicate handles + non-existent user), `setCuratorStatus`, `addCuratorPick`, `setPickStatus`, `listCuratorsForAdmin`. Public reads expose only the persona + visible picks — never private going/firing, never a non-curator listener.
- **APIs.** Public `GET /api/curators` (directory) + `GET /api/curators/[handle]` (profile, 404 for hidden/unknown/invalid); admin `POST/PATCH /api/admin/curators` (admin-cookie gated, mirrors `app/api/admin/resources`).
- **UI.** Public `app/curator/[handle]/page.tsx` (persona, top-list, picks, **FollowButton** on the C1 edge) + `app/curators/page.tsx` directory; a **"curated by [handle]"** signal on `EventBoard` cards and the event detail page (batched `getCuratedByForEvents` in `app/page.tsx` / the detail page); the "Curators — Coming soon" callout replaced by a live "Browse curators" entry point. Admin management via `app/admin/curators/page.tsx` + `components/admin/CuratorAdminPanel.tsx` (promote by user id, hide/show) — a focused admin sub-page rather than threading the heavy tabbed AdminPortal.
- **Architecture & quality.** `svc-curators`, `db-curators` + `db-curator-picks` (+ counts), `api-curators`, `api-admin-curators`, `ui-curator-profile` registered (+ edges, incl. `ui-curator-profile → api-follows`); admin count queries added; system map regenerated; `test:registry`, `test:curators`, typecheck, lint, `next build`, and Snyk all green; $0.
- **Privacy verified.** `lib/curators.ts` is `server-only` and not imported by any client component (the board imports the `CuratedBy` type from the pure core); no curator data in `app/api/community/*` or OG responses; public curator responses carry no tokens and no non-curator listener; ranking is unchanged this cycle (curator signal enters in C4).

**Post-ship enhancements — June 24, 2026 (curator-surface polish sprint).**

- **Directory taste signature.** `listCurators` now derives, per active curator, a taste signature — top genres + favorite venues (via the existing `buildCuratorTopList`) plus the latest and next-upcoming pick — in one extra batched picks query (no N+1). `app/curators/page.tsx` cards render genre/venue chips and a Next/Latest line; the profile-page top-list signal is now promoted into the directory.
- **Fire/Going auto-picks.** A signed-in **active curator**'s Fire or Going now surfaces as a visible curator pick: `app/api/discovery/event-action` calls the new non-throwing `addPickIfActiveCurator` / `hidePickIfActiveCurator` (`lib/curators.ts`) — upsert on toggle-on (the unique `(curator_id, event_id)`), hide on toggle-off — and returns `curatorPickAdded`, which the board (`EventBoard`) and detail view (`CommunityPanel`) surface as an "Added to your curator picks" toast. No-op for non-curators; fully failure-safe (a pick write never breaks the reaction).
- **Recommend-a-curator intake.** New `/curators/recommend` flow (signed-in only, admin queue + Resend) replacing the old `mailto:` — see the `curator_recommendations` table / `api-me-curator-recommendation` node and the backlog Done entry (June 24, 2026).
- **Email-first curator signup.** The apply flow's anonymous CTA now uses the shared `components/EmailSignInPanel.tsx` (email magic-link primary, Spotify optional) instead of Spotify-only, matching the listener profile (PRD 34). The homepage curator callout links `/curators/apply` + `/curators/recommend` directly.
- **Quality.** `typecheck` / `lint` / `test:registry` / `test:curators` / `test:curator-recommendations` / `next build` green; new code Snyk-clean (an admin nominee-link stored-XSS was caught and fixed by rendering it inert); system map regenerated; `$0`.

## Goals

- An admin can **promote** a listener to curator and **demote/hide** one, via the existing admin-moderation pattern (controlled, $0, spam-resistant).
- A curator has a **public profile** (`/curator/[handle]`) with a **top-list** and **per-show picks**, transparent and attributed.
- A **"curated by [curator]"** signal appears on the board / event detail for picked events.
- A listener can **follow a curator** using the same one-way follow edge as a friend (C1), bringing the curator into their circle (ranking influence is C4).
- The homepage "Curators — Coming soon" callout is replaced by the real curators surface (a directory or featured curators entry point).

## Non-Goals

- **No** self-serve curator onboarding — promotion is **admin-only** this cycle (locked decision; self-serve deferred).
- **No** public profiles for regular (non-curator) listeners — ever.
- **No** discovery-scoring change — "curated by" and follows are presentation/graph this cycle; curator signal enters ranking in C4.
- **No** pay-to-play — curator status is admin-granted; no money path sets or biases it.
- **No** Spotify writes; **no** external posting.

## Requirements

### Data (`db/schema.sql` + `db/migrate-missing-tables.sql`)

- **`curators`**: `id`, `user_id int not null unique references users(id) on delete cascade`, `handle text not null unique` (URL-safe, validated), `display_name`, `bio text`, `avatar_url text null`, `status text default 'active' check (active/hidden)`, `promoted_by_admin bool default true`, `created_at`. One row per promoted user.
- **`curator_picks`**: `id`, `curator_id references curators(id) on delete cascade`, `event_id references events(id) on delete cascade`, `note text null`, `created_at`, `status text default 'visible' check (visible/hidden)`; `unique (curator_id, event_id)`; index `(event_id, status)` for the "curated by" board lookup.
- Additive; `42P01`-tolerant reads (degrade to empty), per the shipped precedent.

### Service — `lib/curators.ts` (+ pure core)

- Public reads: `getCuratorByHandle(handle)`, `listCuratorPicks(curatorId)`, `buildCuratorTopList(curatorId)` (derive top artists/venues/genres from the curator's picks + public activity), `getCuratedByForEvents(eventIds)` (the "curated by" board lookup, visible-only, batched).
- Admin writes: `promoteCurator(userId, {handle, displayName, bio})`, `setCuratorStatus(id, status)`, `addCuratorPick / setPickStatus`. Mirrors `lib/admin/resources.ts` / shared-songs admin.
- Public reads expose **only** the public persona + visible picks; never the curator's private going/firing unless surfaced as an explicit pick.

### APIs

- **Public:** `GET /api/curators` (directory/featured), `GET /api/curators/[handle]` (profile + top-list + picks) — visible-only, no private data.
- **Admin:** `POST /api/admin/curators` (promote/demote/hide, add/hide picks), admin-cookie gated, mirroring `app/api/admin/contributions`.
- **Curated-by:** fold `getCuratedByForEvents` into the board/event data path (batched), surfacing a compact `curatedBy` per event.

### Frontend

- **Curator profile** `app/curator/[handle]/page.tsx` (public, indexable as appropriate): persona header, top-list, per-show picks (with notes), and a **FollowButton** (C1 edge). SEO/OG consistent with event pages.
- **"Curated by" signal** on `components/EventBoard.tsx` cards + `app/event/[id]/page.tsx` ("Curated by [handle]"), linking to the profile.
- **Replace the callout:** swap the "Curators — Coming soon" block (`components/EventBoard.tsx:1416`) for a live curators entry point (featured/directory link).
- **Admin:** a curators management surface in the admin portal (promote by user, edit persona, hide/show, manage picks), reusing the moderation UI patterns.

### Architecture & quality

- Register `db-curators`, `db-curator-picks` (+ `countKey`s), `svc-curators`, the public + admin routes, and the curator-profile page in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` passes.
- Unit-test the pure core (`tests/curators.test.ts`): handle validation, top-list derivation, public-shaping (no private fields), visible-only filtering.
- Snyk scan (new public route + admin route); confirm curator public responses carry no tokens/PII and no non-curator listener is ever exposed; $0.

## Dependencies

- **C1 (PRD 23)** — `listener_follows` + `FollowButton` (following a curator is the same edge).
- Admin-moderation pattern (`app/api/admin/contributions`, `lib/admin/resources.ts`, admin auth/cookie).
- `events` (FK for picks); `users` (FK for the curator persona).
- The homepage callout in `components/EventBoard.tsx`.

## Risks

- **Pay-to-play pressure.** Curators are an influence surface. Mitigated by admin-only promotion (no self-serve, no purchase), $0, and the C5 "no money buys rank" invariant.
- **Spam / abuse of a public surface.** Mitigated by admin moderation (hide curator / hide pick), reusing the shipped pattern; only admin-promoted users get a profile.
- **Accidental private exposure.** A curator is still a person with private activity. Mitigated by public reads exposing only the persona + explicit picks (never private going/firing), and the no-non-curator-profile rule.
- **Handle collisions / unsafe handles.** Mitigated by `unique` + URL-safe validation in the pure core.

## Acceptance Criteria

- An admin can promote a listener to curator (creating a public profile) and demote/hide one; a non-promoted listener has **no** public profile.
- `/curator/[handle]` shows the curator's top-list and per-show picks, attributed and transparent; hidden curators/picks are excluded.
- Picked events show a "curated by [handle]" signal on the board and detail page, linking to the profile.
- A listener can follow a curator via the C1 follow edge.
- The "Curators — Coming soon" callout is replaced by the live surface; ranking is unchanged this cycle.
- `npm run test:registry` + new unit tests pass; new public/admin code is Snyk-clean; no PII/tokens in curator responses; $0.

## Test Scenarios

- Admin promotes user U to curator with handle `maya` → `/curator/maya` renders persona + top-list; U previously had no public profile and a non-promoted user still has none.
- Admin adds a pick for event E with a note → E shows "curated by maya"; admin hides the pick → the signal disappears.
- A signed-in listener follows the curator → a `listener_follows` edge is created (same as following a friend).
- Hit `GET /api/curators/[handle]` → only persona + visible picks; no tokens, no private going/firing, no other listeners.
- Admin hides the curator → profile + "curated by" signals vanish from public surfaces.
- Attempt a duplicate/unsafe handle → rejected by validation.
</content>
