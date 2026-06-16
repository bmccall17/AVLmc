# Saved/Favorites & Richer Genre Matching — Master PRD (Epic)

Updated: June 15, 2026

## One-Sentence Goal

Give a signed-in listener a private, first-class **Saved** space for the events, venues, and artists they care about — and make the board's **genre understanding richer** for everyone — so the AVL Music Companion both *remembers* what a person values and *matches* it more intelligently, while the public board stays fully usable without an account.

## How To Use This Document

This is the umbrella tracker for the Saved/Favorites & Genre initiative (**Phase 8** in [`master-roadmap.md`](master-roadmap.md)). It synthesizes the desired outcomes in [`saved-favorites-genre_desiredoutcomes.md`](saved-favorites-genre_desiredoutcomes.md) into a sequenced series of focused PRDs in [`prds/`](prds/) (PRDs **12–16**). Treat this file the way [`admin-portal-prd.md`](admin-portal-prd.md) serves Phase 7: the epic owns shared architecture, cross-cutting rules, and sequencing; each cycle PRD owns one independently shippable increment.

Unlike the Admin Portal initiative (a single spine — the System Registry — that every cycle reused), this initiative is **two largely independent tracks** that can be interleaved by priority:

- **Track A — Saved / Favorites** (Outcomes 1–5): C1–C3.
- **Track B — Richer Genre Matching** (Outcomes 6–8): C4–C5.

