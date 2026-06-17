# AVL Music Companion Master Roadmap

## Desired Outcome

Build a lightweight, zero-cost-first web app that turns upcoming AVLgo music listings into a community-powered discovery board for Asheville shows.

The app should help visitors quickly see who is playing soon, which artists have community context, which shows people are considering, and where to start listening before deciding to go.

## Planning Package

Use this document as the master tracker. The focused PRDs live in `docs/product/prds/`.

| Phase | PRD | Status | Purpose |
| --- | --- | --- | --- |
| 0 | [Deployment and Auth Investigation](prds/prd-05-deployment-auth-investigation.md) | Documented | Choose a $0 starting stack and evaluate future auth options. |
| 1 | [MVP Event Discovery Board](prds/prd-01-mvp-event-discovery-board.md) | Built | Pull AVLgo events and display the rolling 21-day show board. |
| 2 | [Community Contributions and Reactions](prds/prd-02-community-contributions-and-reactions.md) | Built | Add song recs, notes, going signals, and fire signals. |
| 3 | [Admin Moderation](prds/prd-03-admin-moderation.md) | Built | Let a trusted admin hide spam or bad submissions. |
| 4 | [Voice Memos](prds/prd-04-voice-memos.md) | Deferred | Add short audio contributions after a $0 storage path is selected. |
| 5 | [Personalized Discovery Backlog](personalized-discovery-backlog.md) | Built | Add best-bet filters, sorting, and optional Spotify taste-aware recommendations. |
| 7 | [Admin Portal Initiative (Epic)](admin-portal-prd.md) | Shipped | Turn `/admin` into a visual, live, explainable operating system; PRDs 06–11 across six cycles. |
| 8 | [Saved/Favorites & Genre Initiative (Epic)](saved-favorites-genre-prd.md) | Shipped | Private Saved space (events/venues/artists) + richer genre matching (taxonomy + Spotify genres); PRDs 12–16 across five cycles. |
| 9 | [Shared Listening (PRD 17)](prds/prd-17-shared-listening.md) | Shipped | Going/Fire by a signed-in Spotify listener auto-populates the event page with a public, playable shared song list (read-only Spotify; no writes). Opens the Social Music Sharing track. |
| 10 | [Discovery Benchmarking (Desired Outcomes)](discovery-benchmark_desiredoutcomes.md) | C1 Shipped | Turn the shipped Recommendation Insight + Listener Trace surfaces into a repeatable, fixed-methodology discovery benchmark (live-only / $0; no new tab). Validation layer for the deeper-personalization and social/curator future directions. **C1 (PRD 22, Discovery Baseline) shipped**; Outcomes 2–3 remain unscoped. |
| 11 | [Deeper Personalization Initiative (Epic)](deeper-personalization-prd.md) | Shipped | Learn from what a listener *skips*, not just taps: move from the flat "recent 240 actions" model to a time-decayed, per-dimension taste model that safely uses implicit signals, stays explainable/correctable, and is loop-proof. Initiative A of the discovery North Star; PRDs 18–21 across four cycles. |
| 12 | [Social / Curator Graph (Epic)](social-curator-prd.md) | Planned (scoped) | Opt-in follow/curator graph + inner-circle attribution; trusted-circle/curator activity as an optional, bounded ranking input distinct from public heat. Privacy-first, no pay-to-play, no Spotify writes. Initiative B of the discovery North Star; PRDs 23–27 across five cycles. |

> Phase 6 (Personalized Discovery V2 — per-person learning, removed-event memory, account+cookie state) shipped inside the Phase 5 backlog; see [Personalized Discovery Backlog](personalized-discovery-backlog.md).

## Product Principles

- Keep the initial cost at `$0`.
- Prefer low-friction participation over full social networking.
- Do not require accounts for the MVP.
- Treat the primary object as an event unless AVLgo API discovery proves that artist-first is safer.
- Keep AVLgo as the source of truth for event listings.
- Preserve community contributions across event refreshes.
- Make every public page work well on mobile.
- Keep authentication optional and add it only when it unlocks clear value.

## Phased Roadmap

### Phase 0: Deployment and Auth Investigation

Purpose: avoid choosing a stack that breaks the `$0` constraint or makes future auth painful.

Required outputs:

- Current free-tier decision memo for hosting, database, storage, and auth: [Deployment and Auth Investigation](deployment-auth-investigation.md).
- Explicit recommendation for the first build stack.
- Auth feasibility notes for Google, plain email, Spotify, Apple Music, and AVLgo.
- Risks around Apple Music and AVLgo auth clearly called out.
- Confirmation that the selected first stack can launch at `$0`.

### Phase 1: MVP Event Discovery Board

Purpose: make the site useful before community features exist.

Required outputs:

