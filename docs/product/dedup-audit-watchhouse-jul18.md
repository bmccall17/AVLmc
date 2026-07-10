# Dedup Audit — Watchhouse (Sat Jul 18) triple duplicate

Investigation of why one show renders as three cards. Handoff for the coding agent. No code changed here.

## TL;DR

All three cards are the *same show* pulled from three different upstream listings inside the single AVLgo feed. They never dedupe because the read-path grouping key (`lib/event-dedupe.ts` → `getCanonicalEventBaseKey`) requires the **venue string** and the **title-core** to match, and both diverge across sources. Start time (the thing PRD-06 fixed) is *not* the problem here — grouping fails before time clustering ever runs.

## Ground-truth data (pulled live from prod detail pages)

| | Card A | Card B | Card C |
|---|---|---|---|
| id | `6d8060c8…` | `2382fc27…` | `85742a21…` |
| source | `AVLgo live feed: ORANGE_PEEL` | `AVLgo live feed: MOUNTAIN_X` | `AVLgo live feed: EXPLORE_ASHEVILLE` |
| original listing | theorangepeel.net | mountainx.com | exploreasheville.com |
| venue string | `The Orange Peel` | `Hellbender` | `Hellbender` |
| title | `Watchhouse` | `Watchhouse w/Fruit Bats` | `Watchhouse with special guests Fruit Bats and Two Runner` |
| date | 2026-07-18 | 2026-07-18 | 2026-07-18 |
| time | 6:00 PM | 7:00 PM | 6:00 PM |

Note the Orange Peel listing URL is `.../watchhouse-3/hellbender-by-the-orange-peel/...` — the real venue is **"Hellbender by The Orange Peel"**. Two feeds abbreviate it to "Hellbender", one to "The Orange Peel". It is one room, one show.

## Why the three sources exist

There is only one ingestion feed — the AVLgo JSON export (`lib/events.ts`, `AVLGO_EXPORT_URL`). AVLgo aggregates multiple upstream listings and stamps each with a `source` label (`ORANGE_PEEL`, `MOUNTAIN_X`, `EXPLORE_ASHEVILLE`, …). `normalizeEvent` prefixes it as `AVLgo live feed: <SOURCE>`. Each upstream listing carries its own UUID, so the DB upsert (`on conflict (id)`) never collides — dedup is expected to happen entirely on the read path via `getCanonicalEvents`.

## Root cause — verified by running the actual normalizers

Grouping key = `eventDate | normalizeVenueKey(venue) | normalizeTitleCore(title)`. Ran the real functions from `lib/event-dedupe.ts` against the three rows:

| source | venueKey | titleCore | baseKey |
|---|---|---|---|
| ORANGE_PEEL | `orange peel` | `watchhouse` | `2026-07-18\|orange peel\|watchhouse` |
| MOUNTAIN_X | `hellbender` | `watchhouse w fruit bat` | `2026-07-18\|hellbender\|watchhouse w fruit bat` |
| EXPLORE_ASHEVILLE | `hellbender` | `watchhouse with special guest fruit bat and two runner` | `2026-07-18\|hellbender\|watchhouse with special guest fruit bat and two runner` |

**Three distinct base keys → three separate groups → zero dedup.** There are two *independent* breakers, and both must be fixed to collapse all three:

1. **Venue divergence.** `The Orange Peel` vs `Hellbender` are different strings, so `normalizeVenueKey` yields different keys. There is no venue alias/canonicalization layer. This alone splits A from {B, C}.

2. **Title-core swallows the support acts.** `normalizeTitleCore` only strips leading articles and trailing generic suffixes (`band/show/event/concert`) and a trailing `live music`. It does **not** strip opener/support phrasing — `w/Fruit Bats`, `with special guests Fruit Bats and Two Runner`. So the headliner "watchhouse" ends up embedded in three different cores. This alone splits B from C (and both from A).

Because the two breakers stack, fixing only one still leaves two cards. Time clustering (6:00 / 7:00 / 6:00 PM — all inside the 90-min `FUZZY_START_WINDOW_MINUTES`) would happily merge these *if* they shared a base key. They don't, so it never engages.

## Generalization

This is not Watchhouse-specific. Any show escapes dedup when sources disagree on the venue label (room name vs building name vs promoter) or when one or more feeds append the lineup to the title (`w/`, `with special guests`, `feat.`, `featuring`, `+ support`, `and <opener>`). The Watchhouse trio just happens to trip both at once.

## Suggested directions for the coding agent (not prescriptive)

All read-path / pure-function work in `lib/event-dedupe.ts`, consistent with PRD-06's "no schema change" stance.

- **Venue canonicalization.** Introduce a venue alias map / normalizer so `Hellbender`, `Hellbender by The Orange Peel`, and `The Orange Peel` collapse to one canonical venue key. Consider subset/containment matching (one venue string contained in another) plus a curated alias table for the AVL rooms. Risk: over-merging genuinely distinct venues that share a word — keep the alias table explicit.

- **Headliner extraction in `normalizeTitleCore`.** Before building the title-core, split on support markers (`w/`, `w /`, `with special guest(s)`, `feat.`, `featuring`, `presents`, `+`, ` and `) and key on the headliner segment. Risk: co-bills where the second act is not an opener (e.g. `Band A & Band B` co-headline) — decide whether to key on the first segment only or keep both; add regression fixtures either way.

- **Sequencing.** Fix both together; fixing one still leaves a visible duplicate for this case.

- **Lock it in.** Add a Watchhouse regression fixture to `tests/event-dedupe.test.ts` built from the three real rows above (mirroring how PRD-06 added the Spoon fixture) asserting one canonical + a two-entry audit group. The winner should be EXPLORE_ASHEVILLE or MOUNTAIN_X per `scoreSource` (both score 6/5 vs ORANGE_PEEL's generic 1), so double-check the expected canonical against `compareScoredEvents` rather than assuming.

- **Audit visibility.** Once grouping is fixed, these appear in `buildEventDuplicateAudit` / the admin Gaps tab automatically — no separate change needed.
