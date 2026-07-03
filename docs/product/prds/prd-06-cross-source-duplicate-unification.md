# PRD 06: Cross-Source Duplicate Event Unification

## Implementation Status

**Shipped (July 3, 2026).** Delivered:

- `lib/event-dedupe.ts` — fuzzy time bucketing: the exact-minute group key (`eventDate | localStartMinute | venue | title-core`) is replaced by a base key without the minute, then chain-clustering within each (date, venue, title-core) group. A timed event joins the current cluster only while it stays within `FUZZY_START_WINDOW_MINUTES` (exported constant, default **90**) of the cluster's *earliest* member, so doors-vs-showtime pairs merge but a 7:00 / 8:15 / 9:30 run never collapses into one. TBA events join the group's timed cluster only when exactly one exists; otherwise they stay together as their own cluster. Winner selection (`scoreEventQuality` / `compareScoredEvents`) is unchanged, the canonical keeps its own start time, and clustering is deterministic (timed candidates sorted by minute then id before chaining). Fuzzy-merged groups carry the audit reason `merged: start times within 90 minutes across sources`.
- `tests/event-dedupe.test.ts` — new Spoon regression built from the real prod pair (`5912f31d…` @ 8:00 PM ORANGE_PEEL vs `ac22d18f…` @ 7:00 PM EXPLORE_ASHEVILLE → one canonical + audit entry with the merged reason), plus two-sets-per-night (> window stays separate), distinct early/late titles never merge, no chain collapse, and TBA handling (timed+tba merge; tba-only pairs still merge). Two existing fixtures whose "different time" gaps fell inside the new window were widened per the PRD: the `rod-2030` 60-minute gap (the test flagged at line 163) and the Thunder Thursday `mx-thunder-2130` 60-minute gap (same issue, not called out in the PRD) — both now use > 90-minute gaps; different-dates behavior unchanged. 11/11 pass.
- `lib/system-registry.ts` — `svc-event-dedupe` description + implementation note now document the fuzzy window; system map regenerated.
- Verified against the live prod rows: the real Spoon pair collapses to one canonical card (the ORANGE_PEEL listing wins on image score — the Explore Asheville image URL contains `/sites/default/`, which the existing scorer already treats as a placeholder; scoring logic untouched per the PRD).

Open per the PRD's later-phase note: DB cleanup of hidden loser rows; 90-minute default tunable via the constant.

## Goal Statement

**Done looks like this:** When two or more source feeds list what a reasonable concert-goer would call *the same show* — same date, same venue, same artist/title, start times within a fuzzy window (default 90 minutes) — the app displays exactly one canonical event card, everywhere events are rendered (board, detail routes, counts, admin audit). The Spoon case (`5912f31d…` @ 8:00 PM from ORANGE_PEEL vs `ac22d18f…` @ 7:00 PM from EXPLORE_ASHEVILLE, both Jul 5, 2026 at The Orange Peel) resolves to a single card, while legitimate same-day repeats — an early and late set 3+ hours apart, or distinctly titled shows ("Early Show" / "Late Show") — remain separate. All existing `test:event-dedupe` tests pass (with the one intentionally revised expectation documented below), and a new regression test built from the real Spoon fixture locks the behavior in.

## Summary

The dedupe pipeline (`lib/event-dedupe.ts`) already collapses exact duplicates, but its identity key includes the start minute:

```
eventDate | localStartMinute | normalizedVenue | normalizedTitleCore
```

Different feeds report different start times for the same show (doors vs. showtime is the classic case), so cross-source copies land in different groups and both render. Because `buildEventDuplicateAudit` uses the same key, these pairs are also invisible in the admin Gaps tab.

## Root-Cause Reference: The Spoon Case (Jul 2026)

