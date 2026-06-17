## Social Signal Tuning — Desired Outcomes

Updated: June 17, 2026

> **Follow-up to Phase 12 (Social / Curator Graph).** The five-cycle initiative (PRDs 23–27)
> shipped the social spine, attribution, curator profiles, the `socialCircle` ranking component,
> and the guardrail benchmark. This document scopes the **first tuning iteration** of that signal —
> refining *how* circle/curator activity is weighed and *how* its guardrails are calibrated. It is
> deliberately small and is the item `/orchestrator` surfaced as the next optional follow-up.

---

### Purpose & Posture

**Goal.** Turn the social signal from a single, fixed-weight knob into a **finer, separately-tunable
input** (friend going / friend firing / followed-curator pick), and turn its guardrail thresholds from
**asserted constants** into **demonstrated, reproducible calibrations** — so that "your people" lift is
more controllable and the influence-concentration warning is shown to actually separate a healthy
circle from a dominated one. All within the locked Phase 12 posture: opt-in, off by default, capped
below the exploration floor, no pay-to-play, no Spotify writes, $0.

**The central constraint (read this first).** Tuning a social signal "against real data" is the obvious
ask — but at **WAU < 10** there are essentially **no real follow graphs and no real curator circles**
to tune against. The Phase 12 benchmark already works around this by running the production scorer
against **one deterministic synthetic circle**. Iteration 1 therefore deliberately splits the work:

- **Doable now (this iteration) — deterministic-scenario tuning.** Build the tunable knobs and a
  *reproducible, named-scenario* benchmark so a reading moves **only when the algorithm changes**.
  This needs zero real users, stays $0, and leaves real-data tuning a dial-turn rather than a rebuild.
- **Deferred (a later, *triggered* iteration) — real-data calibration.** Re-derive the friend/curator
  weights and the concentration threshold from observed circles **once usage supports it** (trigger
  below). Picking those numbers from <10 users now would be guessing dressed as data.

This mirrors the project's existing discipline: the [Discovery Benchmark](discovery-benchmark_desiredoutcomes.md)
is *"validated, not guessed"* and *live-only / $0*; the Phase 11 benchmark's reproducible
synthetic-behavior fixture was parked for the same "no fixed reading to diff" reason. Iteration 1 is
the **social analog of that fixture**.

**Posture (inherited, locked — unchanged from Phase 12).**

- **Opt-in, off by default.** `DEFAULT_LISTENER_WEIGHTS.socialCircle = 0`; any new sub-weights default
  to a split that still sums to "off" until the listener raises the dial. Anonymous and not-opted-in
  sessions stay **byte-for-byte unchanged**.
- **Bounded.** The combined social contribution stays **hard-capped below** the Phase 11 exploration
  floor (`SOCIAL_CIRCLE_CAP < EXPLORATION_FLOOR_BASE`) **even with every sub-weight maxed** — finer
  weighting may *redistribute* influence but must never *raise the ceiling*.
- **Distinct from the crowd.** "Your people" (`socialCircle`) stays separate from anonymous popularity
  (`socialHeat`); the benchmark continues to read them apart.
- **No pay-to-play, no Spotify writes, $0, Snyk-clean, privacy-first.** No code path lets money set or
  bias weights/threshold/curator status; no PII or out-of-circle identity leaks into reasons or public
  responses.
- **Descriptive, never a quality score.** Every metric keeps its plain-language definition and the
  PRD 22 caveat.

---

### Current State (what iteration 1 tunes)

What shipped in Phase 12 C4/C5 and is the substrate here:

- **One combined base, fixed internal weights.** `scoreSocialCircleBase(activity, followedCuratorPickCount)`
  (`lib/discovery.ts`) saturates with a *baked-in* ordering (firing > going > curated-pick). A listener
  cannot value a trusted curator's pick differently from a friend's "going"; there is **one** dial
  (`socialCircle`, "Your people", default 0).
- **One cap.** `SOCIAL_CIRCLE_CAP = 10`, below `EXPLORATION_FLOOR_BASE = 14`. `SCORER_VERSION = 12.4`.
- **Three benchmark metrics, one synthetic circle** (`lib/admin/insight-metrics.ts`, surfaced in
  `components/admin/InsightSection.tsx`):
  - `computeSocialLift` — a **single combined** "your people" total vs `socialHeat`.
  - `computeInfluenceConcentration` — single-largest-source share vs `INFLUENCE_CONCENTRATION_THRESHOLD = 0.6`
    (the `0.6` is **asserted, not demonstrated** — chosen without data).
  - `computeFloorHolds` — novelty share with social on vs. the anonymous baseline.
