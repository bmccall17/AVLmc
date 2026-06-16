# PRD 15: Genre Taxonomy & Public Matching

Part of the [Saved/Favorites & Genre Initiative](../saved-favorites-genre-prd.md). Cycle **C4** (Track B). Satisfies desired outcomes **6 (Genre understanding beyond a flat tag list)** and **8 (Explainable and tunable)**.

## Summary

Replace the shallow, hardcoded genre check with a real **genre taxonomy** — canonical genres, aliases/synonyms, and parent/child relationships — that makes the board's genre matching smarter for **everyone, including anonymous users**. `scoreGenreMatch` consumes the taxonomy instead of a 15-term string list, producing relationship-aware matches and short, truthful reasons, while continuing to respect the existing `genreMatch` weight. This is the public, foundation cycle of Track B and the vocabulary that Spotify genres (C5) will map onto.

## Implementation Status

**Shipped.** Delivered:

- **Taxonomy module** — `lib/genre-taxonomy.ts` (pure, client-safe, dependency-free): 20 canonical genres sized to Asheville's scene, an alias/synonym map (e.g. `rnb`/`r&b` → soul, `singer-songwriter` → folk, `edm`/`house`/`dj` → electronic, `hip hop` → hiphop), and a symmetric parent/child adjacency table (`funk↔soul` 0.8, `rock↔indie` 0.7, etc.). Exports `resolveGenres`, `genreRelationStrength`, `bestRelationStrength`, `GENRE_LABELS`, and `isGenericGenreTerm` (the single generic-term guard discovery now delegates to). Whole-token matching avoids false positives (`rockwell` ≠ rock); unknown terms pass through as neutral.
- **Richer matching** — `scoreGenreMatch` (`lib/discovery.ts`) now resolves an event's title/artist/tags into canonical genres via the taxonomy and returns `{ score, genres }`, preserving the calibrated `min(24, …)` output ceiling so downstream `genreMatch` weighting stays unchanged. Catches alias-tagged events the old flat 15-term list missed.
- **Explainable reasons** — `getGenreReasons` emits a compact, truthful reason naming up to two matched canonical genres (e.g. `genre match: jazz / soul`), public data only. Ordered after personalized reasons so it surfaces for everyone (esp. anonymous) but yields the 3-reason budget to stronger signals when tight.
- **Quick-filter alignment** — board genre filters (Dance, Rock) route through `resolveGenres` so alias-tagged events match their canonical filter (`components/EventBoard.tsx`).
- **Tunable** — still consumes the existing `genreMatch` weight; no new control. Set it to 0 → genre stops influencing rank.
- **Validation** — `test:taxonomy` (alias resolution, relationship strength, generic filtering, pass-through) and the existing `test:discovery` suite both green. Registered `svc-genre-taxonomy` + edge in `lib/system-registry.ts`; system map regenerated; `npm run test:registry` passes. New code Snyk-clean; $0.

## Goals

- Introduce `lib/genre-taxonomy.ts` as an in-code source of truth: canonical genres, alias maps, and parent/child relationships (e.g. `jazz → funk → soul`).
- Rewrite `scoreGenreMatch` to resolve event tags/title text into canonical genres via the taxonomy and score relationship-aware matches, improving relevance for anonymous and signed-in users alike.
- Emit explainable, compact genre reasons on event cards (e.g. `genre match: jazz / soul`).
- Continue to honor the existing `genreMatch` preference weight; no new control.
- Keep matching robust: unknown tags pass through gracefully; generic terms stay filtered.

## Non-Goals

- No Spotify genre capture or connected-listener taste — that is C5.
- No new preference control or weight (reuse `genreMatch`).
- No user-facing taxonomy editor; the taxonomy is curated in code this cycle.
- No change to how tags are ingested from AVLgo (`lib/events.ts` `getTags`) — this cycle interprets existing tags, it does not re-source them.
- No exposure of private values (none are involved at this layer).

## Requirements

### Genre taxonomy module (`lib/genre-taxonomy.ts`)