- Rolling 21-day list of AVLgo music events.
- Homepage sorted by soonest show first.
- Event detail pages with shareable URLs.
- Basic normalized event store.
- Daily refresh behavior.

### Phase 2: Community Contributions and Reactions

Purpose: add the human layer around the listings.

Required outputs:

- Song recommendations.
- Short text notes.
- "Thinking of going" reaction.
- Fire/excitement reaction.
- Counts visible on homepage cards and detail pages.

### Phase 3: Admin Moderation

Purpose: keep anonymous participation safe enough to run.

Required outputs:

- Password-protected admin page.
- Recent contribution list.
- Hide/unhide controls.
- Basic anti-spam controls.

### Phase 4: Voice Memos

Purpose: support short personal audio context once storage and moderation are ready.

Production status: deferred for the first Vercel/Aiven launch. No voice memo upload or playback surface is active.

Required outputs:

- 60-second max voice memo contribution.
- Browser recording with upload fallback.
- Audio playback on event detail pages.
- Admin ability to hide voice memos.

### Phase 5: Personalized Discovery Backlog

Purpose: make the large event feed easier to navigate with best-bet filters, sorting, and optional Spotify taste-aware recommendations.

Build goal: help a visitor answer "which upcoming show is most worth checking out for me?" from the homepage. Anonymous users should get stronger public-signal recommendations, and Spotify-connected users should get best-match boosts from synced taste rows.

Current production inputs as of June 6, 2026:

- Anonymous browsing, reactions, and contributions remain live and do not require login.
- Optional Spotify sign-in is live on `https://avlmc.vercel.app/`.
- Auth.js, anonymous sessions, community tables, music connection tables, and Spotify profile tables exist in Neon production (migrated from Aiven June 16, 2026 for connection pooling; see [Deployment and Auth Investigation](deployment-auth-investigation.md)).
- A signed-in Spotify account can sync 20 top artists and 20 top tracks into `music_profile_items`.
- OAuth tokens stay server-side in Auth.js `accounts`; discovery code should use normalized profile rows.

Built outputs:

- Ranked search, venue, date, tag, popularity, and intent filters that scale past the large AVLgo venue/tag set.
- Sort options such as soonest, most discussed, hottest, Best Bets, and Spotify-backed Best Match.
- Recommendation scoring based on event timing, community signals, event metadata, and optional normalized Spotify profile rows.
- Clear privacy controls, including sync, disconnect, delete music data, and opt out.
- Manual music links remain available for everyone; provider-backed linking starts with Spotify search/select.
- Google/YouTube and Apple Music remain later connectors.

See [Personalized Discovery Backlog](personalized-discovery-backlog.md) for next-plan notes and acceptance targets.

### Phase 7: Admin Portal & Operations

Purpose: evolve the existing `/admin` dashboard from a static text/card view into a visual, live, explainable operating system for the whole product — usable by Brett (a visual learner) and by AI agents/developers.

This is a multi-cycle initiative tracked by the [Admin Portal Initiative (Epic)](admin-portal-prd.md), which decomposes the seven desired outcomes in [`AdminPortal_desiredoutcomes.md`](AdminPortal_desiredoutcomes.md) into six dependency-sequenced cycles. Each cycle is an independently shippable PRD:

| Cycle | PRD | Outcome(s) | Status |
| --- | --- | --- | --- |
| C1 | [PRD 06: Platform & Architecture Foundation](prds/prd-06-admin-portal-platform-and-architecture.md) | Living Architectural Reference; Shared Understanding for Humans and Agents | **Shipped** |
| C2 | [PRD 07: System Health & Connection Visibility](prds/prd-07-system-health-and-connection-visibility.md) | System Health and Connection Visibility | **Shipped** |
| C3 | [PRD 08: Content & Data Stewardship](prds/prd-08-content-and-data-stewardship.md) | Content and Data Stewardship | **Shipped** |
| C4 | [PRD 09: Recommendation Quality & Listener Insight](prds/prd-09-recommendation-quality-and-listener-insight.md) | Recommendation Quality and Listener Insight | **Shipped** |
| C5 | [PRD 10: Listener Taste Knowledge Graph](prds/prd-10-listener-taste-knowledge-graph.md) | Listener Taste Knowledge Graph | **Shipped** |
| C6 | [PRD 11: Product Analytics & Usage Visibility (Umami)](prds/prd-11-product-analytics-umami.md) | Product Analytics and Usage Visibility | **Shipped** |

C1 ships first (it provides the System Registry and visual graph engine every later cycle reuses); C2/C3/C4/C6 are largely independent and re-orderable by priority; C5 is last by dependency. The initiative stays at `$0` and follows security-at-inception (Snyk) because it now exposes system internals and listener-adjacent data.