- **Snapshot debt.** PRD 27's "first social benchmark snapshot" is still a **format template**
  (`<n>` / `<p>%`) — no real reading has been recorded.

---

### 1. Finer, separately-tunable social weighting

Done looks like the single combined `socialCircle` base being decomposed into **three explainable
sub-sources** — *friend going*, *friend firing*, and *followed-curator pick* — each with its own
relative weight, so the influence ordering is **configured, not hard-coded**. Whether the new weights
are exposed as listener-facing controls or kept as a single committed default split (with the public
dial unchanged) is an open design choice for the PRD; the requirement is that the sub-weights are
**named, documented constants** the benchmark can vary, not numbers buried in a saturating helper.

The decomposition must be **continuity-preserving**: with the new default split, ranking is unchanged
vs. today (no silent re-ranking on upgrade), and dial-0 / anonymous still yields exactly 0. Reasons
stay truthful and private-safe, now able to distinguish *"picked by [curator you follow]"* weight from
*"3 people you follow are going"* weight.

---

### 2. A reproducible, named-scenario social benchmark

Done looks like the benchmark's single synthetic circle being replaced by a **small committed set of
named, deterministic scenarios** — at minimum: a **healthy diverse circle** (several friends + a couple
of curators, no single dominant source), a **single-curator-dominated** circle, and a **single-loud-friend**
circle. Each scenario is a fixed fixture (no real data, no new table) that produces the **same metrics
every run**, so a reading moves only when the scoring/weights change — the social analog of the parked
Phase 11 synthetic-behavior fixture, feeding the same pure helpers in `lib/admin/insight-metrics.ts`.

This is what makes the threshold calibration (Outcome 3) and the weighting change (Outcome 1)
**measurable rather than anecdotal**.

---

### 3. A demonstrated influence-concentration threshold

Done looks like `INFLUENCE_CONCENTRATION_THRESHOLD` no longer being an unexamined `0.6` but a value
**shown to correctly separate** the named scenarios: the diverse circle lands **below** it (no
early-warning flag), and the single-source-dominated circles land **at or above** it (flag fires). If
`0.6` already separates them, it is *confirmed and documented* with the evidence; if it doesn't, it is
*retuned* to the value that does, recorded on the panel and in the snapshot. Either way the threshold
graduates from "guessed" to "demonstrated against fixed scenarios" — with the real-data re-derivation
explicitly deferred (below).

---

### 4. Guardrail invariants hold under the richer weighting

Done looks like the Phase 12 safety invariants **re-proven after the change**, not assumed:

- **Floor holds under max sub-weights.** With *every* social sub-weight maxed simultaneously (the new
  worst case), the combined post-cap contribution still sits below the exploration floor and the
  reserved novel/local top-N share is intact (`computeFloorHolds` = yes for every scenario).
- **No money buys rank** still holds (no payment path touches the new weights or the threshold).
- **No leak** — the new sub-source reasons name only in-circle friends/curators; no out-of-circle
  identity or PII appears in any reason or public response.

`SCORER_VERSION` is bumped on the scoring change (PRD 22 discipline), and the discovery + guardrails
suites stay green.

---

### 5. First recorded social benchmark snapshot (closes the open debt)

Done looks like the **first real social benchmark snapshot** being captured via the existing
"Copy baseline reading as markdown" affordance and **recorded in the PRD** — replacing PRD 27's
`<n>` / `<p>%` template with concrete values from the named scenarios. This is both the proof the
metrics moved as intended and the fixed reference the *next* (real-data) iteration will diff against.

---

### Measurable Success (Benchmark)

The first iteration succeeds when these specific, observable changes appear in the benchmark — all on
the deterministic scenarios, no real users required:

