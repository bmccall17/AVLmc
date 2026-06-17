# PRD 27: Guardrails & Social Benchmark

Part of the [Social / Curator Graph initiative](../social-curator-prd.md) (Phase 12). Cycle **C5** (last of five). Satisfies desired outcome **5 (Guardrails: No Pay-to-Play, No Domination, No Leaks)** — and delivers the [Discovery Benchmark](../discovery-benchmark_desiredoutcomes.md)'s still-unscoped **Outcome 3 (Social & Curator Benchmark)** (Phase 10). Depends on **C4 (PRD 26 — the social signal)**: you can only grade and guard a signal that exists.

## Goal

**Keep the board healthy under social influence: read social-driven lift separately from popularity, warn early when any single person, curator, or network begins to overpower local and novel discovery, enforce a hard "no money buys rank" rule, and prove privacy/PII safety throughout.**

The capping and off-by-default posture were built into C4; this cycle is the **accountability layer** — measurement, early warning, and the explicitly-tested invariants — and it homes that measurement into the existing Recommendation Insight surface (live-only / $0 / no new tab, per PRD 22).

## Summary

Extending the fixed-methodology Discovery Baseline (PRD 22), this cycle adds a **Social & Curator** reading to Recommendation Insight that reports **social-driven lift distinct from anonymous popularity** (how much `socialCircle` moved rankings vs. `socialHeat`), an **influence-concentration** read (the share of social-driven movement attributable to any single person / curator / tight network, with an early-warning threshold), and a confirmation that the **local/novel exploration floor holds** with social signal on. It asserts and unit-tests the cross-cutting invariants — **no money buys rank** (no code path lets payment set/raise rank or curator status) and **social never drowns local/novel** (the C4 cap-below-floor) — and runs a **PII/leak audit** across every social surface (no public profiles for regular listeners, no follow/circle data or tokens in public/community/OG responses). It adds a paste-ready **social benchmark snapshot** to the sprint record, mirroring PRD 22's copy-as-markdown discipline. No new tab, no new storage.

## Implementation Status

**Shipped — June 17, 2026. Completes Phase 12 (all five cycles) and delivers Discovery Benchmark Outcome 3.**

The accountability layer — measurement, early warning, and enforced invariants — is live:

- **Pure metrics (`lib/admin/insight-metrics.ts`).** `computeSocialLift` (sums `socialCircle` vs `socialHeat` component totals across the top-N — reported **separately** so "your people" lift is never read as crowd popularity), `computeInfluenceConcentration` (share of social-driven movement from the single largest source + early-warning flag at `INFLUENCE_CONCENTRATION_THRESHOLD = 0.6`), and `computeFloorHolds` (novelty share with social on vs. the anonymous baseline). `BaselineReading` + `serializeBaselineMarkdown` extended with an optional dated **social block**. All unit-tested.
- **Live read (`lib/admin/insight.ts`).** `computeSocialBenchmark` runs the fixed PRD 22 methodology with a deterministic synthetic circle (a friend cohort + one followed curator) and the `socialCircle` dial maxed, then composes the pure metrics. Added to `RecommendationInsight.social`; flows into the existing copy-as-markdown affordance automatically.
- **Presentation (`components/admin/InsightSection.tsx`).** A **Social & Curator** strip: "your people" lift vs. popularity, the concentration metric + early-warning flag, and the floor-holds read — each with a plain-language definition and the PRD 22 "descriptive, not a quality score" caveat.
- **Enforced invariants (`tests/social-guardrails.test.ts`).** **No money buys rank** — a fabricated `payment`/`paidBoost`/`purchasedRank` on preferences leaves ranking identical (ignored), plus a source-scan asserting `lib/discovery.ts` / `lib/curators.ts` / `lib/listener-preferences.ts` carry no payment pathway. **Social never drowns local/novel** — re-asserts `SOCIAL_CIRCLE_CAP < EXPLORATION_FLOOR_BASE`.
- **PII / leak audit (codified tests).** `toPublicSharedSong` never carries `seeded_by_user_id` and `sharedBy` is absent on the public projection; the anonymous community + OG surfaces (`app/api/community/*`, `opengraph-image`, `twitter-image`) reference **no** follow/circle/social token. Snyk-clean across the touch points.
- **Quality.** `test:social-guardrails` (9), `test:insight`, `test:discovery`, `test:registry`, typecheck, lint, `next build`, and Snyk all green. No new tab, no new storage, no new dependency; live-only / $0.

### First social benchmark snapshot (format)

The dated live reading is captured in production via **"Copy baseline reading as markdown"** (now including the social block); the serialized format is:

```
**Social & Curator (PRD 27):**
- "Your people" lift: <n> · anonymous popularity (socialHeat): <n> — read separately, never combined.
- Influence concentration: <p>% from the single largest source[ · ⚠ early-warning threshold crossed].
- Exploration floor holds with social maxed: yes (novelty <p>% vs baseline <p>%).
- _Descriptive synthetic-circle reading — not a quality score; no money buys rank._
```

## Goals

- A **Social & Curator Benchmark** reading in Recommendation Insight: social-driven lift **separate from** public popularity, computed on the fixed PRD 22 methodology.
- An **influence-concentration** read with an explicit early-warning threshold (flag when one person/curator/network dominates social-driven movement).
- A confirmation that the **local/novel floor holds** with social on (diversity/novelty do not regress vs. the anonymous baseline).
- The **"no money buys rank"** invariant and the **"social never drowns local/novel"** (cap-below-floor) invariant, asserted and unit-tested.
- A **PII/leak audit** across all social surfaces, codified as tests.
- A paste-ready **social benchmark snapshot** for the sprint/PRD record (copy-as-markdown, per PRD 22).

