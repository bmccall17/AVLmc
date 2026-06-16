# PRD 12: Saved Foundation & Save Actions

Part of the [Saved/Favorites & Genre Initiative](../saved-favorites-genre-prd.md). Cycle **C1** (Track A). Satisfies desired outcomes **2 (Favoriting is a first-class, distinct action)** and **5 (Honest, private, and reversible)**.

## Summary

Establish the data spine and write path for Saved/Favorites: a signed-in listener can **save and un-save events, venues, and artists**, with each save private, durable, and instantly reversible. This cycle delivers the `saved_items` model, the normalized identity that makes venues and artists savable despite having no canonical entity tables, the signed-in API, and the save controls across the surfaces where these objects appear. It does **not** build the Saved space view (C2) or feed favorites into ranking (C3) — it makes saving exist, correctly and privately.

## Implementation Status

**Shipped.** Delivered:

- **Data model** — `saved_items` polymorphic table (`db/schema.sql` + `db/migrate-missing-tables.sql`): `user_id` FK to `users` with `on delete cascade`, `item_type` check (`event`/`venue`/`artist`), `item_key`, `label`, optional `event_id`, unique on `(user_id, item_type, item_key)`, indexed on `(user_id, item_type)`.
- **Service** — `lib/saved-items.ts`: `saveItem` (idempotent `on conflict do nothing` upsert), `removeSavedItem` (idempotent), `listSavedItems` (grouped by type, used by C2), `getSavedKeys` (one cheap query for board hydration). Venue/artist keys derived via `normalizeText` (now exported from `lib/discovery.ts`) so saving and scoring share one normalization; `label` snapshots the display name. Degrades to empty when the table is absent.
- **API** — `app/api/me/saved-items/route.ts`: `GET`/`POST`/`DELETE`, `requireUserId()`-gated (401 when anonymous), `force-dynamic`, server-side input validation + length caps.
- **Save controls** — reusable `components/SaveButton.tsx` (optimistic toggle with rollback; a bookmark, distinct from going/fire/remove). Wired into `EventBoard` card action bars (event saves, hydrated via `getSavedKeys` through `app/page.tsx`) and the event detail page for **event, venue, and artist** (saved state computed server-side). Anonymous users get a minimal sign-in affordance (full action-preserving nudge is C2).
- **Privacy** — signed-in-only; saved data never appears in public/community responses; un-save deletes the row entirely.
- **Architecture** — registered `db-saved-items` (datastore), `svc-saved-items` (service), `api-saved-items` (surface) + edges and the `saved_items` count in `lib/system-registry.ts` / `lib/admin/registry.ts`; `npm run generate:system-map` re-run; `npm run test:registry` passes. New code passes Snyk; cycle runs at $0.

## Goals

- A signed-in listener can save/un-save an **event** (from a board card and the event detail page), a **venue**, and an **artist**, and see the control reflect saved state immediately.
- Persist saves in a single private `saved_items` table keyed so venues/artists are savable without canonical entity tables.
- Expose a signed-in, server-side API to create, list, and remove saves.
- Saving is gated to signed-in users; anonymous users see the control but are routed toward sign-in (full nudge UX lands in C2).
- Every save is reversible with no residue, and no saved data appears in any public/community response.

## Non-Goals

- No Saved space / list views — that is C2.
- No sign-in *nudge* flow with action preservation — that is C2 (C1 may show a minimal "sign in to save" affordance).
- No discovery-scoring influence from favorites — that is C3.
- No anonymous/cookie-backed saved state (saving is a signed-in benefit by design).
- No canonical venue/artist tables; no editing of venue/artist records.

## Requirements

### Data model (`db/schema.sql` + `db/migrate-missing-tables.sql`)

Add a single polymorphic table, additive (`create table if not exists`):

```
saved_items (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  item_type text not null check (item_type in ('event','venue','artist')),
  item_key text not null,
  label text not null,
  event_id text,            -- set when item_type = 'event'
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_key)
)
```

- **Identity rule:** for `event`, `item_key` is the stable event id (and `event_id` mirrors it). For `venue`/`artist`, `item_key` is the **normalized name** from the same `normalizeText` used in `lib/discovery.ts`; `label` snapshots the human-readable display name at save time. This guarantees a saved venue/artist matches event fields consistently in C3.
- Index `(user_id, item_type)` for grouped reads. `on delete cascade` so deleting a user removes saves.