**C1 shipped:** typed System Registry (`lib/system-registry.ts`) as the architecture source of truth; an interactive, expandable architecture graph + Knowledge Graph re-pointed at it (`components/admin/`); an agent-readable JSON export (`GET /api/admin/system-map`) and generated [`system-map.generated.md`](system-map.generated.md); a registry drift-guard test (`npm run test:registry`); and the start of the `lib/admin/` service-layer split.

**C2 shipped:** a live **Health** tab (`components/admin/HealthSection.tsx`) backed by nine time-boxed, individually-degrading probes (`lib/admin/health.ts`) — database, event-data freshness, AVLgo feed, auth/Spotify config + staleness, both cron jobs, blob, Umami; cron observability via a `system_job_runs` table and recording in the sync routes; config-conflict detection (env names only); and health badges overlaid on the architecture graph.

**C3 shipped:** a **Stewardship** tab (`components/admin/StewardshipSection.tsx`, `lib/admin/stewardship.ts`) with record-level provenance/completeness/currency/connections for events, venues, artists, tags, and sources; a persisted, admin-managed partner/resource directory (`admin_resources` table, `lib/admin/resources.ts`, admin-gated `app/api/admin/resources`) replacing the placeholder partner slots; and a derived "should be connected but isn't" gap strip.

**C4 shipped:** a **Recommendation Insight** tab (`components/admin/InsightSection.tsx`, `lib/admin/insight.ts`) that re-runs the live scoring engine to explain why each event ranks (weighted components + reasons), compares anonymous vs. signed-in ranking via a synthetic public-derived taste profile (with movers), and reports diversity / local-value / signal-mix / coverage metrics plus the behavioral-signal mix.

**C6 shipped:** an **Analytics** tab (`components/admin/AnalyticsSection.tsx`, `lib/admin/analytics.ts`, `app/api/admin/analytics`) bringing Umami web traffic (visitors / pageviews / top pages / referrers, server-side, key never client-exposed) into the portal over a 24h/7d/30d range, joined with a first-party event funnel and conversions, plus a free-tier scaling-milestone indicator; degrades gracefully when Umami API access is absent.

**C5 shipped:** a **Listener Trace** tab (`components/admin/ListenerGraphSection.tsx`, `lib/admin/listener-graph.ts`, admin-gated `app/api/admin/listener-trace`) — a privacy-first, six-stage per-listener trace (identity → connected data → preferences → signals → settings → surfaced events) that reuses the C1 staged layout and C4 scoring to attribute each surfaced event's ranking to this listener's inputs vs. the anonymous baseline. No tokens/secrets are read or shown. **The Admin Portal initiative (Phase 7, all seven outcomes / six cycles) is complete.**

### Phase 8: Saved/Favorites & Richer Genre Matching

Purpose: let a signed-in listener keep a private **Saved** space for the events, venues, and artists they care about, and make the board's **genre understanding richer** for everyone — so the app both remembers what a person values and matches it more intelligently, while the public board stays fully usable without an account.

This is a multi-cycle initiative tracked by the [Saved/Favorites & Genre Initiative (Epic)](saved-favorites-genre-prd.md), which decomposes the desired outcomes in [`saved-favorites-genre_desiredoutcomes.md`](saved-favorites-genre_desiredoutcomes.md) into two independent tracks across five dependency-sequenced cycles. Each cycle is an independently shippable PRD.

| Cycle | PRD | Track | Outcome(s) | Status |
| --- | --- | --- | --- | --- |
| C1 | [PRD 12: Saved Foundation & Save Actions](prds/prd-12-saved-foundation-and-actions.md) | A — Saved/Favorites | 2, 5 | **Shipped** |
| C2 | [PRD 13: The Saved Space & Sign-In Nudges](prds/prd-13-saved-space-and-signin-nudges.md) | A — Saved/Favorites | 1, 3 | **Shipped** |
| C3 | [PRD 14: Favorites Strengthen Recommendations](prds/prd-14-favorites-strengthen-recommendations.md) | A — Saved/Favorites | 4 | **Shipped** |
| C4 | [PRD 15: Genre Taxonomy & Public Matching](prds/prd-15-genre-taxonomy-and-public-matching.md) | B — Genre | 6, 8 | **Shipped** |
| C5 | [PRD 16: Spotify Genre Signal](prds/prd-16-spotify-genre-signal.md) | B — Genre | 7 (completes 8) | **Shipped** |

Track A and Track B are independent and may interleave by priority. Within A, **C1 ships first** (the `saved_items` spine), then C2/C3 (independent of each other). Within B, **C4 ships first** (the genre taxonomy), then C5 (maps Spotify genres onto it). Recommended overall order: C1 → C4 → C2 → C3 → C5 — ship the two public/foundation wins early, then the deeper personalization. The initiative stays at `$0`, follows security-at-inception (Snyk), and requests **no new Spotify scopes**. Spotify library/playlist *write* actions (desired-outcome 9) are explicitly **parked**; see [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md).