Outcome 9 (Spotify library/playlist *write* actions) is **parked**; see [Parked / Future](#parked--future-outcome-9).

## Current State (Brownfield Baseline)

Neither track is greenfield; both extend live systems.

**Saved/Favorites — does not exist.** The only per-person event state today is `fire` / `planning` / `removed`, stored in `event_person_event_state` via `lib/discovery-memory.ts` and written through `POST /api/discovery/event-action`, using a **merged cookie + account** model (anonymous `avl_anonymous_session` or signed-in `user_id`). There is no "save" concept, no saved list, and **no savable identity for venues or artists** — events carry a `venue` name string and a derived `artistName`; there are no canonical `venues`/`artists` tables. Auth helpers are `requireUserId()` / `getOptionalUserId()` (`lib/current-user.ts`).

**Genre matching — shallow.** `scoreGenreMatch(event)` (`lib/discovery.ts:345`) counts non-generic tags and checks a **hardcoded 15-term genre list**, returning `min(24, usefulTags*6 + 8)`. Its output is the `genreMatch` base in `getPreferenceComponentBases`, then weighted by the existing `genreMatch` control (one of nine `LISTENER_PREFERENCE_CONTROLS` in `lib/listener-preferences.ts`, 0–200, default 100) in `scorePreferenceTuning`. There is **no taxonomy, no aliases, and no parent/child relationships**, and event cards show only coarse genre reasons.

**Spotify taste — artist/track names only, no genres.** `syncSpotifyMusicProfile` (`lib/music.ts`) stores top artists/tracks into `music_profile_items` (`artist_names text[]`, **no genres column**). `SpotifyTopArtistsResponse` (`lib/music.ts:80`) and `normalizeArtists` (`:611`) **discard the `genres[]` array Spotify already returns** on each artist. `scoreSpotifyMatch` matches by name only. Scopes are read-only (`user-read-private`, `user-read-email`, `user-top-read`).

**Reusable spine both tracks plug into:** the preference-weighted component model (`getPreferenceComponentBases` → `scorePreferenceTuning`), the match primitives `getCustomSignalMatchStrength` / `fieldMatchStrength`, the custom-signal store (`listener_discovery_preferences`, `lib/listener-preferences-store.ts`), and the admin observability built in Phase 7 — **Recommendation Insight** (PRD 09) and **Listener Trace** (PRD 10) — which exist precisely to validate scoring changes against real ranking output.

## Definition Of Done (Outcomes 1–8, Synthesized)

1. **A personal home for saved music** — a signed-in listener has a dedicated Saved space with separate, scannable lists of saved **events, venues, and artists**, each openable and un-saveable in one tap.
2. **Saving is first-class and distinct** — "Save" is a deliberate action separate from planning/fire, available on events (board + detail), venues, and artists, reflected immediately in the Saved space.
3. **Encouraged, not required** — saving is a signed-in benefit; anonymous fire/plan/remove triggers a gentle sign-in nudge that **preserves the pending action** so signing in completes it rather than restarting.
4. **Favorites strengthen recommendations** — saved venues and artists feed discovery scoring through the existing preference model, measurably nudging similar shows up the ranking, with the influence visible.
5. **Honest, private, reversible** — the Saved space is private to the person, never a public profile; every save is reversible; no tokens or PII leak in public responses.
6. **Genre beyond a flat tag list** — a curated taxonomy with aliases and parent/child relationships improves matching for everyone, including anonymous users.
7. **Real taste signal for connected listeners** — Spotify artist genres are captured at sync and matched against an event's genre profile, layered on the taxonomy.
8. **Explainable and tunable** — genre matches show short truthful reasons and continue to respect the `genreMatch` weight; no private Spotify values are exposed.

## Outcome → PRD Map

Build order ≠ outcome number; outcomes are re-sequenced into a dependency-sound order.

| Cycle | PRD | Track | Outcome(s) | Theme |
| --- | --- | --- | --- | --- |
| C1 | [PRD 12 — Saved Foundation & Save Actions](prds/prd-12-saved-foundation-and-actions.md) | A | 2, 5 | `saved_items` data model + normalized venue/artist identity; signed-in save/un-save API; save controls across surfaces; private + reversible baseline. |
| C2 | [PRD 13 — The Saved Space & Sign-In Nudges](prds/prd-13-saved-space-and-signin-nudges.md) | A | 1, 3 | The Saved space (three lists) and action-preserving sign-in nudges on fire/plan/remove. |
| C3 | [PRD 14 — Favorites Strengthen Recommendations](prds/prd-14-favorites-strengthen-recommendations.md) | A | 4 | Saved venues/artists feed `venuePreference`/`artistAffinity` bases; visible influence; admin-traceable. |
| C4 | [PRD 15 — Genre Taxonomy & Public Matching](prds/prd-15-genre-taxonomy-and-public-matching.md) | B | 6, 8 | `lib/genre-taxonomy.ts` (canonical + aliases + relationships); richer `scoreGenreMatch`; explainable reasons; respects `genreMatch` weight. |
| C5 | [PRD 16 — Spotify Genre Signal](prds/prd-16-spotify-genre-signal.md) | B | 7 (completes 8) | Capture Spotify artist genres at sync (no new scope); map onto taxonomy; feed connected-listener genre base; private-safe reasons. |

## Delivery Sequence & Dependencies

```
Track A (Saved/Favorites)              Track B (Richer Genre)
─────────────────────────              ──────────────────────
C1 Saved Foundation & Actions          C4 Genre Taxonomy (public)
 ├──> C2 Saved Space + Nudges           └──> C5 Spotify Genre Signal
 └──> C3 Favorites → Recommendations         (maps onto C4 taxonomy)

Tracks A and B are independent and may interleave by priority.
```

- **C1 unblocks Track A.** C2 (reads saved data) and C3 (scores saved data) both depend on C1 and are independent of each other.
- **C4 unblocks Track B.** C5 maps Spotify genres onto the C4 taxonomy and reuses its matching, so C4 ships first.
- **Recommended overall order:** C1 → C4 → C2 → C3 → C5 (ship the two public/foundation wins early — saved actions and smarter public genre matching — then the deeper personalization). Re-orderable by priority; each cycle leaves the product coherent and demoable.

## Shared Architecture & Cross-Cutting Design

Decided once here; inherited by every cycle PRD.

### Saved-items data model (the Track A spine)

Introduce a single polymorphic table (proposed `saved_items`), additive in `db/schema.sql` + `db/migrate-missing-tables.sql`:

- Columns: `id`, `user_id integer references users(id) on delete cascade`, `item_type text check (item_type in ('event','venue','artist'))`, `item_key text`, `label text` (display name snapshot), `event_id text null` (FK-style link when `item_type='event'`), `created_at timestamptz`. Unique on `(user_id, item_type, item_key)`.
- **Identity rule (the key decision):** for events, `item_key` is the stable event id. For venues and artists — which have **no canonical table** — `item_key` is a **normalized name** produced by the same `normalizeText` used in `lib/discovery.ts`, so a saved venue/artist matches event fields consistently downstream. `label` stores the human-readable name at save time.
- **Signed-in only.** Every saved endpoint uses `requireUserId()`. There is no cookie/anonymous saved state (this is deliberate — see Outcome 3 and the nudge). Saved data is private and **never** appears in public/community responses.

### Signed-in API surface

New routes under the existing `app/api/me/*` namespace (e.g. `app/api/me/saved-items/route.ts`): `GET` (list, grouped by type), `POST` (save), `DELETE` (un-save), all `requireUserId()`-gated, server-side, `dynamic = "force-dynamic"`.

### Sign-in nudge (action-preserving)

The nudge composes with the existing anonymous flow rather than replacing it: an anonymous fire/plan/remove still works through `/api/discovery/event-action`, **and** surfaces a gentle "sign in to keep this and tune your recommendations" prompt. The pending action is preserved across the OAuth round-trip (e.g. an `intent` carried through sign-in / stored against the anonymous session) and **replayed once**, so signing in completes the save rather than discarding it. Nudges must be dismissible and never block anonymous participation.

### Favorites → scoring (reuse, don't reinvent)

Saved venues/artists feed the **existing** component bases in `getPreferenceComponentBases`: a saved venue contributes to the `venuePreference` base and a saved artist to `artistAffinity`, reusing `getCustomSignalMatchStrength` / `fieldMatchStrength` for matching and tuned by the **already-shipped** `venuePreference` / `artistAffinity` weights. No new preference control or weight UI is introduced. Favorites are an explicit, durable cousin of the existing ad-hoc custom signals — the discovery engine treats them as first-class positive signals.

### Genre taxonomy module (the Track B spine)

Introduce `lib/genre-taxonomy.ts` as an **in-code source of truth**: canonical genres, alias/synonym maps, and parent/child relationships (e.g. `jazz → funk → soul`). `scoreGenreMatch` consumes it instead of the hardcoded 15-term list, yielding richer, relationship-aware matching and structured reasons. The taxonomy benefits **everyone** (anonymous included) and is the vocabulary Spotify genres (C5) map onto. Like the System Registry, keeping it in code answers "where the source-of-truth lives" and lets it be drift-checked.

### Spotify genre capture (no new scope)

Spotify's `/v1/me/top/artists` already returns `genres[]` per artist under the **current** `user-top-read` scope. C5 extends `SpotifyTopArtistsResponse` / `normalizeArtists` to keep them, adds an additive `genres text[]` column to `music_profile_items`, stores them in `replaceSpotifyProfileItems`, and feeds them — mapped onto the C4 taxonomy — into the connected-listener genre base. **No re-authentication and no new OAuth scopes** (that is Outcome 9, parked).

### Cross-cutting requirements (apply to every cycle)

- **Security at inception (mandatory).** All new first-party code passes a Snyk code scan before "done"; fix and rescan until clean.
- **$0 constraint.** No new paid hosting, database, storage, or API. Stack stays Vercel Hobby + Neon free Postgres. Anything approaching a free tier degrades gracefully and is flagged against the roadmap [Scaling Milestones](master-roadmap.md).
- **Privacy / PII.** Saved data and Spotify genres are private to the person; never exposed in public/community responses, never in OG images, never alongside `session_id`/`user_id`. OAuth tokens never leave the server. No public user profiles.
- **Architecture registration.** Any new table/service/route is registered in `lib/system-registry.ts` with a correct `sourceOfTruth`; `npm run generate:system-map` is re-run and `npm run test:registry` must pass.
- **Admin observability reuse.** Scoring changes (C3, C4, C5) are validated in the **Recommendation Insight** and **Listener Trace** tabs (PRDs 09/10), not by guesswork; new signals should appear in those breakdowns.
- **Anonymous-first preserved.** Browsing, reacting, and contributing never require login. Saving is the only signed-in-gated capability; genre matching improvements are available to everyone.
- **Mobile & accessibility.** Save controls and the Saved space are usable on a phone; nothing is available *only* visually.
- **Graceful degradation.** Loaders tolerate missing tables/optional features (existing try/catch-to-empty pattern); a disconnected/opted-out Spotify connection disables genre taste scoring without breaking the board.

## Cross-Cutting Risks

- **Venue/artist identity drift.** Normalized-name keys can mismatch across spelling variants. Mitigation: reuse the single `normalizeText` used by scoring so saving and matching share one normalization; store a `label` snapshot for display.
- **Double-counting signals.** Favorites feeding the same bases as ad-hoc custom signals could over-boost. Mitigation: cap favorite contributions within the existing component ceilings (e.g. `venuePreference` already `min(36, …)`), and verify in Recommendation Insight.
- **Genre taxonomy maintenance.** A hand-authored taxonomy can rot or over-fit. Mitigation: keep it small, test-covered, and additive; treat unknown tags/genres as pass-through rather than errors.
- **Spotify response variance / limited beta access.** Genres may be absent or sparse for some artists, and `SpotifyLimitedBetaAccessError` already exists. Mitigation: treat genres as optional; degrade to taxonomy-only matching.
- **Privacy exposure.** Saved lists and Spotify genres are listener-adjacent. Mitigation: signed-in-only, server-side, Snyk-scanned, explicit Non-Goals against public profiles, and reason strings that never echo private genre values verbatim.
- **Brownfield regression.** Changes touch the hot discovery path and the Spotify sync. Mitigation: additive, behavior-preserving edits; existing anonymous Best Bets and fire/plan/remove keep working at every step.

## Initiative-Level Success Criteria

- A signed-in listener can save events, venues, and artists, see them in a private Saved space split into three lists, and un-save in one tap.
- An anonymous person who fires/plans/removes gets a non-blocking sign-in nudge that, on completion, preserves and applies their action.
- Saving a venue or artist measurably raises similar upcoming shows in the ranking, visible in the Recommendation Insight and Listener Trace tabs.
- The public board's genre matching reflects a real taxonomy (aliases + relationships), with short truthful reasons on cards, tunable by the existing `genreMatch` weight.
- Spotify-connected listeners get genre-aware Best Match from captured artist genres, with **no new OAuth scope and no re-auth**, and no private genre value is leaked.
- No saved or genre surface exposes tokens or PII; all new code passes Snyk; the whole initiative ships at $0.

## Open Decisions & Assumptions

- **Assumed:** a single polymorphic `saved_items` table (vs. three tables) is the right shape; finalized in C1.
- **Assumed:** normalized-name keys are sufficient identity for saved venues/artists in the absence of canonical entity tables; revisit if/when canonical venue/artist records exist (the Stewardship surface, PRD 08, derives them today).
- **Assumed:** favorites should reuse the existing `venuePreference`/`artistAffinity` weights rather than add new controls; revisit only if users need to tune favorites separately.
- **Assumed:** PRD numbering continues the existing sequence (12–16) and this initiative registers as **Phase 8** in [`master-roadmap.md`](master-roadmap.md); cycle labels C1–C5 are scoped to this initiative (distinct from Phase 7's C1–C6 / PRDs 06–11).
- **Assumed:** Spotify continues to return artist `genres[]` under `user-top-read`; verified at the start of C5 with taxonomy-only fallback if sparse.

## Parked / Future (Outcome 9)

Spotify **save-to-library, follow-artist, and playlist** write actions are intentionally **out of scope** for this initiative and tracked as parked in [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md). They require new OAuth write scopes (`user-library-modify`, `user-follow-modify`, `playlist-modify-public`/`playlist-modify-private`) and **re-authentication of existing connected users**, and will only be planned when the product is ready to write to Spotify. Nothing in C1–C5 requests a new scope.
