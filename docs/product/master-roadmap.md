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
| 7 | [Admin Portal Initiative (Epic)](admin-portal-prd.md) | Planned | Turn `/admin` into a visual, live, explainable operating system; PRDs 06–11 across six cycles. |

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
- Auth.js, anonymous sessions, community tables, music connection tables, and Spotify profile tables exist in Aiven production.
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

## Scaling Milestones & Tracking

Analytics are actively running via **Umami Cloud** to monitor Unique Visitors (proxy for WAU/MAU) without heavy cookies or breaking the $0 constraint.

| Metric Threshold | Triggered Action | Status |
| --- | --- | --- |
| **WAU < 10** | Keep Vercel OG image generation fully dynamic (no caching). | Current |
| **WAU > 100** or **Events > 5,000/mo** | Implement Next.js `revalidate = 3600` on `opengraph-image.tsx` and `twitter-image.tsx` to cache Satori image generation and avoid Vercel compute limit overages. | Parked |
| **Events > 10,000/mo** | Umami Cloud Free Tier limit reached. Transition to self-hosted Umami on a $5/mo VPS or upgrade Umami tier. | Parked |

## Implementation Reference

See [Architecture Reference](architecture-reference.md) for current routes, components, storage behavior, and the Aiven production persistence path.

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