**C1 shipped:** the Saved/Favorites spine — a private, polymorphic `saved_items` table (signed-in only, `on delete cascade`, normalized-name identity for venues/artists shared with discovery scoring), a `lib/saved-items.ts` service (`saveItem`/`removeSavedItem`/`listSavedItems`/`getSavedKeys`), a `requireUserId()`-gated `GET/POST/DELETE /api/me/saved-items`, and a reusable `SaveButton` (bookmark, distinct from going/fire/remove) wired into the event board cards (events) and event detail page (event/venue/artist). Saving is signed-in only; anonymous users get a minimal sign-in affordance (the action-preserving nudge is C2). Saved data is private and never appears in public responses. Registered in the System Registry; Snyk-clean; $0. Unblocks C2 (Saved space) and C3 (favorites → recommendations).

**C5 shipped:** Spotify genre signal for connected listeners — top-artist `genres[]` are now captured at sync into an additive `music_profile_items.genres` column (no new scope, no re-auth; graceful fallback before re-sync). `buildSpotifyGenreAffinity` resolves them onto the C4 taxonomy and `scoreSpotifyGenreMatch` layers a bounded boost onto the `genreMatch` base for aligned events, tuned by the existing `genreMatch` weight and gated by opt-out/disconnect. A private-safe `matches your top genres` reason explains the boost without exposing the listener's genres. Visible in Insight/Trace; unit-tested; Snyk-clean; $0. **This completes the Saved/Favorites & Genre initiative (Phase 8, all eight outcomes / five cycles).**

**C2 shipped:** the Saved space and action-preserving sign-in nudge — a signed-in-only `/saved` view (`app/saved/page.tsx`, `components/saved/SavedSpace.tsx`) with three private lists (Events/Venues/Artists), counts, empty states, working links, and inline un-save; anonymous visitors are redirected to sign-in with a return path. An anonymous fire/plan/remove still applies and surfaces a dismissible nudge that carries the pending action through OAuth (`keepIntent` callback) and replays it once against the account (idempotent), then offers a one-tap save. Reachable via a "View saved" link in the listener profile. Browsing/reacting/contributing stay anonymous. Registered in the System Registry; Snyk-clean (incl. clearing a ReDoS false positive in the board filters); $0.

**C3 shipped:** favorites strengthen recommendations — `scoreDiscoveryEvents` now takes the listener's saved venues/artists (`savedFavorites`) and feeds them into the existing `venuePreference` / `artistAffinity` bases via `fieldMatchStrength`, with a direct baseline term (default-effective, mirroring the Spotify match) that the existing weights dial 0×–2× and can cancel. Bounded by existing ceilings, deduped against equivalent ad-hoc custom signals, and surfaced as `saved venue` / `saved artist` reasons. Loaded for the traced listener so the contribution is attributable in Listener Trace; threaded into the board's client re-score. No new control; anonymous ranking unchanged. Unit-tested; Snyk-clean; $0.

**C4 shipped:** a real genre taxonomy — `lib/genre-taxonomy.ts` (20 canonical genres, alias/synonym map, symmetric parent/child relationships; pure and client-safe) replaces discovery's hardcoded 15-term list. `scoreGenreMatch` resolves event title/artist/tags into canonical genres (catching alias-tagged events like `rnb`→soul, `singer-songwriter`→folk) while preserving its calibrated output ceiling, emits compact truthful reasons (`genre match: jazz / soul`) for everyone including anonymous users, and still respects the existing `genreMatch` weight (no new control). Board genre quick filters route through the taxonomy. Unit-tested (`test:taxonomy`) and validated against the discovery suite; registered in the System Registry; Snyk-clean; $0. Unblocks C5 (Spotify genres map onto this taxonomy).

### Phase 9: Social Music Sharing

Purpose: turn an engaged listener's taste into a shared, social layer on the board — starting
with making the event page **immediately listenable** when someone signals interest.

**C1 shipped — [PRD 17: Shared Listening](prds/prd-17-shared-listening.md):** when a signed-in,
Spotify-connected listener clicks **Going** or **Fire**, the app resolves the event artist's own
Spotify top tracks (read-only; `getSpotifyArtistTopTracks`) and seeds them into a public, deduped
`event_shared_songs` list rendered as Spotify embeds on the event detail page and a compact,
lazy-loaded affordance on board cards. A signed-in viewer's own top tracks badge matches with
"you already love this one" (per-viewer, server-side, never sent to anonymous viewers). Seeding is
best-effort (a Spotify failure never breaks the reaction); the list is **unattributed** this cycle,
with `seeded_by_user_id` stored server-side only as the on-ramp to a future **inner-circle**
attribution layer. Save stays private (it does not trigger sharing). No new OAuth scope, no re-auth;
outside discovery scoring; admin-moderatable; Snyk-clean; $0. This is a **read/share** feature and
remains distinct from the parked Spotify *write* Outcome 9.

