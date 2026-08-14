# Slice-Flow Adoption — Audit & Recommendation

**Author:** Claude (for Brett) · **Date:** 2026-07-13
**Inputs:** `docs/slice.zip` (Tommy Morgan's slice-flow: 9 commands + 2 skills), `docs/TECHNICAL-RIGOR-REPORT.md`, current AVLmc repo state.

---

## TL;DR

`slice.zip` is **not a drop-in**. It's the *leaf* of Tommy Morgan's skill tree, and every command declares **"jj-only. No git fallback."** Its delivery model (jujutsu + stacked bookmarks → PRs) conflicts with how AVLmc runs today (git, `main`-only, direct commit). But AVLmc already independently reinvented ~70% of slice-flow's *intent* (drift-proof registry, Plan→Build→Ship, per-feature test isolation, ADRs, PRDs).

**Recommendation: adopt slice-flow as a git-native methodology layer on top of your existing `/orchestrator` + `/ship` — don't install Tommy's stack.** Take the four transferable ideas, drop the rest, prove it on one real PRD before converting anything else.

---

## The recommendation, precisely

**Adopt (the four transferable ideas):**
1. **Vertical-slice fences** — Tracer bullet / Touches / Off-limits per slice.
2. **Living `.feature` specs** — behavioral Gherkin in `features/*.feature`, CI-checkable against code.
3. **Per-scenario TDD + the mutation check** — "revert the exact behavior the `Then` names → the test must go red before commit."
4. **PRD-coverage ledger + fidelity audit** — makes "is the PRD *actually* satisfied?" a deterministic query; catches mistranslations (PRD says "disabled," build did "hidden").

**Drop:** jj, stacked PRs (`/slice-pr`, `/slice-stack`, autoship), `/demo-record`, fig2json design refs, Linear backend.

**Reuse:** your existing `/code-review` (in place of `/tommy-review`) and `/ship` (for delivery). Keep committing to `main`.

---

## Why this — and not the alternatives

### Why not adopt slice.zip as-is (jj + stacked PRs)
Every command is "jj-only, no git fallback," and the delivery half assumes stacked bookmarks → PRs. Adopting it means:
- installing and learning **jj**,
- porting the entire **missing upstream tree** — `tdd-execution`, `grill-with-docs`, `/tommy-review`, `root-cause-analyzer`, `plan-format` v1, `~/.claude/prompts/review/checklist.md`,
- **reversing your own main-only / never-branch rule.**

That's weeks of tooling work whose payoff — *parallel review of a big feature by many reviewers* — is the one benefit that doesn't apply to a **solo dev committing to main**. You'd pay the full tax for a benefit you can't use.

### Why not just keep `/orchestrator` + `/ship` unchanged
Because slice-flow has four ideas your current workflow genuinely lacks, and they're the ones that matter:

- **Vertical-slice fences** — keep an AI agent inside human-set boundaries and work in ~200-line reviewable chunks. Your PRDs say *what*; slices say *how far this increment reaches and what it must not touch*.
- **Living `.feature` specs** — CI-checkable proof the spec still matches the code. Your `system-registry` does this for *architecture*; nothing does it for *behavior*.
- **Mutation check** — your 160 tests have no mechanical guard against toothless/tautological tests. Cheap to add, high value.
- **PRD-coverage ledger** — your PRD `## Implementation Status` sections are prose you *trust*; the ledger is a checklist you *verify*.

The git-native port keeps 100% of what already works (registry, `/ship`, main-only, per-feature test isolation — a near-perfect substrate for per-scenario TDD) and adds only these four.

---

## Tradeoffs — honestly

| You gain | You give up / the cost |
|---|---|
| Reviewable increments with hard boundaries (Tracer/Touches/Off-limits) | Slower per feature — planning is a real up-front step now |
| Behavioral specs that can't silently drift (living `.feature`) | A second artifact to maintain per feature (`features/*.feature`) |
| Mechanical anti-toothless-test guard (mutation check) | Every scenario costs an extra red→revert→red cycle |
| Deterministic "is the PRD satisfied?" + mistranslation catch (ledger) | The ledger + fidelity audit is genuine bookkeeping overhead |
| Zero new tooling, main-only preserved, `/ship` reused | **Lower fidelity to Tommy's tooling** — no `/slice-pr`, no `/tommy-review`; you maintain your own ported skills |
| Solo-dev-proportional | If AVLmc becomes a team, you'd revisit jj + stacked PRs |

**The one real risk:** you're **forking Tommy's skills**, so you own the port — future upstream improvements won't flow in automatically. Acceptable price for not carrying jj + a PR model you don't use.

---

## Dependency audit — what slice-flow needs vs. what AVLmc has

| Slice-flow requires | Status in AVLmc | Verdict |
|---|---|---|
| **jj (Jujutsu)** — "jj-only, no git fallback" | git only; jj not installed; GitHub remote | 🔴 Hard conflict |
| **PR / stacked-bookmark delivery** | `main`-only, never branch; direct commit | 🔴 Philosophical conflict |
| `tommymorgan:tdd-execution` (build-engine forks it) | absent | 🟠 Port or replace |
| `tommymorgan:grill-with-docs` (drives `/slice-plan`) | absent — `/orchestrator` overlaps | 🟠 Port the idea |
| `tommymorgan:plan-format` v1 (slice-plan-format is v2 fork) | absent | 🟠 v2 ships in zip |
| `/tommy-review` (build fix-loop hinges on it) | absent — **you have `/code-review`** | 🟢 Rewire |
| `tommymorgan:jj`, `root-cause-analyzer` agent | absent | 🟠 Drop / substitute |
| `/demo-record` + screenshots | absent — you have Playwright | 🟡 Optional |
| fig2json design refs, `linear-cli` backend | absent, no Linear | 🟡 Drop for solo |
| `plans/`, `features/`, `CONTEXT.md`, `CONTEXT-MAP.md` | none exist | 🟢 Trivial to scaffold |
| `docs/adr/*.md` | `docs/product/adrs/` (3 ADRs, 0001–0003) | 🟢 Already practicing |
| `~/.claude/prompts/review/checklist.md` | absent | 🟠 Provide or port |

> Note: the "21 ADRs / CONTEXT.md / `plans/2026-06-21-...md`" in the original summary describe **SplitStay** (Tommy's repo), not AVLmc. AVLmc has 3 ADRs and no `plans/` dir yet.

### What already aligns (your leverage)
- **`/orchestrator` + `/ship` + `workflow.md`** = your native Plan→Build→Ship — slice-flow's spine, minus the vertical-slice fences and living specs.
- **Per-feature test isolation** (34× `test:*` scripts, each with its own tsconfig, pure dependency-free cores) — a near-perfect substrate for per-scenario TDD + the mutation check.
- **Drift-proof `system-registry` + generated system-map** — already does what `CONTEXT.md` is meant to do, and it's CI-guarded.
- **Strong PRD + ADR culture** — the coverage ledger + fidelity audit is a natural extension.

---

## Clear steps forward

**Step 0 — Pick the prove-it pilot (do this first).** One small, self-contained upcoming PRD from the backlog (not a cost/infra PRD). This is the tracer bullet for the *methodology itself*; everything below is validated against it.

**Step 1 — Record the decision.** Write **ADR 0004 — "Slice-flow adoption (git-native variant)"**: what you took (the 4 ideas), what you dropped (jj, stacked PRs, demo-record, fig2json, Linear) and why. One page.

**Step 2 — Scaffold.** Create `plans/` and `features/`; add `plans/*.prd-coverage.md` to `.gitignore`; make `CONTEXT.md` a thin pointer to your existing generated system-map rather than a new hand-maintained doc.

**Step 3 — Port two skills, git-native.**
- `slice-plan-format` (+ `authoring-checklist`) — strip jj/Linear/fig2json; keep the slice→task→scenario structure and the ledger spec.
- `slice-build-engine` — swap jj commits → git commits on main; swap `/tommy-review` → `/code-review`; keep the per-scenario red→green→**mutate**→refactor loop and living-`.feature` writes; hand final delivery to `/ship`.

**Step 4 — Adopt the ledger + `/slice-prd-audit`.** Crown jewel, zero VCS coupling. Port `slice-prd-audit` as-is (strip only the Linear backend). For the pilot PRD, generate `plans/<prd-slug>.prd-coverage.md`: one atomic row per acceptance criterion, verbatim PRD text, each row classified (`covered` / `deferred` / `out-of-scope` / `no-plan`), Fidelity `unverified`. Worth doing even if you adopt nothing else.

**Step 5 — Run the pilot end-to-end and decide.** Take the one PRD through the full loop: `/slice-plan` → build each task (per-scenario TDD + mutation check + living `.feature`) → `/slice-prd-audit` writes Fidelity → `/ship` records it as always. Then judge honestly: did the fences + living specs + ledger catch things `/orchestrator` + `/ship` would have missed? Convert the next PRD only if yes. Best bet: the mutation check and the ledger survive; the rest is optional.

---

## How to sequence it

- **As an EPIC** (PRD 53 / "Phase 21 — Slice-flow adoption"), decomposed *as slices itself*: Slice 0 = ADR + scaffold, Slice 1 = plan-format skill, Slice 2 = build engine, Slice 3 = ledger + audit, Slice 4 = pilot. Fitting, but heavier/more formal.
- **As a lightweight spike** — skip the EPIC ceremony; do Steps 1–4 as plain commits; let the pilot (Step 5) be the first real slice plan you write. Faster to a verdict.

**Recommended:** do the **spike first** (solo + exploratory). Only formalize into an EPIC if the pilot convinces you. Don't build the whole apparatus before you know the four ideas earn their keep in *your* repo.

---

## One-line version

> Steal slice-flow's four ideas (fences, living specs, mutation check, coverage ledger), run them on plain git through your existing `/ship`, prove them on one PRD, and keep only what pays off — don't import jj or a PR model built for a team you don't have.

---

## Next cheap, reversible moves

- **Step 1** — draft ADR 0004.
- **Step 0** — pick the pilot PRD from the backlog.

Both are cheap and reversible, and make the rest concrete.