### Service layer (`lib/saved-items.ts`)

A new module owning all saved-item logic (registered in `lib/system-registry.ts`):

- `saveItem(userId, { itemType, itemKey, label, eventId? })` — idempotent upsert (`on conflict do nothing`), returns the canonical saved row.
- `removeSavedItem(userId, { itemType, itemKey })` — deletes; idempotent.
- `listSavedItems(userId)` — returns saves grouped by `item_type` (used by C2; defined here).
- `getSavedKeys(userId)` — lightweight set of `{itemType,itemKey}` for hydrating "is saved" state on the board (used by the board loader).
- Reuse the existing `normalizeText` for key derivation so saving and scoring share one normalization (extract/export it if currently file-local to `lib/discovery.ts`).

### API (`app/api/me/saved-items/route.ts`)

Under the existing signed-in `app/api/me/*` namespace, `dynamic = "force-dynamic"`, all `requireUserId()`-gated:

- `GET` → current user's saves grouped by type.
- `POST { itemType, itemKey, label, eventId? }` → save; validates `itemType`, trims/normalizes keys server-side; returns the saved row.
- `DELETE { itemType, itemKey }` → un-save; returns success.
- Unauthenticated requests return `401`; never a silent success. Inputs are validated and length-capped.

### Save controls (UI)

A small reusable `SaveButton` (client) that shows saved/unsaved state, calls the API, and updates optimistically with rollback on error:

- **Event:** on board cards (`components/EventBoard.tsx`) and the event detail page, clearly distinct from the existing `planning` / `fire` / `remove` controls (different icon/label — e.g. a bookmark, not a flame). Board state is hydrated from `getSavedKeys` so saved events render correctly on load.
- **Venue:** wherever a venue is presented as an object (event detail venue line; venue filter context).
- **Artist:** on the event's artist/lineup and on artist-bearing recommendation rows.
- For anonymous users the control is visible but prompts sign-in (minimal affordance in C1; the action-preserving nudge is C2).

### Privacy & reversibility

- Saved data is private to the owner: it must never appear in public event payloads, community/contribution/reaction responses, OG/Twitter images, or anywhere alongside `session_id`/`user_id`.
- Un-saving removes the row entirely (no soft-delete needed for this object); re-saving is clean.

### Architecture registration

Register `saved_items` (datastore) and `lib/saved-items.ts` (service) plus the new route in `lib/system-registry.ts` with correct `sourceOfTruth`; run `npm run generate:system-map`; `npm run test:registry` passes.

## Dependencies

- Auth foundation: `requireUserId()` / `getOptionalUserId()` (`lib/current-user.ts`), `users` table, NextAuth.
- `normalizeText` from `lib/discovery.ts` (shared normalization).
- `components/EventBoard.tsx` and the event detail page for control placement.

## Risks

- **Venue/artist identity mismatch** — mitigated by reusing the single `normalizeText` and snapshotting `label` for display.
- **Confusion with planning/fire** — mitigated by visually distinct affordance and copy ("Save for later" vs. "Planning to go").
- **Anonymous dead-end** — C1 ships only a minimal sign-in affordance; the full action-preserving nudge is C2, so anonymous users are guided, not blocked.
- **Hot-path cost** — hydrating saved state on the board must be one cheap query (`getSavedKeys`), not per-card lookups.

## Acceptance Criteria

- A signed-in user can save and un-save an event, a venue, and an artist; state persists across reloads and is reflected wherever that object appears.
- `saved_items` enforces one row per `(user_id, item_type, item_key)`; saved venue/artist keys are normalized and stable.
- `GET/POST/DELETE /api/me/saved-items` work, are signed-in-only (401 otherwise), and never leak saves into public responses.
- The save control is visually and semantically distinct from planning/fire/remove.
- New table/service/route are registered; `npm run test:registry` passes; new code passes a Snyk scan; the cycle runs at $0.

## Test Scenarios

- Signed-in: save an event → reload → still saved; un-save → gone. Repeat for a venue and an artist.
- Save the same venue twice → exactly one row (idempotent).
- Two events at the same venue → saving that venue once is keyed by normalized venue name, independent of either event's saved state.
- Anonymous: the save control prompts sign-in and does not write.
- Public event/contribution/reaction responses contain no saved-item data.
- Hit `POST /api/me/saved-items` unauthenticated → 401, no write.
- Delete a user → their `saved_items` rows are removed (cascade).
