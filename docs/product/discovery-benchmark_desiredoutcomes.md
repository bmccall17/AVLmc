## Discovery Benchmarking — Desired Outcomes

Updated: June 17, 2026

### Purpose & Posture

This initiative turns the admin portal's two shipped discovery-inspection surfaces into a **benchmark** — a way to answer "are we getting better or worse at discovery?" rather than only "what does discovery look like right now?"

It does **not** add a new top-level dashboard tab. The work homes in the existing surfaces:

- **Recommendation Insight** (PRD 09) — the aggregate benchmark.
- **Listener Trace** (PRD 10) — the per-listener drill-down that supplies the evidence behind the aggregate.
- **Overview** — one compact discovery-health summary that links into Recommendation Insight.

**Live-only, $0 posture.** Per the project's cost and privacy guardrails, benchmarking stays **live-computed** — it re-runs the production scorer (`scoreDiscoveryEvents`) on demand against a fixed methodology. There is **no new snapshot table and no longitudinal store**. "Memory" lives in **markdown snapshots recorded at ship milestones** (see Outcome 1, Methodology), so a reading taken today can be diffed against a reading written down before a change shipped. The benchmark's value comes from a *fixed, repeatable methodology* plus *disciplined recording*, not from new infrastructure.

This builds directly on the two "Future Direction" sections of [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md) (Deeper Personalization; Social, Curators & Influencers). Outcome 1 is the concrete first phase; Outcomes 2 and 3 are framed here so the sequence is legible, but their personalization/social specifics remain unscoped until those directions come up the priority list.

---

### 1. Discovery Baseline (detailed — first phase)

> **Shipped — PRD 22 (June 17, 2026).** Recommendation Insight is now a repeatable,
> fixed-methodology baseline reading: pinned window + `SCORER_VERSION`/commit + a **stable
> committed synthetic profile**, the full metric set (anonymous ranking shape, behavior mix incl.
> impression non-conversion, engagement, diversity, novelty, local relevance, signal coverage)
> each with a plain-language definition, a markdown snapshot for recording-without-storage, and an
> Overview discovery-health link. See [`prds/prd-22-discovery-baseline.md`](prds/prd-22-discovery-baseline.md)
> for the delivered detail and the first recorded snapshot.

Done looks like the Admin Portal establishing a **repeatable, fixed-methodology reading** of how discovery performs today, so that every future personalization or social change can be measured against the same anonymous ranking, listener behavior, engagement, diversity, novelty, local-relevance, and signal-coverage reference. Because nothing is stored, the reading is only trustworthy if it is *computed the same way every time* and *recorded at known moments* — those two disciplines are the deliverable.

**Done looks like — what a single "today's reading" must include.** Taken in one pass from the live scorer, a baseline reading reports, for the current event window:

- **Anonymous ranking shape** — the top-N anonymous ranking (public + community signals, no taste profile) with each event's score and dominant component, so the public board's behavior is legible without any listener attached.
- **Listener behavior mix** — the action breakdown over `event_interaction_events` (impression, detail_open, avlgo_click, fire, planning, remove, contributions), including the share of impressions that never convert — the soft-negative volume that Deeper Personalization will later try to use.
- **Engagement** — community heat in aggregate (going / fire / songs / notes / voices) and how much of it concentrates on the top of the ranking.
- **Diversity** — venue / tag / artist spread across the top-N, with the existing low-spread flag.
- **Novelty** — how much of the top-N is "quiet" (low social heat + low profile + low personal signal), i.e., whether the novelty bonus is actually surfacing under-the-radar shows.
- **Local relevance** — the share of top-N results carrying community signal and/or Asheville local markers.
- **Signal coverage** — how many events receive *any* personalization vs. ranking on timing alone, derived by diffing the anonymous and synthetic-profile scores.

Most of these already exist in `lib/admin/insight.ts`; "done" means they are presented together as one coherent **baseline reading**, each with a short plain-language definition, so a human or agent reads the same panel the same way every time.

**Done looks like — fixed methodology.** A reading is reproducible because its inputs are pinned and stated on the panel:

- A **defined event window** (the rolling window used today), shown explicitly so two readings are comparing the same horizon.
- A **stable synthetic taste profile** for the anonymous-vs-signed-in comparison (public-derived, never a real listener's data), so "what changes when signed in" moves only when the *algorithm* changes, not because the synthetic profile drifted.
- The **scorer version / relevant commit** surfaced alongside the reading, so a recorded snapshot is attributable to a known state of `scoreDiscoveryEvents`.

**Done looks like — recording without storage.** Because there is no snapshot table, history is captured in markdown at known moments:

- The `/ship` workflow (or the operator) **copies the current baseline reading into the shipped PRD / sprint record** when a discovery-affecting change goes out — a dated, human-readable snapshot in the repo.
- A future reading can then be **diffed by eye against the last recorded snapshot** to see whether diversity narrowed, coverage rose, novelty collapsed, etc.
- Snapshots are framed as **descriptive**, never as a single "quality score" (carrying forward PRD 09's risk note: don't misread correlation as quality).

---

### 2. Deeper Personalization Benchmark

Done looks like the Admin Portal showing whether **real listeners** are receiving meaningfully different and more useful rankings than the anonymous baseline established in Outcome 1 — not just that personalization *runs*, but that it *helps*.

Specifically, done looks like being able to read: whether **skipped / unconverted events** (today's ignored `impression` stream) measurably influence a listener's future recommendations; **which signals** caused a given listener's rank changes (attributed per component, as Listener Trace already does per event); and whether personalization stays **diverse, explainable, and protected from runaway feedback loops** — i.e., the system is not quietly burying everything a person hasn't clicked yet. The aggregate view lives in Recommendation Insight; the evidence for any single listener lives in Listener Trace. This is the validation surface named in the backlog's *Deeper Personalization* direction, and it remains unscoped until that work is prioritized.

---

### 3. Social & Curator Benchmark

Done looks like the Admin Portal showing whether **trusted friends and followed curators** help listeners discover and act on shows they otherwise would have missed — while keeping social influence **visibly separate from public popularity**, and while identifying when any single person, curator, or network begins to **overpower local and novel discovery**.

Specifically, done looks like being able to read: the lift attributable to social/curator signal distinct from anonymous community heat; whether socially-surfaced shows convert (going / fire / ticket intent) at a rate that justifies the signal; and an early-warning read when influence concentration starts to crowd out local relevance and novelty (the guardrails the backlog's *Social, Curators & Influencers* direction calls out — no pay-to-play, no drowning out local discovery). This is framed here for sequence only; it remains large and unscoped, and would land alongside its own epic when prioritized.

---

### How These Connect

| Outcome | Primary surface | Measured against |
| --- | --- | --- |
| 1. Discovery Baseline | Recommendation Insight (aggregate) + Overview link | itself, over time, via recorded markdown snapshots |
| 2. Deeper Personalization Benchmark | Recommendation Insight + Listener Trace (evidence) | the Outcome 1 anonymous baseline |
| 3. Social & Curator Benchmark | Recommendation Insight + Listener Trace (evidence) | the Outcome 1 + Outcome 2 baselines |

Each phase is measured against the reading the prior phase establishes. Outcome 1 is the foundation: without a disciplined, repeatable baseline, the personalization and social benchmarks have nothing to claim improvement against.
