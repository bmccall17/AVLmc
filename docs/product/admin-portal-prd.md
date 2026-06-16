# Admin Portal Initiative — Master PRD (Epic)

Updated: June 15, 2026

## One-Sentence Goal

please follow the `admin-portal-prd.md` and evolve the existing `/admin` dashboard into a **living operating system for AVL Music Companion**: a visual, expandable, and explainable reference that lets a human or an AI agent understand how the product is wired, see whether it is healthy, trace how a listener's taste shapes their recommendations, steward the content ecosystem, and ground product decisions in real usage.

## How To Use This Document

This is the umbrella tracker for the Admin Portal build. It synthesizes the seven desired outcomes in [`AdminPortal_desiredoutcomes.md`](AdminPortal_desiredoutcomes.md) into a sequenced series of focused PRDs that live in [`prds/`](prds/). Treat this file the way [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md) serves Phases 5–6: the epic defines shared architecture, cross-cutting rules, and sequencing; each cycle PRD owns one coherent increment.

The original product brief for this work is [`avlmcadminportal.md`](avlmcadminportal.md). The seven outcomes it must satisfy are in [`AdminPortal_desiredoutcomes.md`](AdminPortal_desiredoutcomes.md). This epic supersedes neither; it operationalizes both.

## Current State (Brownfield Baseline)

The portal is **not greenfield**. A working, password-gated admin already ships in production:

- Route: `app/admin/page.tsx`, gated by `ADMIN_PASSWORD` + `ADMIN_SESSION_TOKEN` (`lib/admin.ts`, `isAdminSession`, `ADMIN_COOKIE_NAME`).
- UI: `components/AdminPortal.tsx` (~1,291 lines) with six tabs — **Overview, Architecture, Knowledge Graph, Gaps, Resources, Moderation** — plus a product-statement + social-identity header.
- Data: `lib/admin-data.ts` (~718 lines), `loadAdminDashboardData()` aggregates event stats, field completeness, venues, contribution stats, reaction/intent stats, user stats, music-connection stats, metadata stats, duplicate groups, weak-metadata events, interaction stats, and a `systemStatus` object.
- Moderation: existing `/api/admin/contributions` hide/unhide flow (PRD 03) is embedded as the Moderation tab.

What the baseline **does well**: it already surfaces a lot of aggregate truth (counts, weak records, duplicates, venue directory, env config) in one place.

What the baseline **does not yet do** — and what the seven outcomes demand:

1. **Architecture & Knowledge Graph are static text/cards** (`PipelineStage`, `DepRow`, expandable entity rows), not the *visual, expandable, traceable* graph the outcomes call for. There is no machine-readable source-of-truth model behind them, so they drift from the real code.
2. **`systemStatus` is shallow** — it checks env-var presence and the feed URL, not *live* connectivity or staleness of the database, AVLgo feed, auth providers, Spotify, cron jobs, blob storage, or Umami.
3. **No per-listener trace.** The Knowledge Graph is aggregate. There is no way to follow one signed-in listener from identity → connected platform data → expressed preferences → behavioral signals → taste settings → the events surfaced for them.
4. **The recommendation engine is invisible.** `lib/discovery.ts` / `lib/discovery-memory.ts` rank events, but the admin cannot see *why* an event is prioritized, which signals mattered, or how anonymous vs. signed-in ranking differs.
5. **Record-level stewardship is thin.** Gaps/Resources show aggregate problems and placeholder partner slots, not per-record provenance, completeness, currency, and ecosystem connection.
6. **Umami data is not in the portal.** Umami is only a tracking script in `app/layout.tsx` (gated on `NEXT_PUBLIC_UMAMI_WEBSITE_ID`); none of its traffic, engagement, referral, or conversion data is read back into the admin.
7. **Nothing is agent-readable.** There is no export a developer or AI agent can consume to get the shared, authoritative picture the outcomes promise.

## Definition Of Done (The Seven Outcomes, Synthesized)

The initiative is done when the portal delivers:

1. **Living Architectural Reference** — an accurate, visual, expandable map of application structure, services, integrations, data flows, schema, and dependencies; start high-level, expand any node for depth.
2. **Listener Taste Knowledge Graph** — a visual, per-listener trace of how identity, connected music data, preferences, behavioral signals, and taste settings influence the events surfaced for that person; recommendation logic is explainable, not a black box.
3. **Shared Understanding for Humans and Agents** — Brett (a visual learner) and any developer or AI agent can quickly understand structure, connections, where source-of-truth lives, and how the system is maintained; reduces guesswork, contradictory docs, and architectural drift.
4. **System Health and Connection Visibility** — clear status for databases, APIs, auth providers, music integrations, scheduled processes, and other critical services; gaps, stale data, broken connections, and config conflicts are visible without inspecting code or external dashboards.
5. **Recommendation Quality and Listener Insight** — an understandable view of *why* events are prioritized, which listener signals influenced ranking, and how anonymous vs. signed-in outcomes differ; assessable for relevance, diversity, and local value.
6. **Content and Data Stewardship** — an operational view of events, venues, artists, partners, external sources, and community resources, with origin, completeness, currency, and how each record connects to the wider ecosystem.
7. **Product Analytics and Usage Visibility** — Umami analytics presented in a clear operational view (traffic, page engagement, referral sources, event interactions, sign-in behavior, conversions) so product decisions rest on real usage.

