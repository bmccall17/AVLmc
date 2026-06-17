## Deeper Personalization Scoring — Desired Outcomes

Updated: June 16, 2026

### Purpose & Posture

**Goal.** Make discovery learn from what a listener *skips*, not just what they tap. Move from today's flat "most recent 240 explicit actions" model to a **time-decayed, per-dimension taste model** that safely incorporates implicit signals (impressions that never convert), stays explainable and correctable, and is structurally protected from runaway feedback loops.

This is Initiative A of the North Star: *evolve discovery from "ranks what you tap" to "understands your taste and your trusted circle."* It is the scoring substrate; the social/curator layer ([`social-curator_desiredoutcomes.md`](social-curator_desiredoutcomes.md)) layers on top, and the [Discovery Benchmark](discovery-benchmark_desiredoutcomes.md) (Outcome 2) is the surface that grades whether this work actually helps.

**Current state (brownfield).** Scoring (`lib/discovery.ts`) reads only a person's most recent **240 explicit, meaningful actions** (`detail_open`, `avlgo_click`, `fire`, `planning`, `remove`, contributions) from `event_interaction_events` via `listDiscoveryPreferenceSignals` (`lib/discovery-memory.ts`), and **ignores `impression` rows entirely**. The full behavioral stream is captured but mostly unused. Per-person durable state (`fire`/`planning`/`removed`) lives in `event_person_event_state`; tunable weights and custom signals live in `listener_discovery_preferences` (the V3 model). The anonymous + signed-in merged memory model already works (cookie session signals + account signals).

**Posture (locked).**

- **$0 / live-first.** Affinities are computed **live from the event stream with caching**, consistent with the live-only benchmark posture. A small per-listener rollup table is added **only if** the richer model shows a real performance problem at scale (flagged, not assumed).
- **Anonymous-first preserved.** Browsing, reacting, and contributing never require login; personalization is an optional layer, not a gate.
- **Explainable & correctable by default.** Every learned signal — especially implicit ones — must be legible in Listener Trace and reversible by the listener. Inference must never feel creepy or unaccountable.
- **Validated, not guessed.** Every scoring change is checked in the **Recommendation Insight** and **Listener Trace** admin surfaces (PRDs 09/10) against real ranking output.

---

### 1. Skips Shape Ranking (implicit signal from impressions)

Done looks like the discovery scorer treating an impression that **never converts** as a soft *negative*: when a listener is repeatedly shown an artist, venue, or genre they never engage with, that dimension gently **cools** in their ranking — without ever hard-hiding a single show the way an explicit `remove` does.

The signal is deliberately conservative: weighted **far below** explicit actions, **decayed over time**, **capped** so it nudges rather than dominates, and applied **per-dimension** (artist / venue / genre) rather than per-event, so a quiet show a person simply hasn't seen yet is not buried. Conversely, dwell-and-return patterns read as soft *positives*. The high-volume, noisy `impression` stream becomes useful signal instead of storage bloat — which also changes the retention story: impressions are pruned only beyond the active signal window, not eagerly.

---

### 2. A Richer, Time-Decayed Taste Model

Done looks like personalization moving past the flat "recent 240" cap to **time-decayed, confidence-weighted per-dimension affinities** — separate learned affinities for **artist, venue, genre, time-of-week, price (free/paid), and indoor/outdoor** — so the board reflects the shape of a person's taste, not just their last few taps.

The model distinguishes **short-term intent** ("this weekend I'm in a jazz mood") from **long-term taste** (recency-weighted, with more evidence yielding more confidence), and feeds the existing preference-weighted component model (`getPreferenceComponentBases` → `scorePreferenceTuning`) rather than bolting on a parallel system. Affinities are computed live from the stream and cached; the structure stays additive to the V3 weights and custom signals already in place.

---

### 3. Cold-Start and a Graceful Anonymous → Account Hand-off

Done looks like a useful, personalized board **before sign-in** — anonymous session behavior strengthens ranking from the first few interactions — and a **clean hand-off** when an anonymous session links to an account: the signals the person accumulated while logged out are **merged into their account**, so signing in feels like continuity, not a reset.

No personalization capability silently requires an account, and no anonymous contribution or signal is lost at the moment of linking.

---

### 4. Every Learned Signal Is Explainable and Correctable

Done looks like a listener being able to **see why** a show was raised or lowered — including implicit reasons ("you keep skipping shows like this") surfaced in plain language in Listener Trace — and being able to **correct** it, extending the V3 weights / custom-signal / match-correction model to behavioral inference.

Implicit signals never appear as an opaque black box: they carry truthful, private-safe reason strings, they show up in the admin Recommendation Insight / Listener Trace breakdowns attributed to the listener's own behavior, and a person can always tell the system "no, I actually like this" and have it honored.

---

### 5. Structurally Protected From Feedback Loops

Done looks like the system being **provably hard to trap in a runaway loop**: a novelty/exploration floor guarantees the board keeps surfacing under-the-radar and local shows even as personalization sharpens, so personalization can never quietly bury everything a person hasn't already clicked.

Done means the admin benchmark can show — over time, against the anonymous baseline — that diversity and novelty did **not** collapse as implicit signals were turned on, and that explicit actions still dominate implicit ones. (This is the outcome the [Discovery Benchmark](discovery-benchmark_desiredoutcomes.md) Outcome 2 / its "Personalization Lift & Feedback-Loop Guardrails" cycle exists to validate.)

---

### Locked Decisions

- **Storage:** live-computed affinities with caching first; a per-listener rollup table only if a measured perf problem appears.
- **Signal hierarchy:** explicit actions always outweigh implicit ones; implicit signals are capped and decayed.
- **Reversibility:** every learned signal is correctable; `remove` stays the only hard-hide.

### Acceptance (initiative-level)

- A signed-in listener's ranking **measurably reflects what they skip**, not just what they tap — visible in Recommendation Insight / Listener Trace.
- Diversity, novelty, and local relevance **do not regress** when implicit signals are enabled (benchmarked against the anonymous baseline).
- No runaway feedback loop: the exploration floor holds; explicit signals dominate implicit ones.
- Every learned signal is explainable in Listener Trace and correctable by the listener.
- Anonymous browsing/contribution still works with no account; sign-in merges prior session signals.
- $0 maintained; new first-party code passes Snyk; no OAuth tokens or PII in public responses.
