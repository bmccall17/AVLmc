## Social / Curator Graph — Desired Outcomes

Updated: June 16, 2026

### Purpose & Posture

**Goal.** Let listeners optionally follow friends and curators, see and act on what their trusted circle is into, and make that trusted-circle / followed-curator activity an **optional, clearly-distinct discovery input** — privacy-first, opt-in, no pay-to-play, no Spotify writes, and never overpowering local and novel discovery.

This is Initiative B of the North Star: *evolve discovery from "ranks what you tap" to "understands your taste and your trusted circle."* It builds directly on **Phase 9 / Shared Listening (PRD 17)** — the shipped shared-song surface stores `seeded_by_user_id` server-side as the deliberate on-ramp to the **inner-circle attribution** this initiative delivers. The social signal it eventually feeds into ranking sits on top of the scoring substrate from [`deeper-personalization_desiredoutcomes.md`](deeper-personalization_desiredoutcomes.md), and the [Discovery Benchmark](discovery-benchmark_desiredoutcomes.md) (Outcome 3) is the surface that grades whether social/curator signal helps without distorting the board.

**Current state (brownfield).** There is **no follow/friend graph and no curator concept**. Per-person state is `fire`/`planning`/`removed` (`event_person_event_state`) plus private saves (`saved_items`, signed-in only). Community heat (`going`/`fire`/`songs`/`notes`/`voices`) is **anonymous and public** — it is *crowd* signal, explicitly not *"your people"* signal. Shared Listening renders a public, **unattributed** shared-song list per event, with `seeded_by_user_id` held server-side only. Auth helpers are `requireUserId()` / `getOptionalUserId()`.

**Posture (locked).**

- **Privacy-first, opt-in.** No public social graph by default. Following and any activity-sharing are opt-in; a listener's activity is never exposed to people they have not chosen to share with.
- **One-way follows.** Following is one-directional (you can follow a curator or a friend without reciprocation); friend-activity visibility is gated by the follow edge and the followee's opt-in.
- **Admin-promoted curators (at first).** Curator/influencer status is **admin-granted** initially — controlled, $0, spam-resistant — with self-serve onboarding deferred to later.
- **Social signal is opt-in / off by default.** When social activity becomes a ranking input it is a **new component, distinct from public `socialHeat`**, capped so it cannot drown local/novel discovery, and tunable like the existing V3 controls. No pay-to-play; no money buys rank.
- **No Spotify writes.** Stays within current read-only scopes; the parked Spotify write Outcome is untouched.
- **Validated, not guessed.** Social ranking influence is checked in Recommendation Insight / Listener Trace against real output, with an explicit watch for influence concentration.

---

### 1. An Opt-In Social Graph

Done looks like a signed-in listener being able to **follow friends and curators** through a private, opt-in connection model — no public social graph, no exposure of who follows whom by default — built on a `requireUserId()`-gated API in the existing `app/api/me/*` namespace.

Following is one-way and reversible; the graph is private to the people in it; nothing about it leaks into public/community responses. This is the spine every other outcome plugs into.

---

### 2. Inner-Circle Attribution (your people, not the crowd)

Done looks like a listener seeing **what the friends and curators they follow are going to and firing** — the attribution that Shared Listening intentionally deferred — and being able to **share shows and song lists** with their circle.

Attribution is strictly gated: a person's activity is shown only to followers they have opted into sharing with, never to anonymous viewers, never as public popularity. This turns the server-side `seeded_by_user_id` on-ramp from PRD 17 into a visible, privacy-respecting "your people are into this" layer, clearly separate from the anonymous community heat the board already shows.

---

### 3. Curator & Influencer Profiles

Done looks like **first-class curator/influencer profiles** — admin-promoted at first — with public top-lists and per-show picks, a **"curated by"** signal on the board, and the ability for a listener to **follow a curator's taste** the way they follow a friend.

Curator profiles are an intentional, opt-in *public persona* (distinct from regular listeners, who never get a public profile). A curator's picks are transparent and attributed; following a curator brings their signal into the follower's discovery experience without making it public popularity.

---

### 4. Social Signal in Discovery (optional, distinct, bounded)

Done looks like trusted-circle / followed-curator activity becoming an **optional ranking input** — a new scoring component in `lib/discovery.ts`, **clearly distinct from anonymous public `socialHeat`** ("your people" vs. "the crowd") — that a listener can opt into and tune via its own preference weight, mirroring the V3 controls.

The component is **capped** so it can never drown out local relevance and novelty, it is **off by default** (opt-in), and it is **never purchasable** (no pay-to-play). Its contribution is visible and explainable in Recommendation Insight / Listener Trace, attributed to the specific friends/curators that drove a rank change. This outcome depends on both the social graph (Outcomes 1–3) and the deeper-personalization scoring model.

---

### 5. Guardrails: No Pay-to-Play, No Domination, No Leaks

Done looks like the board staying **healthy under social influence**: an early-warning read (in the benchmark) when any single person, curator, or network begins to **overpower local and novel discovery**; a hard rule that **no money buys rank**; and privacy/PII safety throughout — no public profiles for regular listeners, no tokens or PII in public responses, no Spotify writes.

Done means social influence is always *additive and bounded*, the local/novel floor from Initiative A holds even with social signal on, and the benchmark can show social-driven lift **separately** from public popularity.

---

### Locked Decisions

- **Curators:** admin-promoted first; self-serve onboarding deferred.
- **Follows:** one-way, opt-in, private by default.
- **Social signal:** off by default, opt-in, own tunable weight, capped, distinct from public heat.
- **Spotify writes:** out of scope (parked Outcome unchanged).

### Acceptance (initiative-level)

- A signed-in listener can follow friends/curators, see their followed circle's going/firing, and share shows/song lists — all opt-in and private by default.
- Curator profiles exist with public top-lists and per-show picks and a "curated by" board signal.
- Trusted-circle/curator activity can optionally and tunably influence ranking, **distinct from** public community heat, capped so it never drowns local/novel discovery.
- The benchmark can read social-driven lift separately from popularity and warn on influence concentration; no pay-to-play path exists.
- No public profiles for regular listeners; no tokens/PII in public responses; no Spotify writes; $0 maintained; new code passes Snyk.