### Phase 10: Discovery Benchmarking (planned)

Purpose: turn the admin portal's shipped discovery-inspection surfaces into a *benchmark* — a
repeatable, fixed-methodology read of how discovery performs — so future personalization and
social changes can be measured against a known baseline.

Desired outcomes are captured in [`discovery-benchmark_desiredoutcomes.md`](discovery-benchmark_desiredoutcomes.md):
(1) **Discovery Baseline** (the detailed first phase — a fixed-methodology live reading of
anonymous ranking, listener behavior, engagement, diversity, novelty, local relevance, and signal
coverage), (2) **Deeper Personalization Benchmark**, and (3) **Social & Curator Benchmark**. It
homes in the existing **Recommendation Insight** (aggregate) + **Listener Trace** (drill-down) +
**Overview** (summary link) surfaces — **no new tab** — and stays **live-only / $0** (no snapshot
store; history is recorded as dated markdown snapshots at ship time). This is the validation layer
for the two "Future Direction" sections in [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md).

**C1 shipped (PRD 22 — Discovery Baseline):** Recommendation Insight is now a repeatable,
fixed-methodology **baseline reading** (`lib/admin/insight.ts`, `components/admin/InsightSection.tsx`,
pure helpers in `lib/admin/insight-metrics.ts`). A pinned **methodology** strip states the event
window, `SCORER_VERSION` (`v11.4`, new constant in `lib/discovery.ts`) + git commit, and a **stable
committed synthetic profile** (`SYNTHETIC_TASTE_SEED`, regenerated intentionally) that replaces the
drift-prone window-derived seed — so the anonymous-vs-signed-in comparison moves only when the
algorithm changes. New baseline metrics (novelty share, engagement heat + top-N concentration,
impression non-conversion share) join the existing diversity/local-value/coverage/signal-mix, each
with a plain-language definition. **Recording without storage**: a `serializeBaselineMarkdown`
helper + a "Copy baseline reading as markdown" button emit a dated, paste-ready snapshot (first one
recorded in [PRD 22](prds/prd-22-discovery-baseline.md)). An **Overview discovery-health card** links
into Insight. Descriptive framing only (never a single quality score). Unit-tested; Snyk-clean; $0;
no new table/route/tab. Outcomes 2 (Deeper Personalization Benchmark) and 3 (Social & Curator
Benchmark) remain unscoped until those tracks are prioritized.

### Phases 11–12: Discovery North Star — Deeper Personalization & Social/Curator (planned)

North Star: evolve discovery from "ranks what you tap" to "understands your taste **and** your
trusted circle" — learning from skips, modeling taste per-dimension over time, and letting
friends/curators shape the board — all opt-in, explainable, $0, and without ever drowning out local
and novel shows. These are the two feature initiatives the Phase 10 benchmark exists to grade.

