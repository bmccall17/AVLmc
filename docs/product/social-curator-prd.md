# Social / Curator Graph — Master PRD (Epic)

Updated: June 17, 2026

**Status: Shipped (June 17, 2026).** All five cycles (PRDs 23–27) are delivered — the opt-in follow graph (C1), inner-circle attribution (C2), admin-promoted curator profiles (C3), the off-by-default capped `socialCircle` ranking component (C4), and the guardrails + Social & Curator Benchmark (C5, which also delivers Discovery Benchmark Outcome 3). The initiative shipped at $0, privacy-first, with no pay-to-play and no Spotify writes; the anonymous board ranking and payload are byte-for-byte unchanged.

## One-Sentence Goal

Let a signed-in listener **optionally follow friends and curators**, see and act on what their trusted circle is into, and make that trusted-circle / followed-curator activity an **optional, clearly-distinct, bounded discovery input** — privacy-first, opt-in, no pay-to-play, no Spotify writes, and never overpowering local and novel discovery.

## How To Use This Document

This is the umbrella tracker for the Social / Curator Graph initiative (**Phase 12** in [`master-roadmap.md`](master-roadmap.md)). It synthesizes the desired outcomes in [`social-curator_desiredoutcomes.md`](social-curator_desiredoutcomes.md) into a sequenced series of focused PRDs in [`prds/`](prds/) (PRDs **23–27**). Treat this file the way [`admin-portal-prd.md`](admin-portal-prd.md) serves Phase 7, [`saved-favorites-genre-prd.md`](saved-favorites-genre-prd.md) serves Phase 8, and [`deeper-personalization-prd.md`](deeper-personalization-prd.md) serves Phase 11: the epic owns shared architecture, cross-cutting rules, and sequencing; each cycle PRD owns one independently shippable increment.

This is **Initiative B** of the discovery **North Star** (*evolve discovery from "ranks what you tap" to "understands your taste **and** your trusted circle"*). It layers a **social signal** on top of the scoring substrate delivered by **Initiative A** — the [Deeper Personalization](deeper-personalization-prd.md) model (Phase 11, PRDs 18–21, shipped). It builds the social spine on the on-ramp deliberately left by **Phase 9 / Shared Listening (PRD 17)** — the shipped `event_shared_songs.seeded_by_user_id` server-side field — and is graded by the [Discovery Benchmark](discovery-benchmark_desiredoutcomes.md) (Phase 10, Outcome 3 — Social & Curator Benchmark), which this initiative's final cycle delivers.

## Current State (Brownfield Baseline)

This is not greenfield, but it is the first **person-to-person** layer in the product. Everything social today is either anonymous-crowd or private-to-self.

- **No follow/friend graph and no curator concept exist.** Per-person state is `fire` / `planning` / `removed` (`event_person_event_state`) plus private bookmarks (`saved_items`, signed-in only). There is no edge connecting one listener to another.
- **Community heat is anonymous crowd signal.** `going` / `fire` / `songs` / `notes` / `voices` aggregate into the public `socialHeat` component (`lib/discovery.ts`) — explicitly *the crowd*, not *"your people."* It is public and unattributed by design.
- **Shared Listening left the on-ramp.** PRD 17 renders a public, **unattributed** shared-song list per event and stores `event_shared_songs.seeded_by_user_id` **server-side only** (never selected into public types) as the deliberate hook for the inner-circle attribution this initiative delivers.
- **Auth + the per-listener API namespace are ready.** `requireUserId()` / `getOptionalUserId()` (auth helpers) gate the existing private surfaces under `app/api/me/*` (`saved-items`, `listener-preferences`, `music-connections`, `music-profile`, …). The follow graph plugs straight into this namespace.
- **The scoring engine is a pure, tunable component model.** `scoreDiscoveryEvents` returns a `DiscoveryScoreComponents` map of nine weighted `ListenerPreferenceKey` components (incl. the anonymous `socialHeat`) plus `customSignals` / `learnedBehavior`, each routed through the 0–200 dials in `lib/listener-preferences.ts` (default 100). A new social component slots in here as a **distinct, separately-dialed** term.
- **The UI already promises this.** The homepage renders a **"Curators — Coming soon"** callout (`components/EventBoard.tsx:1416`) inviting listeners to "follow local tastemakers, friends, and music circles so their show signals can carry more weight in your discovery feed." This initiative makes that promise real.
- **Admin observability is ready to validate it.** **Recommendation Insight** (PRD 09) and **Listener Trace** (PRD 10), plus the fixed-methodology **Discovery Baseline** (PRD 22), exist precisely to grade scoring changes against real output and to separate "your people" lift from anonymous popularity.

