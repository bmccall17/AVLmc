# PRD 06: Admin Portal Platform & Architecture Foundation

Part of the [Admin Portal Initiative](../admin-portal-prd.md). Cycle **C1**. Satisfies desired outcomes **1 (Living Architectural Reference)** and **3 (Shared Understanding for Humans and Agents)**.

## Summary

Establish the foundation the rest of the Admin Portal builds on: a typed, version-controlled **System Registry** that is the single source of truth for how AVL Music Companion is wired, a **visual, expandable architecture graph** that renders that registry, an **agent-readable export** of the same model, and an incremental **admin service-layer refactor** so the portal stays maintainable across the remaining cycles.

This cycle turns today's static, hand-written "Architecture" and "Knowledge Graph" tabs into a single accurate model that humans can explore visually and agents can consume directly — and that later cycles attach health, stewardship, insight, and listener tracing to.

## Implementation Status

**Shipped.** Delivered:

- `lib/system-registry.ts` — typed, pure, version-controlled model: 40 nodes (surfaces, services, datastores, integrations, jobs, external sources, partners) across 8 layers and 46 edges (`flowsTo` / `dependsOn`), with `sourceOfTruth`, `access`, `ownership`, `envVars` (names only), and a reserved `healthProbeId` for C2.
- `lib/admin/registry.ts` — server-side loader that stitches live row counts onto registry nodes (each count an isolated, gracefully-degrading query). `lib/admin/system-map-markdown.ts` — pure Markdown renderer.
- `components/admin/ArchitectureSection.tsx` — interactive, expandable SVG graph (hand-rolled, $0, SSR-safe, zero new deps) that starts high-level by layer and expands any node to its detail, source of truth, and connections, with a full non-graph **List** fallback. `components/admin/KnowledgeGraphSection.tsx` — re-pointed at the same registry.
- `GET /api/admin/system-map` — admin-gated JSON export (names only, no secrets). `docs/product/system-map.generated.md` — generated agent/human doc (`npm run generate:system-map`).
- `tests/system-registry.test.ts` (`npm run test:registry`) — drift guard: fails when a node points at a missing file/table, when an edge references a missing node, or when the generated Markdown is stale.

Original brownfield baseline (now replaced): `AdminPortal.tsx` rendered the Architecture and Knowledge Graph tabs as static, hard-coded text/cards; there was no machine-readable model and no export.

## Goals

- Create a single source-of-truth model of the system architecture that lives in code and is consumed by the UI and an export.
- Replace the static Architecture/Knowledge Graph tabs with a visual graph a human can start high-level and expand node-by-node.
- Make the same model available as a JSON export and a generated Markdown doc for developers and AI agents.
- Begin the incremental refactor from monolithic admin files into a maintainable `lib/admin/` + `components/admin/` structure without breaking existing tabs.
- Keep everything at $0 and behind existing admin auth.

## Non-Goals

- No live health/connectivity checks (that is [PRD 07](prd-07-system-health-and-connection-visibility.md)).
- No per-listener taste graph (that is [PRD 10](prd-10-listener-taste-knowledge-graph.md)).
- No automatic code analysis / AST scanning to build the registry; the canonical model is hand-authored and selectively enriched with derived data.
- No public exposure of the system map; it is admin-only.
- No big-bang rewrite of `AdminPortal.tsx`; only the Architecture/Knowledge Graph surfaces and shared scaffolding change this cycle.

## Requirements

### System Registry (`lib/system-registry.ts`)

Provide a typed model describing the product as a graph:

- **Node kinds:** `surface` (route/component), `service` (`lib/*` module), `datastore` (Postgres table), `integration` (AVLgo, Auth.js/Spotify, Vercel Blob, Umami), `job` (cron path), `external_source`, `partner`.
- **Node fields:** stable `id`, `kind`, human label, short description, `sourceOfTruth` (file path or table name), `access` (`public` | `admin` | `internal`), `ownership` (`automated` | `manual` | `hybrid`), optional `envVars` (required configuration), optional `healthProbeId` (reserved for PRD 07).
- **Edges:** directed `dependsOn` / `flowsTo` relationships with an optional label (e.g., "daily upsert", "normalized rows").
- **Derived enrichment:** at request time, attach live counts already available from `lib/admin-data.ts` (e.g., event count on the `events` node, profile-item count on `music_profile_items`) without coupling the static model to the database.
- The registry must encode at minimum the documented data flows: AVLgo JSON export → `lib/events.ts` → `events` table → homepage/detail; community write paths (`/api/community/*` → `contributions`/`reactions`); optional auth (`/api/auth/*` → Auth.js tables → `music_connections`/`music_profile_items`); discovery (`lib/discovery.ts` + `lib/discovery-memory.ts` → `event_interaction_events`/`event_person_event_state`); scheduled jobs (`/api/sync/avlgo`, `/api/sync/cleanup`); and the Umami integration.