- **Phase 11 — Deeper Personalization Scoring** (outcomes: [`deeper-personalization_desiredoutcomes.md`](deeper-personalization_desiredoutcomes.md);
  epic: [`deeper-personalization-prd.md`](deeper-personalization-prd.md)):
  five outcomes — skips shape ranking (implicit signal from impressions), a time-decayed
  per-dimension taste model, cold-start + anonymous→account hand-off, explainable/correctable
  signals, and structural feedback-loop protection. The scoring substrate. Storage is live-first
  (rollup table only if measured perf demands it). Decomposed into four cycles:
  C1 [PRD 18 Skips Cool Dimensions](prds/prd-18-skips-cool-dimensions.md) →
  C2 [PRD 19 Time-Decayed Per-Dimension Model](prds/prd-19-time-decayed-affinity-model.md) →
  C3 [PRD 20 Cold-Start & Account Hand-off](prds/prd-20-coldstart-and-account-handoff.md) →
  C4 [PRD 21 Transparency, Correctability & Loop Guardrails](prds/prd-21-transparency-and-loop-guardrails.md).

  **C1 shipped (PRD 18 — Skips Cool Dimensions):** discovery now reads the previously-ignored
  `impression` stream (`listImplicitSignals`, `lib/discovery-memory.ts`, bounded 90-day window) and
  cools an artist/venue/genre a listener is repeatedly shown but never engages
  (`scoreImplicitSignals`, `lib/discovery.ts`) — recency-decayed, per-dimension, capped strictly
  below the explicit `remove` magnitude, overridden by any explicit positive, and never hiding an
  event. Truthful "you tend to skip these" reasons + per-dimension attribution in Listener Trace and
  Recommendation Insight. Live-first ($0, no new table); Snyk-clean; the cap-below-`remove` invariant
  is unit-tested. Establishes the implicit-signal mechanism that C2 (PRD 19) generalizes.

  **C2 shipped (PRD 19 — Time-Decayed Per-Dimension Taste Model):** the flat "recent 240 equally-
  weighted signals" learned term is replaced by recency-decayed, confidence-weighted per-dimension
  affinities (`buildTasteModel`/`scoreTaste*` in `lib/discovery.ts`) for **artist/venue/genre** —
  blended short-term-intent (10d) + long-term-taste (120d) half-lives, saturating confidence
  weighting, routed through the existing 0–200 dials (weight 0 fully cancels a dimension) and the same
  per-dimension bases the C1 cooling feeds. Truthful per-dimension reasons; explicit `remove` stays
  dominant. Storage decision recorded: **live-first, no rollup table** (within budget at current
  scale; rollup remains the measured-only escape hatch). Time-of-week/price/indoor-outdoor dimensions
  deferred to land with C4. Live-first ($0); Snyk-clean; recency/confidence/cancellation unit-tested.

  **C3 shipped (PRD 20 — Cold-Start & Account Hand-off):** a durable, idempotent session→account
  hand-off (`migrateSessionSignalsToUser` in `lib/discovery-memory.ts`) wired into the Auth.js
  `events.signIn` callback (`auth.ts`) — on sign-in, a browser's anonymous `event_interaction_events`
  + `event_person_event_state` are re-keyed to the account (log blind re-keyed; per-event state merged
  with `GREATEST`, keeping the strongest/most-recent state; leftover session rows dropped), so signing
  in is continuity, not a reset. Idempotent (a second run is a no-op), transactional, tolerant of a
  missing table, and best-effort so it never blocks sign-in. Cold-start parity confirmed: the C2
  confidence weighting keeps a thin history public-dominated (unit-tested). Live-first ($0); Snyk-clean.

  **C4 shipped (PRD 21 — Transparency, Correctability & Loop Guardrails):** the binary novelty bonus
  is replaced by a **guaranteed exploration floor** (`lib/discovery.ts`) — a smooth, default-active
  boost for under-the-radar shows, tunable by the `novelty` dial, plus a pure `enforceExplorationFloor`
  that reserves a minimum novel share of any top-N (applied in Recommendation Insight). The
  "explicit > implicit" invariant is enforced: a global per-event implicit cap (28) sits below the
  explicit `remove` envelope (56), and a listener **boost correction** (reusing the custom-signal
  channel — no new table) suppresses implicit cooling on that dimension. Per-dimension transparency
  from C1/C2 carries the attribution; the flat learned term is now a derived roll-up. Unit-tested
  (correction-wins, floor guarantee, cap invariant); Snyk-clean; $0. **Phase 11 — the Deeper
  Personalization initiative (all five outcomes / four cycles C1–C4) is complete.**