**Reusable spine every cycle plugs into:** `requireUserId()` / `getOptionalUserId()` + the `app/api/me/*` pattern; the `saved_items` polymorphic + normalized-name precedent (`lib/saved-items.ts`); the `event_shared_songs.seeded_by_user_id` on-ramp + its public-stripping core (`lib/shared-songs-core.ts`); `event_person_event_state` (going/firing) as the activity source; the component-base → preference-weight scoring model + the 0–200 dials; the admin-moderation pattern (`app/api/admin/*`); and the System Registry / system-map discipline.

## Posture (Locked — inherited by every cycle)

- **Privacy-first, opt-in.** No public social graph by default. Following and any activity-sharing are opt-in; a listener's activity is **never** exposed to people they have not chosen to share with, and **never** to anonymous viewers.
- **One-way follows.** Following is one-directional (follow a curator or friend without reciprocation); friend-activity visibility is gated by **both** the follow edge **and** the followee's sharing opt-in.
- **Admin-promoted curators (at first).** Curator status is **admin-granted** initially — controlled, $0, spam-resistant. Self-serve curator onboarding is **deferred**.
- **Social signal is opt-in / off by default.** When social activity becomes a ranking input it is a **new component, distinct from public `socialHeat`**, **capped** so it cannot drown local/novel discovery, **off by default** (its dial starts at 0, unlike the default-100 V3 controls), and tunable like the existing controls. **No pay-to-play; no money buys rank.**
- **No Spotify writes.** Stays within current read-only scopes; the parked Spotify write Outcome is untouched.
- **Validated, not guessed.** Social ranking influence is checked in Recommendation Insight / Listener Trace and the Social & Curator Benchmark against real output, with an explicit watch for **influence concentration**.

## Definition Of Done (Outcomes 1–5, Synthesized)

1. **An opt-in social graph** — a signed-in listener can follow friends and curators through a private, one-way, reversible connection model; the graph is private to the people in it and never leaks into public/community responses.
2. **Inner-circle attribution** — a listener can see what the friends and curators they follow are *going to* and *firing*, and share shows and song lists with their circle; attribution is shown only to followers the person opted into sharing with, never to anonymous viewers, never as public popularity.
3. **Curator & influencer profiles** — first-class, admin-promoted curator profiles with public top-lists and per-show picks, a **"curated by"** signal on the board, and the ability to follow a curator's taste the way you follow a friend; regular listeners never get a public profile.
4. **Social signal in discovery** — trusted-circle / followed-curator activity becomes an **optional, distinct, bounded** ranking component in `lib/discovery.ts` with its **own tunable weight** (off by default), capped so it never drowns local relevance / novelty, and explainable in Recommendation Insight / Listener Trace attributed to the specific friends/curators that drove a rank change.
5. **Guardrails** — the board stays healthy under social influence: an early-warning read (in the benchmark) when any single person/curator/network begins to overpower local and novel discovery, social-driven lift readable **separately** from public popularity, a hard rule that **no money buys rank**, and privacy/PII safety throughout (no public profiles for regular listeners, no tokens/PII in public responses, no Spotify writes).

## Outcome → PRD Map