| Benchmark metric (`lib/admin/insight-metrics.ts`) | Today | Iteration-1 success signal |
| --- | --- | --- |
| **"Your people" lift** (`computeSocialLift`) | one combined `socialCircle` total | reported **decomposed** into friend-going / friend-firing / curated-pick sub-lifts that **sum (±rounding) to the combined total** (continuity); changing the *curator* sub-weight alone moves **only** the curator-pick sub-lift, not the friend sub-lifts (independence) |
| **Influence concentration** (`computeInfluenceConcentration`) | one number vs an **asserted** `0.6` | across ≥3 named scenarios: diverse → **below** threshold (no flag); single-curator and single-friend dominated → **at/above** threshold (flag fires). Threshold value **documented with the scenario evidence** that justifies it |
| **Floor holds** (`computeFloorHolds`) | `yes` for one maxed scenario | `yes` for **every** scenario including **all sub-weights maxed at once**; `SOCIAL_CIRCLE_CAP < EXPLORATION_FLOOR_BASE` re-asserted |
| **Anonymous / dial-0 parity** | byte-for-byte unchanged | **still** byte-for-byte unchanged after the decomposition (regression guard) |
| **Recorded snapshot** | PRD 27 template (`<n>` / `<p>%`) | **first concrete dated snapshot** committed in the PRD, per-scenario |

Plain-language version of "did it work?": *we can now turn friend influence and curator influence
independently and see exactly which one moved the list; our domination warning is shown to fire on a
dominated circle and stay quiet on a healthy one; turning every social knob to max still cannot bury
local/novel shows; and we have a real, dated reading written down to compare the next change against.*

---

### Deferred to a later, *triggered* iteration (real-data calibration)

Out of scope for iteration 1; revisit when usage makes it real, not before:

- **Re-derive friend/curator weights and the concentration threshold from observed circles.**
  **Trigger:** enough real opted-in follow graphs to read distribution — proposed **≥ 25 listeners
  with `share_activity` on AND ≥ 10 active follow edges**, cross-checked against the roadmap Scaling
  Milestones (today's posture is WAU < 10). Until then the deterministic scenarios stand in.
- **Conversion-quality read** — whether socially-surfaced shows actually convert (going / fire / ticket
  intent) at a rate that justifies the signal (the Discovery Benchmark Outcome 3 "conversion" ambition).
  Needs real interaction volume on socially-lifted events; meaningless at current scale.
- **Self-serve curator onboarding** — stays deferred (Phase 12 locked decision).

---

### Locked Decisions

- **Posture unchanged.** Opt-in, off by default, capped below the exploration floor, distinct from
  `socialHeat`, no pay-to-play, no Spotify writes, $0, Snyk-clean, privacy-first, descriptive-not-a-score.
- **No new top-level tab, no new snapshot table, no longitudinal store** — lives in Recommendation
  Insight on the live scorer with markdown snapshots, per PRD 22.
- **Deterministic-scenario tuning first; real-data calibration deferred behind the usage trigger above.**
- **Continuity:** the upgrade must not silently re-rank — the new default weight split reproduces
  today's ranking; `SCORER_VERSION` bumps and a fresh snapshot is recorded.

### Non-Goals

- No change to the anonymous board, `socialHeat`, or the anonymous payload.
- No *raising* of the social ceiling — finer weighting redistributes within the existing cap only.
- No new social-activity table; reuse the C2/C3 live-computed reads and the existing pure metrics.
- No real-user A/B test, no new analytics events (deferred with real-data calibration).

### Acceptance (iteration-level)

- The `socialCircle` base is decomposed into separately-weighted friend-going / friend-firing /
  curated-pick sub-sources with documented default constants; dial-0 and anonymous remain byte-for-byte
  unchanged and today's ranking is reproduced by the default split.
- Recommendation Insight reports the **decomposed** social lift (sub-lifts sum to the combined total),
  and changing one sub-weight moves only its sub-lift.
- A committed set of ≥3 named deterministic benchmark scenarios exists; the concentration threshold is
  shown to separate healthy from dominated circles, with the value documented against that evidence.
- `computeFloorHolds` = yes for every scenario including all sub-weights maxed; the cap-below-floor and
  no-money-buys-rank invariants are re-asserted and unit-tested; no PII/out-of-circle leak.
- The first concrete social benchmark snapshot is recorded in the PRD; `SCORER_VERSION` bumped;
  discovery + guardrails suites, typecheck, lint, build, and Snyk all green; $0.