- **Phase 12 — Social / Curator Graph** (outcomes: [`social-curator_desiredoutcomes.md`](social-curator_desiredoutcomes.md);
  epic: [`social-curator-prd.md`](social-curator-prd.md)):
  five outcomes — an opt-in social graph, inner-circle attribution (building on PRD 17's
  `seeded_by_user_id` on-ramp), admin-promoted curator profiles, an optional bounded social ranking
  signal distinct from public heat, and guardrails (no pay-to-play, no domination, no leaks, no
  Spotify writes). Layers on top of Phase 11's scoring model. **Now scoped** into an epic + five
  dependency-sequenced cycle PRDs (23–27):

  | Cycle | PRD | Outcome(s) | Status |
  | --- | --- | --- | --- |
  | C1 | [PRD 23 — Opt-In Social Graph](prds/prd-23-opt-in-social-graph.md) | 1 | **Shipped (Jun 17, 2026)** |
  | C2 | [PRD 24 — Inner-Circle Attribution](prds/prd-24-inner-circle-attribution.md) | 2 | **Shipped (Jun 17, 2026)** |
  | C3 | [PRD 25 — Curator & Influencer Profiles](prds/prd-25-curator-profiles.md) | 3 | **Shipped (Jun 17, 2026)** |
  | C4 | [PRD 26 — Social Signal in Discovery](prds/prd-26-social-signal-in-discovery.md) | 4 | **Shipped (Jun 17, 2026)** |
  | C5 | [PRD 27 — Guardrails & Social Benchmark](prds/prd-27-social-guardrails-and-benchmark.md) | 5 (+ Phase 10 Outcome 3) | **Planned** |

  C1 ships the follow-graph spine; C2 (attribution) and C3 (curators) both build on it and are
  independent of each other; C4 adds the off-by-default, capped `socialCircle` ranking component (needs
  C1–C3 + the Phase 11 model); C5 is the guardrail/benchmark capstone and delivers the Discovery
  Benchmark's Social & Curator Benchmark (Phase 10, Outcome 3). Recommended order: C1 → C2 → C3 → C4 → C5.

  **C1 shipped (Jun 17, 2026):** the private follow-graph spine is live — a one-way, reversible
  `listener_follows` edge + an off-by-default `share_activity` opt-in on `listener_discovery_preferences`,
  managed through a `requireUserId()`-gated `app/api/me/follows`. `lib/social-graph.ts` exposes only
  entitlement-scoped reads (who I follow, my follower count, the `canViewActivityOf` gate) — never a
  regular listener's follower identities — with the pure visibility rule in `lib/social-graph-core.ts`.
  A reusable `FollowButton` is ready for C2/C3 to place. No follow/sharing data leaks into any
  public/community/OG response; the board ranking and anonymous payload are byte-for-byte unchanged.
  Registry (`svc-social-graph`, `db-listener-follows`, `api-follows`) + system map updated; tests,
  typecheck, lint, build, and Snyk green; $0.

  **C2 shipped (Jun 17, 2026):** the "your people, not the crowd" read layer is live with **no new
  table**. `lib/social-activity.ts` live-joins the C1 graph against existing `event_person_event_state`
  (going/firing) and `event_shared_songs.seeded_by_user_id` (shared songs), gated at the SQL join by
  the active edge **and** `share_activity`; `seeded_by_user_id` resolves to a name server-side and is
  never shipped raw. Surfaces: a "People you follow" strip + `sharedBy` attribution + "Share with your
  circle" on the event detail page, and a compact "👥 N from your circle" board badge (signed-in +
  entitled only; one batched query/page). New APIs `/api/me/circle-activity` + `/api/me/circle-share`;
  `/api/events/[id]/shared-songs` attributes only for entitled viewers (anonymous stays the PRD 17
  shape). Gating at read time means turning sharing off / unfollowing removes visibility instantly.
  Registry (`svc-social-activity`, `api-circle-activity`, `api-circle-share`) + map updated; tests,
  typecheck, lint, build, and Snyk green; $0.

  **C3 shipped (Jun 17, 2026):** admin-promoted curator profiles are live. New `curators` +
  `curator_picks` tables (picks carry **no FK to events** — daily re-ingest would cascade-delete them —
  snapshotting `event_title` and resolving live metadata via a tolerant join, per the contributions
  precedent). `lib/curators.ts` serves a public directory (`/curators`), per-handle profiles
  (`/curator/[handle]` with top-list + picks + a Follow button on the C1 edge), and a batched
  "curated by [handle]" board/detail signal; admin promote/hide + pick management via
  `/api/admin/curators` + `/admin/curators`. The "Curators — Coming soon" callout is replaced by the
  live surface. Public reads expose only the persona + visible picks (never private going/firing, never
  a non-curator listener). Registry (`svc-curators`, `db-curators`, `db-curator-picks`, `api-curators`,
  `api-admin-curators`, `ui-curator-profile`) + map updated; tests, typecheck, lint, build, and Snyk
  green; ranking unchanged this cycle; $0.

  **C4 shipped (Jun 17, 2026):** trusted-circle / followed-curator activity is now an optional,
  distinct, bounded ranking input. A new **off-by-default** `socialCircle` dial (first weight to
  default to 0) drives a new scoring component in `lib/discovery.ts` — saturating, sourced only from
  the viewer's own circle (C2 going/firing + C3 followed-curator picks), **distinct from** anonymous
  `socialHeat`, and **hard-capped** (`SOCIAL_CIRCLE_CAP = 10`) below the Phase 11 exploration floor
  (`14`) so it nudges but can never evict the guaranteed novel/local share. Anonymous/dial-0 → 0
  (board byte-for-byte unchanged); `SCORER_VERSION` bumped to 12.4; reasons attribute in-circle
  friends/curators only ("3 people you follow are going", "picked by [curator]"), surfaced in
  Insight/Trace. `test:discovery` extended (cap-below-floor, saturation, ⊥`socialHeat`, anonymous-0);
  tests, typecheck, lint, build, and Snyk green; no pay-to-play; $0. **C5 (PRD 27 — Guardrails &
  Social Benchmark) is next — the accountability capstone.**

Both initiatives decompose into epic PRDs + cycle PRDs (Phase 11: PRDs 18–21, shipped; Phase 12: PRDs
23–27, scoped). Recommended overall build order interleaved the tracks: Phase 11 skips→ranking first
(highest leverage, shipped), then the social graph foundation, and the social ranking signal last (it
needs both the scoring model and the graph).