Build order = outcome order here (the desired outcomes are already dependency-sequenced: the graph is the spine, attribution and curators sit on it, the ranking signal needs all three plus the Phase 11 model, and guardrails grade the result). Each cycle leaves the product coherent and demoable.

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 23 — Opt-In Social Graph](prds/prd-23-opt-in-social-graph.md) | 1 | The spine: a private, one-way, reversible follow edge (`listener_follows`) + an activity-sharing opt-in, on a `requireUserId()`-gated `app/api/me/*` API; nothing leaks into public/community responses. |
| C2 | [PRD 24 — Inner-Circle Attribution](prds/prd-24-inner-circle-attribution.md) | 2 | "Your people, not the crowd": show what followed-and-opted-in friends/curators are going to / firing, and share shows + song lists with your circle; turns PRD 17's `seeded_by_user_id` on-ramp into a visible, privacy-gated layer distinct from anonymous heat. |
| C3 | [PRD 25 — Curator & Influencer Profiles](prds/prd-25-curator-profiles.md) | 3 | Admin-promoted, first-class curator profiles with public top-lists + per-show picks, a "curated by" board signal, and follow-a-curator (a curator is a special followee). Replaces the "Curators — Coming soon" callout. |
| C4 | [PRD 26 — Social Signal in Discovery](prds/prd-26-social-signal-in-discovery.md) | 4 | A new, distinct, **off-by-default** `socialCircle` scoring component with its own dial — bounded so it can't drown local/novel — fed by the C1–C3 graph and built on the Phase 11 model; explainable + attributed in Insight / Trace. |
| C5 | [PRD 27 — Guardrails & Social Benchmark](prds/prd-27-social-guardrails-and-benchmark.md) | 5 (+ Phase 10 Outcome 3) | The accountability capstone: a benchmark read of social-driven lift **separate from** popularity, an influence-concentration early warning, the unit-tested "no money buys rank" + "social never drowns local/novel floor" invariants, and a PII/leak audit. Delivers the Discovery Benchmark's Social & Curator Benchmark (Outcome 3). |

## Delivery Sequence & Dependencies

```
C1 Opt-In Social Graph  (the spine; every other cycle plugs in here)
 ├──> C2 Inner-Circle Attribution      (reads follow edges + opt-in against activity)
 ├──> C3 Curator & Influencer Profiles (a curator is a special, admin-promoted followee)
 │
 └──> C4 Social Signal in Discovery     (needs C1 graph + C2/C3 activity + the Phase 11 model)
            └──> C5 Guardrails & Social Benchmark
                   (grades + enforces the signal C4 introduces; delivers Phase 10 Outcome 3)
```

- **C1 first** — the follow edge + sharing opt-in is the spine every other outcome plugs into; it ships value on its own (you can build and manage a private circle) without yet changing the board.
- **C2 and C3 both depend only on C1** and are independent of each other (re-orderable by priority). C2 surfaces friend activity; C3 introduces curators as a special, admin-promoted followee with a public persona. Recommended C2 → C3 (attribution proves the read path before adding the public-profile surface).
- **C4 depends on C1 + C2 + C3 and on the Phase 11 scoring model** — it is the first cycle that touches ranking; it must not ship before the graph and its activity reads exist.
- **C5 depends on C4** — you can only grade/guard a signal that exists. It is the safety capstone and the natural pairing with the Phase 10 benchmark (it delivers the still-unscoped Outcome 3 there).
- **Recommended order:** C1 → C2 → C3 → C4 → C5.

## Shared Architecture & Cross-Cutting Design

Decided once here; inherited by every cycle PRD.

### The graph is private by construction

- **One table, one-way edges.** `listener_follows (follower_user_id, followee_user_id, status, created_at)`, unique on `(follower_user_id, followee_user_id)`, `on delete cascade` on both FKs to `users(id)`. Following is one row; unfollowing deletes it (reversible). There is **no** "followers list" exposed to a followee beyond aggregate counts the followee opts into seeing.
- **Visibility = follow edge AND followee opt-in.** A follower may see a followee's activity only when an active follow edge exists **and** the followee has turned on activity-sharing. Curators are the exception by design: promoting a listener to curator makes their *curated picks* a public persona (Outcome 3), but a curator's private going/firing still follows the same opt-in rule unless surfaced as an explicit curated pick.
- **No leakage into public/community responses — ever.** Follow edges, follower/followee identities, and "your people" attribution are returned only from `requireUserId()`-gated `app/api/me/*` (and curator-public surfaces for *curated picks* only). They never appear in `app/api/community/*`, `app/api/events/[id]/*`, OG images, or the anonymous board payload.

