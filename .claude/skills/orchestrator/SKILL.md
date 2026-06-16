---
name: orchestrator
description: Decide what to work on next on AVL Music Companion. Use at the start of planning or building — when the user asks "what's next", "where do I start", "plan the next sprint", or wants a grounded starting point. Surveys the roadmap, PRDs, and backlogs, recommends one next item respecting dependencies, then grounds the agent in the right docs and code before deep work.
---

# Orchestrator — what's next, and where to start

Read-only survey of the project's status surfaces. Produces a single recommended next
unit of work and a grounded starting point. **Do not edit anything in this skill** —
recommend and confirm, then hand off to normal planning/build (which may use plan mode).

The full contract is `docs/product/workflow.md` (read it first). `/ship` is the
counterpart that records work when a sprint finishes.

## 1. Survey (read-only)

Read every status surface:

- `docs/product/master-roadmap.md` — Phase table, Admin cycle table (C1–C6), and the
  **Scaling Milestones** table (these own the un-park triggers).
- `docs/product/admin-portal-prd.md` — the epic's cycle map and the
  **"Delivery Sequence & Dependencies"** section (this is the dependency order).
- `docs/product/prds/prd-*.md` — each file's `## Implementation Status`.
- `docs/product/backlog.md` and `docs/product/personalized-discovery-backlog.md` —
  Urgent / Parked / Done.

Also check momentum and work-in-flight:

```sh
git log --oneline -15
git status --short
```

For architecture/source-of-truth questions, read `docs/product/system-map.generated.md`
(generated from `lib/system-registry.ts`) — do not re-derive wiring from code.

## 2. Build the candidate list (open work only)

- PRDs whose `## Implementation Status` is **not** `Shipped.` (Documented / Planned / Deferred).
- Roadmap rows not `Built` / `Shipped`.
- `backlog.md` **Urgent** items.
- **Parked** items whose un-park trigger has fired — cross-check the trigger text
  (e.g. "Parked while WAU < 10") against the roadmap Scaling Milestones table. Only
  surface a parked item if its condition is actually met.
- Open follow-ups in `personalized-discovery-backlog.md`.

If nothing is open, say so plainly and report what remains (parked-and-not-yet-triggered,
deferred) so the user knows the active queue is empty.

## 3. Rank

Order by, highest first:

1. **Urgent** backlog items.
2. **Dependency-unblocked PRDs**, following the order in `admin-portal-prd.md`
   "Delivery Sequence & Dependencies" and the roadmap. Never recommend a PRD whose
   dependencies aren't shipped.
3. **Parked** items whose trigger has fired.
4. **Deferred** items (only if nothing above is open).

## 4. Recommend ONE, with a grounded starting point

Present the top candidate and a short rationale: why now, what it depends on / unblocks.
Then give the **starting point** so build can begin without rediscovery:

- The exact PRD file and the section to read.
- The owning `lib/` and `components/` files, and the relevant **System Registry node**
  in `lib/system-registry.ts`.
- A pointer to read `docs/product/system-map.generated.md` for how it's wired.
- Any cross-cutting rules (e.g. $0 posture, privacy, security-at-inception / Snyk).

List the next 1–2 runner-up candidates in one line each, then stop.

## 5. Confirm, then hand off

Use AskUserQuestion to confirm the recommendation before deep work. On confirm,
proceed to plan the chosen item (enter plan mode for non-trivial work). Do not start
editing files as part of this skill.