> **▶ WHAT'S NEXT (hand-off, June 17, 2026).** Phase 11 (Deeper Personalization, C1–C4) is **fully
> shipped**, **Phase 10 C1 (PRD 22 — Discovery Baseline) is shipped**, and **Phase 12 C1–C4 are now
> shipped** — the follow-graph spine (PRD 23), inner-circle attribution (PRD 24), curator profiles
> (PRD 25), and the off-by-default, capped `socialCircle` ranking component (PRD 26). The social signal
> now exists in ranking; only the accountability capstone remains. The dependency-unblocked candidate is:
> 1. **Phase 12 C5 — PRD 27 (Guardrails & Social Benchmark)** *(recommended next — build)*. Grades and
>    enforces the C4 signal: a benchmark read of social-driven lift **separate from** popularity, an
>    influence-concentration early warning, the unit-tested "no money buys rank" + "social never drowns
>    local/novel floor" invariants, and a PII/leak audit. Delivers the Discovery Benchmark's Social &
>    Curator Benchmark (Phase 10, Outcome 3). Needs C4 (shipped). Start:
>    [`prds/prd-27-social-guardrails-and-benchmark.md`](prds/prd-27-social-guardrails-and-benchmark.md).
> 2. **Phase 10 Outcome 2** (Deeper Personalization Benchmark). Extends the shipped baseline; stays
>    **unscoped** until prioritized. (Outcome 3 — Social & Curator Benchmark — is now scoped as Phase
>    12 C5 / PRD 27.) Start: [`discovery-benchmark_desiredoutcomes.md`](discovery-benchmark_desiredoutcomes.md).
> 3. **Small follow-up:** the deferred Phase-11 taste dimensions (time-of-week / price / indoor-outdoor)
>    — see [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md) → Remaining Follow-Up.
>
> **Baseline-seed note:** the Discovery Baseline's `SYNTHETIC_TASTE_SEED` (`lib/admin/insight.ts`)
> is pinned to recurring Asheville series; re-derive it from frequent listings at future
> discovery-change milestones (intentional regeneration), then record a fresh snapshot in PRD 22.
>
> **Cross-machine note:** these commits live on local `main` and are **not pushed** until you push.
> Run `git push` before driving `/orchestrator` from another machine, or it will read stale docs.

## Scaling Milestones & Tracking

Analytics are actively running via **Umami Cloud** to monitor Unique Visitors (proxy for WAU/MAU) without heavy cookies or breaking the $0 constraint.

| Metric Threshold | Triggered Action | Status |
| --- | --- | --- |
| **WAU < 10** | Keep Vercel OG image generation fully dynamic (no caching). | Current |
| **WAU > 100** or **Events > 5,000/mo** | Implement Next.js `revalidate = 3600` on `opengraph-image.tsx` and `twitter-image.tsx` to cache Satori image generation and avoid Vercel compute limit overages. | Parked |
| **Events > 10,000/mo** | Umami Cloud Free Tier limit reached. Transition to self-hosted Umami on a $5/mo VPS or upgrade Umami tier. | Parked |

## Implementation Reference

See [Architecture Reference](architecture-reference.md) for current routes, components, storage behavior, and the Neon production persistence path.

## Architecture Decision Records (ADRs)

- [ADR 001: Real-Time Taste Signals and Event State Persistence](adrs/0001-real-time-taste-signals-and-state-persistence.md)

## Hard Constraints

- No paid hosting, database, storage, auth, email, transcription, or API services in the first version.
- No paid Apple developer account, paid OAuth provider, or paid media storage unless explicitly approved later.
- No required user accounts in MVP; optional music sign-in must not block anonymous browsing or participation.
- No private messaging, profiles, ticketing, calendar integration, AI summaries, or personalized recommendations in MVP.

## Key Risks

- AVLgo API may not expose enough reliable music-event fields.
- AVLgo images hosted on Facebook CDNs expire and break. A lightweight ingestion or proxy solution is needed in the future.
- AVLgo may not provide auth or may not support third-party identity flows.
- Spotify is working as the first optional music identity/taste connector, but it should not become a required account gate.
- Apple Music auth may not work as general-purpose user identity.
- Apple Music integration may have developer-program or token requirements.
- Free storage may not be enough for voice memos, so audio is excluded from the first production release.
- Anonymous contributions may attract spam.

## Success Criteria

The planning package is ready when:

- Each phase has a focused PRD with scope, requirements, dependencies, risks, and acceptance criteria.
- The master roadmap explains sequencing and ownership of open decisions.
- The `$0` cost constraint is visible in every phase where it matters.
- Deployment and auth are treated as an investigation before implementation choices are locked.
