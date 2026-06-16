---
name: ship
description: Record a finished sprint on AVL Music Companion and keep all docs in sync. Use when the user says a sprint/PRD/cycle/backlog item is done, "ship it", "mark shipped", or "update the docs". Auto-detects what changed, updates every status surface (roadmap, PRD Implementation Status, backlogs, dates), regenerates the system map, verifies the tree is green, and stages a commit on main.
---

# Ship — record a sprint and sync every status surface

Closes the loop opened by `/orchestrator`. The contract is `docs/product/workflow.md`
(read it and the **Status-Surface Map** first). Optional argument names the unit
(`prd-09`, `C4`, a backlog item); with no argument, auto-detect.

**Hard rule: work `main` only. Never create a branch unless the user explicitly asks.
Commit, do not push.**

## 1. Determine scope (auto-detect, then confirm)

Inspect what changed:

```sh
git status --short
git log --oneline -15
git diff --stat HEAD
```

Map changed paths → units via the Status-Surface Map:

- `lib/admin/*`, `components/admin/*`, `app/api/admin/*` → an Admin cycle (C1–C6) / PRDs 06–11.
- `lib/discovery*`, `lib/discovery-memory.ts`, `components/EventBoard.tsx` → PRD 09 / `personalized-discovery-backlog.md`.
- `lib/system-registry.ts` (or any renamed/added backing file or table) → architecture regen.
- doc-only changes → backlog / roadmap entries.

State the inferred scope (which PRDs / cycles / backlog items this sprint touched) and
let the user correct it **before** writing anything.

## 2. Update every applicable status surface

Match the existing prose style in each file — read a sibling for the pattern first.

- **The PRD(s)** (`docs/product/prds/prd-XX-*.md`): set `## Implementation Status` to
  `**Shipped.** Delivered:` followed by a bullet list of what landed (file paths,
  tables, routes), in the style of `prd-11-product-analytics-umami.md`.
- **`master-roadmap.md`**: flip the row Status in the Phase table and/or the Admin cycle
  table; add or update the `**Cx shipped:** …` prose paragraph; if a Scaling Milestone
  threshold was crossed, update its row.
- **`admin-portal-prd.md`**: update the cycle map status if it's an admin cycle.
- **`backlog.md` / `personalized-discovery-backlog.md`**: move completed items to **Done**
  with the date and a short resolution note; **un-park** any item whose trigger has now
  fired.
- **Date stamps**: bump `Updated: <date>` on every touched doc to the real current date.

## 3. Architecture sync

If a backing file or table was added/renamed, confirm the node's `sourceOfTruth` in
`lib/system-registry.ts` is correct (flag it if stale), then regenerate:

```sh
npm run generate:system-map
```

## 4. Verify green (do not mark shipped on red)

```sh
npm run typecheck
npm run test:registry
```

Plus what the change touched: `npm run test:discovery` (discovery scoring),
`npm run test:event-dedupe` (event ingestion). If first-party code shipped this sprint
in a Snyk-supported language, run the Snyk code scan (`mcp__Snyk__snyk_code_scan`) per
the security-at-inception rule and surface results. Report any failure honestly and stop
before committing if the tree isn't green.

## 5. Snapshots reminder (manual)

If `app/admin` or `components/admin` changed, print a reminder that the dated screenshots
in `docs/product/snapshots/` should be refreshed manually — this is not automated.

## 6. Stage the commit (on `main`, no branch, no push)

Show a diff summary and a proposed commit message (concise subject + a short body listing
the synced surfaces). Get confirmation, then commit on the current `main` branch. The
commit message must end with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Do not push unless the user asks.