## Non-Goals

- **No** new scoring component or change to C4's cap — this cycle observes, warns, and enforces; it does not retune the signal (tuning lives behind the dial).
- **No** new snapshot table, longitudinal store, or new top-level tab (live-only / $0, per PRD 22).
- **No** new pay/curator-promotion mechanics — it asserts the *absence* of a money path.
- **No** Spotify writes.

## Requirements

### Social benchmark read (`lib/admin/insight.ts` + `lib/admin/insight-metrics.ts`)

- **Social lift vs. popularity:** for the fixed window + synthetic methodology, compute how much the `socialCircle` component changed the ranking against a circle-bearing synthetic profile, reported **separately** from `socialHeat`'s contribution — so "your people" lift is never read as crowd popularity. Pure, unit-tested helpers in `insight-metrics.ts`.
- **Influence concentration:** of the total social-driven movement, the share attributable to the single most-influential person / curator / network, with an **early-warning flag** when it crosses a stated threshold. Reported as a descriptive metric (not a grade), with a plain-language definition (PRD 22 style).
- **Floor-holds check:** novelty share + local-value share with social on vs. the anonymous baseline, confirming the Phase 11 exploration floor is intact.

### Invariants (tests)

- **No money buys rank:** an asserted, unit-tested check that no code path (scoring, curator promotion, preferences) consumes a payment/entitlement signal to set or raise rank or curator status. Documented as an explicit invariant test.
- **Social never drowns local/novel:** re-assert the C4 cap-below-exploration-floor invariant at the benchmark level (with social maxed, the reserved novel/local top-N share still holds).

### PII / leak audit (tests + review)

- Codified tests that follow edges, circle attribution, `seeded_by_user_id`, and curator-private activity never appear in `app/api/community/*`, `app/api/events/[id]/*`, the anonymous board, or OG responses; that **no regular listener has a public profile**; and that no tokens/PII ride alongside `user_id`/`session_id`. Snyk scan across the cycle's touch points.

### Presentation (`components/admin/InsightSection.tsx`, Overview)

- A **Social & Curator** strip in Recommendation Insight: social-vs-popularity lift, the concentration metric + early-warning flag, and the floor-holds read — each with a plain-language definition and the PRD 22 "descriptive, not a quality score" caveat.
- A **"Copy social benchmark reading as markdown"** affordance (extends `serializeBaselineMarkdown`) producing a dated, paste-ready snapshot.
- The Overview discovery-health card gains a compact social-health line (concentration flag) linking into Insight.

### Architecture & quality

- Update the Recommendation Insight node description in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` passes.
- Unit-test the new pure metrics + the two invariants + the leak audit; the discovery suite stays green.
- Record the **first social benchmark snapshot** in this PRD at ship (per the PRD 22 discipline).

## Dependencies

- **C4 (PRD 26)** — the `socialCircle` component + cap + `SCORER_VERSION`.
- **C1–C3** — the surfaces the leak audit covers (`listener_follows`, circle attribution, curator profiles).
- **PRD 22 (Discovery Baseline)** — the fixed methodology, `serializeBaselineMarkdown`, `insight-metrics.ts`, the Overview health card.
- **PRD 09 / PRD 10** — Recommendation Insight + Listener Trace.
- **Phase 11** — the exploration floor the "floor-holds" check validates against.

## Risks

- **Reading mistaken for a grade.** Carries PRD 22's note — presented descriptively, per-metric definitions, explicit caveat.
- **Concentration threshold mis-set.** Too sensitive → noise; too loose → misses domination. Mitigated by stating the threshold on the panel + snapshot and tuning against real data (intentional, recorded changes).
- **False sense of safety.** A passing benchmark is necessary, not sufficient. Mitigated by pairing the descriptive read with the *enforced* invariants (cap + no-money) rather than relying on observation alone.
- **Leak-audit gaps.** A missed surface could leak. Mitigated by codifying the audit as tests over the actual public payloads + Snyk, not a one-time manual pass.

## Acceptance Criteria

- Recommendation Insight shows social-driven lift **distinct from** public popularity, an influence-concentration metric with an early-warning flag, and a floor-holds read — each with a plain-language definition and the descriptive caveat.
- The **"no money buys rank"** and **"social never drowns local/novel"** invariants are asserted and unit-tested.
- The PII/leak audit (codified as tests) confirms no follow/circle/curator-private data or tokens in any public/community/OG response and no public profile for any regular listener.
- A dated **social benchmark snapshot** can be copied as markdown and is recorded in this PRD.
- No new tab, no new storage, no new dependency; live-only / $0; new code Snyk-clean. **This completes the Social / Curator Graph initiative (Phase 12, all five outcomes / five cycles) and the Discovery Benchmark Outcome 3.**

## Test Scenarios

- With social signal active on a circle-bearing synthetic profile → Insight reports a non-zero `socialCircle` lift separate from `socialHeat`; with the dial at 0 → social lift reads 0.
- Construct a profile where one curator drives most social movement → the concentration metric crosses the threshold and the early-warning flag fires.
- Max the social dial → the novelty/local-value floor-holds read still meets the Phase 11 reserved share.
- The no-money-buys-rank invariant test fails if a payment/entitlement field is wired into scoring or curator promotion (guard test).
- Leak-audit tests fail if any follow/circle/curator-private field or token appears in a public/community/OG payload.
- `serializeBaselineMarkdown` (extended) emits a clean, dated social snapshot from a fixed insight payload.
</content>
