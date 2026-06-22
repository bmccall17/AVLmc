# Technical Rigor Report — AVL Music Companion (AVLmc)

**Author:** Brett McCall · **Repo:** `AVLmc` (Next.js App Router · TypeScript · Neon Postgres · Vercel)
**Scope of this report:** the *tooling* and *evaluation/benchmark* layers I built, framed as evidence of system design and technical rigor.
**Date:** June 18, 2026

---

## 1. What the project is (in one paragraph)

AVLmc is a live music–discovery product for Asheville, NC. It ingests a public events feed,
scores shows for each listener (anonymous "Best Bets" plus optional Spotify-backed "Best Match"),
and learns from behavior — saves, skips, social follows, curator picks. The interesting part for a
technical reviewer is not the feature surface; it's that a recommender that *learns* is exactly the
kind of system that silently rots. So I built the project around two questions that are usually
afterthoughts: **"is the architecture still what the docs say it is?"** and **"is the algorithm
actually getting better, or just different?"** The tooling and eval work below exist to answer those
two questions cheaply and repeatably.

---

## 2. System design I'm proud of: a self-describing, drift-proof architecture

The core design decision is a **typed System Registry as the single source of truth for
architecture**, with everything else *generated* from it and *guarded* against drift.

- **`lib/system-registry.ts`** — a hand-authored, typed graph of **83 nodes / 95 edges**: every
  module, route, datastore, and the dependencies between them. This is the canonical model of the
  system.
- **`scripts/generate-system-map.ts`** (`npm run generate:system-map`) — renders the registry to a
  human/agent-readable Markdown map (`docs/product/system-map.generated.md`) and powers a live
  `GET /api/admin/system-map` endpoint. The documentation is *derived*, never hand-maintained.
- **`tests/system-registry.test.ts`** (`npm run test:registry`) — the **drift guard**. It is not a
  unit test of behavior; it's an *invariant test of the model against reality*:
  - every file-backed node points at a file that exists on disk;
  - every datastore node maps to a real `create table` in `db/schema.sql`;
  - every edge references real nodes; node ids are unique;
  - **the checked-in generated Markdown byte-matches what the registry renders today.**

If the architecture diagram and the code disagree, CI fails. This converts "the docs are probably
stale" — the default state of every codebase — into a checkable invariant. That is the design I'm
most proud of, because it's a small amount of infrastructure that makes a whole class of decay
*impossible to merge*.

**On top of that model sits a Plan→Build→Ship workflow** (`docs/product/workflow.md`) operated by
two custom agent skills — `/orchestrator` (reads every status surface, recommends the single next
item respecting dependencies) and `/ship` (updates every status surface, regenerates derived
artifacts, verifies the tree is green). The registry is the "architecture layer of truth"; the
workflow keeps the "status layer of truth" from drifting too.

> **Code samples to read first:** `lib/system-registry.ts`, `scripts/generate-system-map.ts`,
> `tests/system-registry.test.ts`, `docs/product/workflow.md`.

---

## 3. Evaluation & benchmark work (the part that demonstrates rigor)

I treat the recommender as something that must be *measured*, not vibed. Four benchmarks were built,
each shipped behind a PRD, each with a stated methodology and an honest posture.

### Guiding principles I held across all of them

1. **Pure, dependency-free metric cores.** All benchmark math lives in
   **`lib/admin/insight-metrics.ts`** — it deliberately imports *nothing* (no DB, no `server-only`),
   so every metric is unit-testable in isolation. The live code composes these pure functions with
   real scorer output. This is why the eval suite runs in ~45ms with no database.
2. **Descriptive, never a single "quality score."** Every benchmark explicitly refuses to collapse
   into one number — the serializers assert the phrase *"not a single quality score"* — because
   correlation isn't quality and a single KPI invites gaming.
3. **`$0` and privacy-preserving.** No paid eval infrastructure, no longitudinal store, no listener
   identities. "Memory" is a **dated Markdown snapshot committed at ship milestones**, so a reading
   today can be diffed by eye against the reading recorded before a change shipped. The discipline —
   *fixed methodology + recorded at known moments* — is the deliverable, not new infrastructure.
4. **Reproducibility is pinned and stated.** Every reading carries its event window, `SCORER_VERSION`,
   and commit, so a snapshot is attributable to a known state of the scorer.

### 3.1 Discovery Baseline — *the reference reading* (PRD 22)
A fixed-methodology reading of how discovery performs *today*: anonymous ranking shape, behavior mix
(including the **impression non-conversion share** — the soft-negative volume), engagement
concentration, diversity spread, novelty share, local relevance, and signal coverage (derived by
diffing anonymous vs. a **stable committed synthetic profile**, so the comparison moves only when the
*algorithm* changes). Each metric ships with a plain-language definition so a human or an agent reads
the panel identically every time.
*Code:* `lib/admin/insight-metrics.ts` (`computeNonConversionShare`, `computeWindow`,
`computeNoveltyShare`, `computeEngagement`, `serializeBaselineMarkdown`).