### Visual Architecture Graph

Replace the static Architecture tab with an interactive view:

- Render the registry as a node-edge graph using a free, client-side, SSR-safe library (e.g., React Flow, MIT) or hand-rolled SVG.
- Start at a high-level system view (grouped by layer: sources → processing → data → public experience → community → optional auth/taste → partners), matching the layering in [`avlmcadminportal.md`](../avlmcadminportal.md).
- Expanding a node reveals its details: description, source-of-truth pointer, access/ownership, required env vars, derived counts, and immediate dependencies.
- Provide a **non-graph fallback** (the existing structured lists) so the same information is reachable without the visual, for accessibility and small screens.
- The Knowledge Graph tab is re-pointed at the same registry model so entities (events, venues, artists, tags, contributions, signals, users, sources, playlists) and their relationships come from one source, not two hand-maintained lists.

### Agent-Readable Export

- `GET /api/admin/system-map` (admin-gated, server-side) returns the registry — nodes, edges, derived counts — as JSON.
- A generated Markdown rendering of the registry is written to `docs/` (proposed `docs/product/system-map.generated.md`) so a developer or agent gets the authoritative architecture without running the app. Generation is reproducible (script or route) and the file is clearly marked generated.
- Export and UI consume the **same** registry function, guaranteeing they cannot disagree.

### Admin Service-Layer Scaffolding

- Introduce `lib/admin/` and migrate the registry/architecture loaders there; leave existing `admin-data.ts` aggregators in place and re-export to avoid breakage.
- Introduce `components/admin/` and move the Architecture and Knowledge Graph sections into their own files; the six-tab shell keeps working unchanged.
- Establish the stable internal data contract (TypeScript types) the later cycles extend.

### Registry Drift Guard

- A lightweight check (test or dev script) flags any registry node whose `sourceOfTruth` file or table no longer exists, so the canonical model cannot silently rot. Wire it into the existing test scripts pattern in `package.json`.

## Dependencies

- Existing admin auth (`lib/admin.ts`, `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN`) — reused, unchanged.
- Existing aggregate counts in `lib/admin-data.ts` — reused for derived enrichment.
- A new free client-side graph dependency (decision made in this cycle; must be MIT/permissive, client-side, SSR-safe).

## Risks

- **Registry drift** if too much is hand-authored — mitigated by the drift guard and by deriving counts/env presence rather than restating them.
- **Graph library footprint / SSR issues** — mitigated by choosing an SSR-safe library, lazy-loading the graph client-side, and keeping the list fallback.
- **Refactor regression** in the existing tabs — mitigated by re-exporting from `admin-data.ts` and migrating one section at a time.
- **Over-modeling** — the registry should capture the architecture a maintainer needs, not every function; keep node granularity at the service/table/integration level.

## Acceptance Criteria

- `lib/system-registry.ts` exists, is typed, and models the documented surfaces, services, datastores, integrations, jobs, and sources with their edges.
- The Architecture tab renders an interactive graph that starts high-level and expands node-by-node, with a working non-graph fallback.
- The Knowledge Graph tab is sourced from the same registry as the architecture view.
- `GET /api/admin/system-map` returns the registry as JSON and is unreachable without an admin session.
- A generated Markdown system map exists in `docs/` and matches the API output.
- Existing Overview, Gaps, Resources, and Moderation tabs continue to work unchanged.
- The drift guard fails when a node points at a missing file/table.
- New code passes a Snyk code scan; the system-map endpoint exposes no secrets, tokens, or env *values* (names only).
- The feature runs at $0.

## Test Scenarios

- Load `/admin` → Architecture: the high-level graph renders; expanding the `events` node shows source-of-truth `lib/events.ts`/`events` table, ownership `automated`, and a live event count.
- Disable the graph (small screen / fallback): the same node details are reachable as lists.
- `GET /api/admin/system-map` without an admin cookie returns unauthorized; with one, returns valid JSON whose nodes/edges match the UI.
- Open the generated Markdown map: an agent can trace AVLgo → `lib/events.ts` → `events` → homepage from it alone.
- Point a registry node at a deleted file → drift guard fails in tests.
- Confirm no env *value*, OAuth token, or session secret appears anywhere in the export.