## Outcome → PRD Map

The outcomes are intentionally re-sequenced into a dependency-sound **build** order. Build order ≠ outcome number.

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 06 — Admin Portal Platform & Architecture Foundation](prds/prd-06-admin-portal-platform-and-architecture.md) | 1, 3 | Source-of-truth System Registry, visual/expandable architecture graph, agent-readable export, maintainable admin service layer. |
| C2 | [PRD 07 — System Health & Connection Visibility](prds/prd-07-system-health-and-connection-visibility.md) | 4 | Live health/staleness/config checks attached to registry nodes. |
| C3 | [PRD 08 — Content & Data Stewardship](prds/prd-08-content-and-data-stewardship.md) | 6 | Record-level provenance, completeness, currency, ecosystem links, partner/resource management. |
| C4 | [PRD 09 — Recommendation Quality & Listener Insight](prds/prd-09-recommendation-quality-and-listener-insight.md) | 5 | Explain ranking, signal contributions, anonymous vs. signed-in, quality/diversity metrics. |
| C5 | [PRD 10 — Listener Taste Knowledge Graph](prds/prd-10-listener-taste-knowledge-graph.md) | 2 | Per-listener visual taste trace; privacy-first; reuses the C1 graph engine and C4 scoring explainability. |
| C6 | [PRD 11 — Product Analytics & Usage Visibility (Umami)](prds/prd-11-product-analytics-umami.md) | 7 | Umami Cloud API surfaced in-portal, joined with internal behavioral signals. |

## Delivery Sequence & Dependencies

```
C1 Foundation (Registry + Graph engine + Export)
 ├──> C2 Health        (attaches status to registry nodes)
 ├──> C3 Stewardship   (record views hang off registry entities)
 ├──> C4 Rec Insight   (scoring explainability)
 │      └──> C5 Listener Taste Graph (needs C1 graph + C4 scoring)
 └──> C6 Umami Analytics (independent; may run in parallel / be pulled forward)
```

- **C1 must ship first.** Every later cycle attaches to the System Registry and reuses the visual graph engine. Building it once prevents six bespoke re-implementations and is what makes the rest "manageable over several cycles."
- **C2, C3, C4, C6 are largely independent** after C1 and can be reordered by priority. C6 (Umami) has the loosest coupling and can be pulled forward if usage visibility is the most urgent need (the backlog flags analytics as urgent).
- **C5 is last by dependency**, not by importance: it composes the graph engine (C1) with scoring explainability (C4) and carries the highest privacy sensitivity.

Each cycle is independently shippable and leaves the portal in a coherent, demoable state. No cycle requires a big-bang rewrite of `AdminPortal.tsx`; cycles refactor it incrementally (see Shared Architecture).

## Shared Architecture & Cross-Cutting Design

These decisions are made once here and inherited by every cycle PRD.

### System Registry (the spine)

Introduce a typed, version-controlled **System Registry** (proposed `lib/system-registry.ts`) that is the single source of truth for the product's architecture as a graph:

- **Nodes** — application surfaces (routes, components), services (`lib/*`), data stores (Postgres tables), integrations (AVLgo, Spotify/Auth.js, Vercel Blob, Umami), scheduled jobs (cron paths), and external sources/partners.
- **Edges** — data flows and dependencies between nodes (e.g., `AVLgo feed → lib/events.ts → events table → homepage`).
- **Node metadata** — owner (manual vs. automated), public vs. admin-only, source-of-truth pointer (file path / table), required env vars, and the health probe (if any) that reports its status.

The registry is **partly hand-authored** (the canonical architecture, which is the legible truth Brett wants) and **partly derived** (live counts and health stitched in at request time). It is consumed by: the visual graph (Outcome 1), the agent export (Outcome 3), health overlays (Outcome 4), stewardship entity views (Outcome 6), and the listener-graph backdrop (Outcome 2). Keeping the canonical model **in code** directly answers the outcome "where its source-of-truth information lives."

### Admin Service Layer (incremental refactor)

`components/AdminPortal.tsx` (~1,291 lines) and `lib/admin-data.ts` (~718 lines) are already near the limit of what one file should hold. The initiative will **not** keep stacking onto them. C1 establishes:

- A `lib/admin/` module folder (registry, health, stewardship, insight, analytics loaders) replacing the monolithic `admin-data.ts` aggregator over time.
- A per-section component split under `components/admin/` so each tab/section is independently maintainable.
- A stable internal data contract so server loaders and client views evolve independently.

Refactors are **incremental and behavior-preserving**: each cycle migrates only the surface it touches.