### 3.2 Deeper Personalization Benchmark — *is personalization helping?* (PRD 28)
Answers "are real listeners getting meaningfully better rankings than the anonymous baseline — not
just *different* ones?" Reports personalization **lift** and mean/median rank displacement,
**skip-influence** (implicit cooling, explicitly **capped below an explicit `remove`** so the loop
can't bury everything unclicked), ranked **signal attribution** (which component moved a listener's
rank), **coverage**, and a **novelty-floor guardrail** that flags runaway feedback loops. Aggregate
roll-up only, no identities.
*Code:* `lib/admin/insight-metrics.ts` (`computePersonalizationLift`, `computeSkipInfluence`,
`computeSignalAttribution`, `computePersonalizationGuardrails`, `computePersonalizationCoverage`);
tests in `tests/personalization-benchmark.test.ts` (**9 cases, green**).

### 3.3 Social & Curator Guardrails Benchmark (PRD 27)
Keeps social influence **visibly separate from public popularity** (`computeSocialLift` reports
"your people" lift independently of a popularity lift), and flags when a **single source dominates**
(`computeInfluenceConcentration`, threshold 0.6) or when turning social on **regresses novelty**
(`computeFloorHolds`). The same suite includes **leak-audit tests** asserting that public surfaces
never expose follow-graph, pending-application, or seeder-identity data.
*Code:* `tests/social-guardrails.test.ts` (**12 cases, green**).

### 3.4 Cross-Browser Reliability Benchmark — *correctness of the account loop* (PRD 38)
The capstone. It turns "works on my machine" into a re-runnable instrument with three executed parts:
- **Pure no-reset invariant checker** — `lib/account-integrity.ts` `checkAccountIntegrity(snapshot,
  expectation)` enforces *one human = one account, many emails, no duplicate identity, no lost data*
  (exactly one `users` row, all `accounts`/`user_emails` on that id, one primary, globally-unique
  `lower(email)`, no orphaned/re-keyed user-scoped data). Unit-tested, 7 cases.
- **Executed cross-browser harness** — `e2e/auth-recovery.spec.ts` drives the **real** recovery route
  across **Chromium + Firefox** via Playwright, asserting every failure state renders a recoverable
  action (no dead-ends, no "merge anyway" shortcut) — **16 assertions, actually run.** Copy is
  asserted against a single taxonomy source so the test can't drift from the app.
- **Executed real-SQL loop proof** — `tests/account-loop.integration.mts` drives the **real** Auth.js
  adapter + services against a throwaway Neon database through the exact sign-in→link→resolve→collision
  sequence, then runs the snapshot through `checkAccountIntegrity`. **6 steps green**, verified as
  1 user / 2 accounts / 2 emails / 1 primary / no fork — the guarantee *checked in real SQL, not
  mocked*. Skips cleanly when `DATABASE_URL` is unset so the normal suite stays DB-free.

---

## 4. Testing posture overall

- **18 test suites · ~160 test cases**, the largest being the recommender scorer itself
  (`tests/discovery-scoring.test.ts`, 38 cases) which pins exact match semantics, rejection handling,
  and exploration-floor enforcement.
- **Layered isolation:** each feature has its own `tsconfig.*.json` and its own `npm run test:*`
  script, so a suite compiles and runs only what it needs. Pure cores run with `node --test` and zero
  external dependencies; the two integration proofs (`test:e2e`, `test:account-loop`) reach for real
  browsers / real SQL only when those resources are present.
- **Green and cheap:** the entire eval layer runs in tens of milliseconds with no network, no DB, no
  paid service — by design.

---

## 5. Where to look in the repo (suggested reading order for a reviewer)

| Theme | Files |
| --- | --- |
| Drift-proof architecture | `lib/system-registry.ts` · `scripts/generate-system-map.ts` · `tests/system-registry.test.ts` |
| Eval metric cores (pure) | `lib/admin/insight-metrics.ts` |
| Benchmark tests | `tests/personalization-benchmark.test.ts` · `tests/social-guardrails.test.ts` · `tests/insight-metrics.test.ts` |
| Correctness invariants | `lib/account-integrity.ts` · `tests/account-loop.integration.mts` · `e2e/auth-recovery.spec.ts` |
| The recommender under test | `lib/discovery.ts` (1,395 LOC) · `tests/discovery-scoring.test.ts` |
| Methodology write-ups | `docs/product/discovery-benchmark_desiredoutcomes.md` · `docs/product/prds/prd-38-cross-browser-reliability-benchmark.md` · `docs/product/workflow.md` |

---

## 6. One-line summary for the application

> I built a live-music recommender as a **measured system**: a typed architecture registry that
> *fails CI when the docs drift from the code*, a suite of **descriptive, $0, privacy-preserving
> benchmarks** (discovery baseline, personalization lift, social-influence guardrails) with pinned,
> reproducible methodology, and **executed correctness proofs** — a cross-browser Playwright harness
> and a real-SQL account-integrity test — that turn "it works on my machine" into re-runnable
> invariants. ~160 tests, all green, no paid infrastructure.