| | Event A | Event B |
|---|---|---|
| id | `5912f31d-84b4-46b0-b8ed-ac536a5905e9` | `ac22d18f-a1ca-4f35-bf21-bdb1daeb84b6` |
| Source | `AVLgo live feed: ORANGE_PEEL` | `AVLgo live feed: EXPLORE_ASHEVILLE` |
| Date / Time | 2026-07-05, 8:00 PM | 2026-07-05, 7:00 PM |
| Group key | `2026-07-05\|20:00\|orange peel\|spoon` | `2026-07-05\|19:00\|orange peel\|spoon` |

One hour apart → different keys → both canonical. AVLgo assigns each source listing its own UUID, so the DB upsert (`on conflict (id)`) never collides either.

## Approach: Fuzzy Time Bucketing

Replace exact-minute matching within a (date, venue, title-core) cluster with proximity clustering:

1. Group candidates by `eventDate | normalizedVenue | normalizedTitleCore` (drop the minute from the map key).
2. Within each group, sort by resolved local start time and chain-cluster: an event joins the current cluster if its start is within `FUZZY_START_WINDOW_MINUTES` (default **90**) of the cluster's anchor (recommend anchoring on the earliest member, not the previous member, to prevent unbounded chaining: 7:00 + 8:00 + 9:00 must not merge into one).
3. Events with no resolvable time (`tba`) join the group's single timed cluster if exactly one exists; otherwise they remain their own cluster (conservative — don't guess).
4. Each cluster elects a canonical winner using the existing quality scoring (`compareScoredEvents`) unchanged.
5. `buildEventDuplicateAudit` must reflect the new clustering so fuzzy-merged pairs appear in the admin audit with a winner reason like `"merged: start times within 90 minutes across sources"`.

## Requirements

- Add `FUZZY_START_WINDOW_MINUTES` as an exported constant (single tuning point).
- Pure-function change only: all logic stays in `lib/event-dedupe.ts`; no schema changes, no new dependencies, no changes to `upsertEvents`.
- Winner selection logic (`scoreEventQuality`, `compareScoredEvents`) is unchanged.
- Deterministic output regardless of input order (existing id tiebreaker preserved).
- The canonical event keeps its own start time (no time averaging or mutation).

## Non-Goals

- No merging across different venues or different dates.
- No artist-level fuzzy matching beyond the existing title normalization.
- No DB-side dedupe, migrations, or retroactive cleanup of stored rows (read-path dedupe already hides losers; cleanup can be a later phase).
- No UI changes beyond what falls out of fewer duplicate cards.

## Acceptance Criteria

1. **Spoon regression test:** a new test fixture mirroring the real pair above (two sources, 7:00/8:00 PM, same venue/date/title) yields one canonical event, and the pair appears in `buildEventDuplicateAudit` output.
2. **Two-sets-per-night preserved:** same artist, same venue, same date at 7:00 PM and 10:30 PM (> window) stay separate.
3. **Distinct titles stay separate:** "Spoon — Early Show" vs "Spoon — Late Show" never merge, regardless of time gap (title-core differs).
4. **No chain collapse:** three events at 7:00, 8:15, and 9:30 do not all merge into one cluster.
5. **TBA handling:** a timed listing plus a `tba` copy of the same show merge; two `tba`-only listings with the same key still merge (current behavior preserved).
6. **Existing suite:** `npm run test:event-dedupe` passes. The test at `tests/event-dedupe.test.ts:163` ("keeps same artist events on different dates or different times separate") must be revised so its different-times fixture uses a gap larger than the fuzzy window — different *dates* behavior is unchanged.
7. **Typecheck/lint clean:** `npm run typecheck` and `npm run lint` pass.

## Files in Scope

- `lib/event-dedupe.ts` — clustering change.
- `tests/event-dedupe.test.ts` — revised fixture + new cases above.
- `lib/system-registry.ts` (~line 318) — update the `svc-event-dedupe` description to mention fuzzy time bucketing.

## Open Questions

- Is 90 minutes the right default? Doors-vs-show gaps are usually 60–90 min; festival slots may differ. Constant makes it cheap to tune.
- Later phase: DB cleanup job to delete/merge hidden loser rows and re-point any saved-item references.