### Visualization Approach ($0, client-side)

The visual graph (architecture, knowledge graph, listener taste) must render interactively in the browser at **$0 runtime cost**. Recommended: a permissively licensed, client-side React graph/diagram library (e.g., React Flow, MIT) or hand-rolled SVG — no hosted diagram service, no paid renderer. Server cost stays zero because rendering is client-side; the only addition is an npm dependency. The specific library is a C1 decision, not locked here; the constraint (free, client-side, MIT/permissive, SSR-safe) is.

### Agent & Human Readability (Outcome 3)

C1 ships a read-only, admin-authenticated export (proposed `GET /api/admin/system-map`) returning the registry as JSON, plus a generated Markdown view checked into `docs/`. This is the artifact an AI agent or new developer consumes to get the authoritative picture. It must stay in sync with the live system by deriving from the same registry the UI uses.

### Cross-Cutting Requirements (apply to every cycle)

- **Security at inception (mandatory).** Per the project security policy, all new first-party code must pass a Snyk code scan before it is considered done; fix and rescan until clean. The admin now exposes system internals and listener-adjacent data, so this is non-negotiable. The admin route already forces server-side rendering (`dynamic = "force-dynamic"`) behind auth — keep all new data loaders server-side.
- **Auth posture.** The product is single-owner (Brett). The existing single-password + opaque-session model is acceptable for this phase. New admin endpoints must reuse `isAdminSession` gating; none may be reachable unauthenticated. Revisit multi-admin/RBAC only if additional operators are added.
- **Privacy / PII.** OAuth tokens must never leave the server or appear in any admin response (existing rule). Listener-level views (C5) default to the smallest necessary identifying surface, never expose raw Spotify token values, and clearly separate anonymous-session identities from signed-in users. Aggregate views are preferred where a per-person view is not required.
- **$0 constraint.** No new paid hosting, database, storage, or API. Stack stays Vercel Hobby + Neon free Postgres + Umami Cloud Free. Any feature that would cross a free tier must degrade gracefully and be flagged against the roadmap's [Scaling Milestones](master-roadmap.md).
- **Performance.** Admin loaders must not run unbounded scans on hot paths; reuse the existing rolling-window pattern and add indexes only where justified. Health probes (C2) must be cheap, time-boxed, and cached briefly to avoid hammering providers.
- **Accessibility & mobile.** The portal should remain usable on a laptop and degrade legibly on smaller screens; graph views provide a non-graph fallback (lists/tables) so information is never *only* available visually.
- **Graceful degradation.** Every loader must tolerate missing tables/optional features (the existing try/catch-to-empty pattern), so the portal never hard-fails because an optional integration is off.

## Cross-Cutting Risks

- **Registry drift.** A hand-authored architecture model can fall behind the code. Mitigation: derive as much as possible (tables, routes, env presence) and add a lightweight check that flags registry nodes whose backing file/table no longer exists.
- **Scope creep into a BI tool.** The portal should explain and operate the system, not become a general analytics warehouse. Each PRD keeps a tight Non-Goals list.
- **Privacy exposure in C5.** Per-listener views are the highest-risk surface. Mitigation: privacy-first defaults, no token exposure, admin-only, Snyk-scanned, and explicit Non-Goals against building public profiles.
- **$0 ceilings.** Umami Cloud free tier and Vercel compute have limits already tracked in the roadmap. Mitigation: cache external reads, respect the existing scaling-milestone triggers.
- **Brownfield regression.** Refactoring the large existing files risks breaking moderation or current tabs. Mitigation: incremental, behavior-preserving migration with the existing tabs kept working at every step.

## Initiative-Level Success Criteria

- All seven desired outcomes have a shipped, demoable surface in `/admin`.
- A first-time developer or AI agent can read the System Registry export and correctly describe how an event flows from AVLgo to a ranked homepage card, and where each piece's source-of-truth lives.
- Brett can open the portal and, within one screen each, answer: *Is the system healthy? Why is this event ranked here? What's missing or stale? How are people actually using the app?*
- For one signed-in test listener, the portal visually traces identity → connected data → signals → settings → surfaced events.
- No admin surface leaks OAuth tokens, raw session secrets, or other PII; all new code passes Snyk.
- The whole initiative ships at $0 and respects the existing scaling-milestone triggers.

## Open Decisions & Assumptions

- **Assumed:** single-owner admin auth is sufficient for this phase (no RBAC). Revisit if more operators join.
- **Assumed:** a free, client-side React graph library (React Flow or equivalent) is acceptable as a new npm dependency; final choice made in C1.
- **Assumed:** Umami Cloud exposes API/share access for reading stats back into the portal at $0 on the current tier; verified at the start of C6 with a documented fallback (read-only share view embed) if API access is constrained.
- **Assumed:** PRD numbering continues the existing `prd-0N` sequence (06–11) and the Admin Portal is registered as a new phase in [`master-roadmap.md`](master-roadmap.md).