### Activity-sharing opt-in (the consent switch)

- A single, clearly-worded **activity-sharing preference** ("Let people you approve see what you're going to / firing"), **off by default**, stored alongside the existing listener preferences (extend `listener_discovery_preferences` / the `app/api/me/listener-preferences` surface rather than a bespoke table). Turning it off instantly removes the listener from all "your people" reads. This is distinct from, and does not affect, the existing anonymous public heat (the crowd always saw counts; this never changes that).

### Reuse the activity sources — don't duplicate state

- "Going / firing" attribution is computed by **joining the follow graph against existing `event_person_event_state`**, not by writing a new per-event social store. Shared song attribution turns the existing `event_shared_songs.seeded_by_user_id` into a *gated* "your people shared this" read via the established public-stripping core (`lib/shared-songs-core.ts`) — the public path stays unattributed; only an opted-in follower's authenticated read attributes it.

### Curators are a special followee, not a parallel system

- Curator status is an **admin-granted flag/role on an existing user** (admin-moderation pattern, `app/api/admin/*`), not a separate identity. A curator's profile, top-lists, and per-show picks are an intentional **public persona**; following a curator is the **same** `listener_follows` edge as following a friend, so C4's ranking signal treats both uniformly. Regular listeners get **no** public profile.

### Discovery signal: distinct, bounded, off by default

- The social signal is a **new** `ListenerPreferenceKey` (`socialCircle`, "Your people") — **separate** from `socialHeat` ("the crowd") — added to `lib/listener-preferences.ts`, `lib/discovery.ts`, Insight, and Trace. Unlike the default-100 dials it is **off by default** (`DEFAULT_LISTENER_WEIGHTS.socialCircle = 0`): a listener must opt in by raising the dial. Its base is **capped** below a ceiling chosen so it cannot displace the local/novel exploration floor from Phase 11; **no money path** can set or raise it. It is **anonymous-null** (anonymous and not-opted-in sessions get exactly 0 from this component, so the anonymous board is byte-for-byte unchanged).

### Explainability & correctability by default

- Every cycle that adds or changes a signal must (a) surface it with a truthful, **private-safe** reason string in event reasons + the **Listener Trace** breakdown — attributed to *the specific friends/curators* that drove the change ("3 people you follow are going") without leaking anyone outside the viewer's own circle, and (b) keep the underlying consent **reversible** (unfollow, turn off sharing, lower the dial). No social inference ships as an opaque black box.

### Cross-cutting requirements (apply to every cycle)

- **Privacy / PII (mandatory, the headline risk).** No public profiles for regular listeners; follow edges and "your people" attribution never appear in public/community/OG responses; no tokens/PII alongside `session_id`/`user_id`; OAuth tokens never leave the server; reasons attribute counts/curators, never private identities outside the viewer's circle.
- **Security at inception (mandatory).** All new first-party code passes a Snyk code scan before "done"; fix and rescan until clean. New public-adjacent surfaces (curator profiles) inherit admin moderation.
- **No pay-to-play.** No code path lets money set, raise, or bias rank or curator status; asserted and unit-tested in C5.
- **No Spotify writes.** Read-only scopes only; the parked write Outcome stays untouched.
- **$0 constraint.** No new paid hosting/database/storage/API; stack stays Vercel Hobby + Neon free Postgres. New tables are additive and follow the `db/migrate-missing-tables.sql` precedent (tolerate not-yet-migrated tables, degrade to empty).
- **Anonymous-first preserved.** Browsing, reacting, and contributing never require login; the entire social layer is an optional, signed-in add-on; the anonymous board payload and ranking are unchanged.
- **Architecture registration.** Every new table/route is registered in `lib/system-registry.ts` with a correct `sourceOfTruth` (+ `countKey` where countable); `npm run generate:system-map` re-run and `npm run test:registry` green.
- **Validated, not guessed.** Every scoring/attribution change appears in **Recommendation Insight** and **Listener Trace**; social lift is graded separately from popularity in the Social & Curator Benchmark (C5).
- **Test coverage.** Pure logic (visibility gating, public-stripping, the social component + its cap) is unit-tested; the discovery suite stays green.