- Define a curated, test-covered taxonomy:
  - **Canonical genres** (a focused set sized to Asheville's actual scene — americana, bluegrass, country, folk, funk, soul, jazz, blues, rock, indie, punk, metal, hip hop, electronic/DJ, dance, world/latin, etc.).
  - **Aliases/synonyms** mapping raw tag/word variants to canonicals (e.g. `r&b`/`rnb` → `soul/r&b`, `singer-songwriter` → `folk`, `edm`/`house`/`techno` → `electronic`).
  - **Relationships** (parent/child or adjacency) so a near-genre match scores partially (e.g. funk↔soul↔r&b).
- Export helpers: `resolveGenres(text | tags) → canonical genres`, `genreRelationStrength(a, b) → 0..1`, and a guard list of generic terms (consolidating the existing `isGenericTerm` notion so genre and generic-term logic share one source).

### Richer matching (`lib/discovery.ts`)

- Rewrite `scoreGenreMatch(event)` to: resolve the event's tags + title text into canonical genres via the taxonomy, then score exact and related-genre matches (related matches score partially via `genreRelationStrength`), preserving the current output range/ceiling so downstream weighting stays calibrated.
- Keep the output as the `genreMatch` base in `getPreferenceComponentBases`, so `scorePreferenceTuning` applies the existing `genreMatch` weight unchanged.
- Treat unrecognized tags as neutral pass-through (no errors), and keep generic terms filtered.

### Explainable reasons (`lib/discovery.ts`)

- Produce a compact genre reason naming the matched canonical genre(s) (e.g. `genre match: jazz / soul`), consistent with existing reason formatting. Reasons reflect public event data only.

### Quick-filter alignment (optional, `components/EventBoard.tsx`)

- Where the board offers genre quick filters (Dance, Jazz, Rock, etc.), route them through the taxonomy so an alias-tagged event still matches its canonical filter. Keep the existing broad search box behavior.

### Architecture & validation

- Register `lib/genre-taxonomy.ts` in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` passes.
- Unit-test the taxonomy (alias resolution, relationship strength, generic filtering) and the new `scoreGenreMatch` behavior.
- Validate ranking impact in the Admin **Recommendation Insight** tab (the `genreMatch` component should reflect richer, explainable values).

## Dependencies

- `lib/discovery.ts`: `scoreGenreMatch`, `getEventHaystack`, `normalizeText`, `isGenericTerm`, `getPreferenceComponentBases`, reason formatting.
- `lib/listener-preferences.ts`: existing `genreMatch` control/weight.
- `lib/events.ts` tag shape (`EventRecord.tags`) as matching input.
- Admin PRD 09 (Insight) for validation.

## Risks

- **Taxonomy over-fitting / maintenance burden** — mitigated by keeping it focused on the local scene, test-covered, and additive; unknown terms pass through.
- **Score recalibration** — broadening matches could inflate `genreMatch`; mitigated by preserving the existing output ceiling and validating in Insight before/after.
- **Alias false positives** — mitigated by conservative alias maps and unit tests for ambiguous terms.
- **Filter mismatch** — if quick filters are re-routed through the taxonomy, verify no previously-matching event drops out.

## Acceptance Criteria

- `lib/genre-taxonomy.ts` exists with canonical genres, aliases, and relationships, and is unit-tested.
- `scoreGenreMatch` resolves tags/title via the taxonomy, scores exact and related matches, and keeps its calibrated output range.
- The `genreMatch` weight still tunes genre influence; no new control was added.
- Event cards show compact, truthful genre reasons for everyone (anonymous included).
- Registered in the System Registry; `npm run test:registry` passes; new code passes Snyk; $0.

## Test Scenarios

- An event tagged "rnb" resolves to the soul/r&b canonical and shows the right reason; a "singer-songwriter" event resolves to folk.
- A funk event scores a partial match against a soul-leaning listener context via relationship strength.
- Generic-only tags ("live music", "concert") produce no spurious genre score.
- Set `genreMatch` weight to 0 → genre stops influencing rank; restore → returns.
- An unknown/novelty tag does not break scoring (neutral pass-through).
- Recommendation Insight shows richer `genreMatch` component values with reasons after the change.
