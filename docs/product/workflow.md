# Product Workflow — Plan → Build → Ship

Updated: June 15, 2026

This is the contract that keeps the project's documentation, backlogs, PRDs, and the
Admin Portal in sync as work happens. Two skills operate the loop:

- **`/orchestrator`** — at the *start* of planning or building. Read-only. Surveys
  every status surface below, recommends the single next thing to work on (respecting
  dependencies), and grounds the agent in the right PRD + `lib/` files + system map
  before any deep work begins.
- **`/ship`** — at the *end* of a sprint. Auto-detects what changed, updates every
  status surface consistently, regenerates derived artifacts, verifies the tree is
  green, and stages a commit on `main`.

Run `/orchestrator` to decide what's next → build it → run `/ship` to record it. Repeat.

## Two layers of truth

1. **Architecture layer (already drift-proof).** `lib/system-registry.ts` is the typed
   source of truth. `docs/product/system-map.generated.md` and `GET /api/admin/system-map`
   are generated from it (`npm run generate:system-map`); `npm run test:registry` guards
   against drift. **Start architecture questions here**, not by re-reading code.
2. **Status / progress layer (kept in sync by hand → now by `/ship`).** Spread across the
   surfaces in the map below. This is what used to drift.

## Status-Surface Map

For each unit of work, status lives in these places. `/ship` updates all that apply;
`/orchestrator` reads all of them.

| Unit | Surfaces to keep in sync |
| --- | --- |
| A PRD (`prd-XX`) | the PRD's `## Implementation Status`; the matching row in `master-roadmap.md` (Phase table and/or Admin cycle table); the per-cycle `**Cx shipped:** …` prose paragraph in the roadmap; `admin-portal-prd.md` cycle map (if it's an admin cycle) |
| An Admin cycle (C1–C6) | same as its PRD (PRDs 06–11), plus `admin-portal-prd.md` |
| A backlog item | `backlog.md` or `personalized-discovery-backlog.md` — move Urgent/Parked → Done with date; un-park items whose trigger has fired (cross-check the roadmap **Scaling Milestones** table) |
| Architecture change (backing file/table added or renamed) | update the node's `sourceOfTruth` in `lib/system-registry.ts`, then `npm run generate:system-map` (regenerates `system-map.generated.md`); `npm run test:registry` must pass |
| Admin UI change (`app/admin`, `components/admin`) | manually refresh dated screenshots in `docs/product/snapshots/` (reminder only — not automated) |
| Any of the above | bump the `Updated: <date>` stamp on every touched doc |

## Status vocabulary

- **PRD `## Implementation Status`**: `Shipped.` (with a `Delivered:` bullet list) is the
  done state. Anything else (Documented / Planned / Deferred) is open.
- **Roadmap rows**: `Built` / `Shipped` are done; `Documented` / `Planned` / `Deferred` are open.
- **Backlog sections**: `Urgent` → `Parked` → `Done`. Parked items name the trigger that
  un-parks them (e.g. "Parked while WAU < 10").

## Conventions

- **Git: `main` only.** Do not create a branch unless explicitly asked. `/ship` commits
  to `main` and does not push.
- **$0 posture & security-at-inception.** Keep cost at $0; if code shipped in a
  Snyk-supported language, run the Snyk code scan before marking shipped.
- **Dates** use the real current date when a skill runs.