## Cross-Cutting Risks

- **Privacy leak (the central risk).** A person-to-person graph creates the first way one listener's activity could reach another. Mitigated by the "follow edge AND opt-in" rule, off-by-default sharing, public-stripping cores, the no-leak-into-public invariant, and a dedicated PII/leak audit in C5.
- **Influence concentration / domination.** A single popular curator or tight network could overpower local/novel discovery. Mitigated by the hard cap on the `socialCircle` component, off-by-default opt-in, the preserved Phase 11 exploration floor, and the C5 benchmark early-warning that reads social lift separately and flags concentration.
- **Pay-to-play creep.** Any "promote me" pressure on curators/ranking. Mitigated by admin-only curator promotion, $0 maintained, and the unit-tested "no money buys rank" invariant.
- **"Your people" mistaken for "the crowd."** Conflating the social signal with anonymous heat would double-count popularity and muddy the board. Mitigated by a **distinct** component + dial + reasons, and benchmark separation of the two.
- **Filter-bubble coupling with Phase 11.** Social signal stacked on personalization could narrow the board. Mitigated by social being off by default, capped below the exploration floor, and benchmarked for diversity/novelty regression alongside Initiative A.
- **Brownfield regression.** Changes touch the hot discovery path and public event pages. Mitigated by additive, anonymous-null edits; the anonymous board stays byte-for-byte unchanged at every step.

## Initiative-Level Success Criteria

- A signed-in listener can **follow friends/curators**, see their followed circle's **going/firing**, and **share shows/song lists** — all opt-in and private by default.
- **Curator profiles** exist with public top-lists and per-show picks and a **"curated by"** board signal; the homepage "Curators — Coming soon" callout is replaced by the real surface; regular listeners have **no** public profile.
- Trusted-circle / curator activity can **optionally and tunably** influence ranking via its **own** dial (off by default), **distinct from** public `socialHeat`, **capped** so it never drowns local/novel discovery — visible and attributed in Recommendation Insight / Listener Trace.
- The benchmark reads **social-driven lift separately from popularity** and **warns on influence concentration**; **no pay-to-play path exists** (unit-tested); the local/novel floor from Initiative A **holds** with social signal on.
- No tokens or PII leak in public responses; no public profiles for regular listeners; **no Spotify writes**; all new code passes Snyk; the whole initiative ships at **$0**.

## Open Decisions & Assumptions

- **Assumed:** the activity-sharing opt-in lives on the existing `listener_discovery_preferences` / `app/api/me/listener-preferences` surface rather than a bespoke table; finalized in C1.
- **Assumed:** "your people" going/firing is **live-computed** by joining `listener_follows` against `event_person_event_state` (with caching), consistent with the live-first $0 posture — no denormalized social-activity table unless C2/C4 shows a measured perf problem (decided in C2).
- **Assumed:** curator status is an admin-granted role/flag on `users` (+ a small `curators` profile table for the public persona), not a separate account type; self-serve onboarding was deferred (locked) for this initiative — now **un-deferred and scoped as Phase 13** ([Curator Onboarding & Self-Management](curator-onboarding-prd.md), PRDs 29–33).
- **Assumed:** the social ranking signal is a **new** `socialCircle` `ListenerPreferenceKey` with `DEFAULT_LISTENER_WEIGHTS.socialCircle = 0` (off by default) — the first dial that does not default to 100; revisit only if listeners need finer friend-vs-curator weighting (candidate follow-up).
- **Assumed:** C5 delivers the Phase 10 Discovery Benchmark **Outcome 3 (Social & Curator Benchmark)**, keeping the benchmark live-only / no-new-tab and recording dated markdown snapshots at ship (consistent with PRD 22).
- **Assumed:** PRD numbering continues the existing sequence (**23–27**) and this registers as **Phase 12**; cycle labels C1–C5 are scoped to this initiative.
- **Open:** the exact `socialCircle` cap, the going-vs-firing-vs-curated-pick weighting within it, the curator top-list size, and the influence-concentration warning threshold — to be set with concrete values in C4/C5 and tuned against the benchmark.
</content>
</invoke>
