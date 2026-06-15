# PRD 08: Content & Data Stewardship

Part of the [Admin Portal Initiative](../admin-portal-prd.md). Cycle **C3**. Satisfies desired outcome **6 (Content and Data Stewardship)**.

## Summary

Give administrators a record-level operational view of the content ecosystem — events, venues, artists, partners, external sources, and community resources — with each record's origin, completeness, currency, and connection to the wider product. This deepens today's aggregate Gaps/Resources tabs into something an operator can actually steward: find the weak record, understand where it came from, see what it connects to, and manage the partners/resources that are currently just placeholders.

## Implementation Status

**Shipped.** Delivered:

- `lib/admin/stewardship.ts` — `loadStewardship()` returns record-level, window-bounded views: events (provenance `source`/`avlgo_event_id`/`event_url`, completeness %, freshness `current`/`aging`/`stale` from `updated_at`, and connection counts joined without N+1), venues (counts + community + partner-link + gap flags), artists (event counts + community-context flag), tags (inventory + generic flag), and sources (counts + last ingest + freshness). Every query degrades gracefully.
- Persisted partner/resource directory: `admin_resources` table (schema + migration), `lib/admin/resources.ts` (validated CRUD), pure shared types in `lib/admin/resource-types.ts`, and admin-gated `app/api/admin/resources` (GET/POST/PATCH, including a status-only archive/restore).
- `components/admin/StewardshipSection.tsx` — a new **Stewardship** tab with Events/Venues/Artists/Tags/Sources/Directory sub-views, a clickable gap strip, event filters/search, and a create/edit/archive directory UI. The Resources tab's hard-coded `PartnerSlot` placeholders were removed in favor of this managed directory; stewarded relationships (venue/source links) feed the PRD 06 registry.
- Security: external feed/resource URLs are sanitized to http(s) before reaching any `href` (`safeExternalHref`), fixing a DOM-XSS the Snyk scan caught; all writes are admin-gated and server-validated.

Original brownfield baseline (now extended/superseded): aggregate-only Gaps/Resources tabs with hard-coded placeholder partner slots and no per-record provenance/currency view.

## Goals

- Provide drill-down, record-level views for the core content entities, not just counts.
- Show, per record, where it originated (source/provenance), how complete it is, how current it is (last updated / stale), and what it connects to (venue↔events↔artists↔tags↔community).
- Turn the placeholder partner/resource slots into real, persisted, manageable records connected to the ecosystem.
- Make "should be connected but isn't" explicit: venues without partner links, partners not surfaced publicly, local resources not yet represented.
- Reuse and extend the existing weak-event/duplicate detection rather than replacing it.

## Non-Goals

- No editing of AVLgo-sourced event fields by hand (AVLgo stays source of truth for events; stewardship surfaces problems, it does not fork the feed). Targeted overrides, if ever needed, are a separate future decision.
- No full CMS. Partner/resource management is a lightweight curated directory, not a publishing system.
- No public-facing changes in this cycle; this is an admin stewardship surface. (Surfacing partners publicly is a separate product decision.)
- No automated enrichment/scraping of missing metadata (a possible later follow-up).

## Requirements

### Entity Stewardship Views (`lib/admin/stewardship.ts`, `components/admin/StewardshipSection.tsx`)

Provide drill-down lists with per-record detail for:

- **Events:** filterable list (by completeness, staleness, venue, source) with each event's provenance (`source`, `avlgo_event_id`, `event_url`), completeness (missing image/time/tags/weak URL — reuse `getWeakMetadataEvents` logic), currency (`updated_at`, days since refresh), and connections (community contributions/reactions/intents counts, interaction signals).
- **Venues:** the existing venue directory extended with upcoming/total counts, whether it has community activity, whether it links to a partner/resource, and a "no community / no partner" flag.
- **Artists:** distinct artists in the rolling window with event counts and whether they have any community context (song recs/notes), exposing the "artist with no community signal" gap.
- **Tags/genres:** tag inventory with event counts, flagging generic/duplicate tags (extends `genericTagsOnly`, currently stubbed to 0 in `getFieldCompleteness`).
- **External sources:** each ingestion source (AVLgo today) with record counts, last ingest, and feed health (cross-links to [PRD 07](prd-07-system-health-and-connection-visibility.md)).

### Provenance & Currency Model

- Each stewarded record shows: origin (automated AVLgo ingest vs. manual/curated), the source-of-truth pointer (table/feed), last-updated timestamp, and a derived freshness state (`current` / `aging` / `stale`).
- Reuse the rolling-window conventions in `lib/admin-data.ts` so counts stay consistent with the rest of the portal.

### Partner & Resource Directory (persisted)

- Replace the hard-coded `PartnerSlot` placeholders with a small persisted, admin-managed directory. Proposed table `admin_resources` (id, type, name, description, url, status, linked venue/source ids, notes, created/updated) covering the categories already named in the UI: AVLgo source, Ryan's playlist, venues, local music partners, community organizations, press/media, playlist collaborators, potential sponsors, venue contacts, artist/community resources.
- Admin CRUD (create/update/archive) for these records, gated by admin auth and validated server-side.
- Each resource can link to ecosystem entities (e.g., a partner ↔ a venue) so relationships are explicit and appear in the [PRD 06](prd-06-admin-portal-platform-and-architecture.md) registry/knowledge graph.

### Gap / Disconnection View (extends existing Gaps tab)

Make "needs attention" explicit and actionable across:

- events with no venue match or weak metadata (exists — keep),
- venues with no partner/resource link (new, via the directory),
- listings with missing images / weak URLs / empty or generic tags (exists/extend),
- duplicates and stale/past listings (exists — keep),
- partners/resources that exist but are not surfaced publicly (new),
- local resources that *should* be connected but are not yet represented (new, curated backlog within the directory).

### Stewardship in the Knowledge Graph

- Stewarded entities and their connections feed the PRD 06 registry so the visual knowledge graph reflects real venue↔event↔artist↔tag↔community↔partner relationships rather than a hand-maintained list.

## Dependencies

- [PRD 06](prd-06-admin-portal-platform-and-architecture.md) registry (entity nodes/edges) and admin service-layer scaffolding.
- Existing `lib/admin-data.ts` (`getWeakMetadataEvents`, `getVenueStats`, `getMetadataStats`, `fieldCompleteness`), `lib/event-dedupe.ts`, `lib/community.ts`.
- [PRD 07](prd-07-system-health-and-connection-visibility.md) feed health for the External Sources view (soft dependency; can show config-only if C2 not yet shipped).
- Additive schema migration for `admin_resources` following the existing `db/schema.sql` / `db/migrate-missing-tables.sql` additive pattern.

## Risks

- **Scope creep toward a CMS** — mitigated by keeping the directory a lightweight curated list, not a publishing pipeline.
- **Per-record queries getting heavy** — mitigated by staying inside the rolling window, paginating long lists, and reusing existing indexed queries.
- **Source-of-truth confusion** — mitigated by clearly labeling AVLgo-derived (read-only) vs. admin-curated (editable) records.
- **Schema additions on production** — mitigated by additive `create table if not exists` migrations consistent with current practice, plus the ADR-001 lesson that schema and code must be deployed together.

## Acceptance Criteria

- Each core entity (events, venues, artists, tags, external sources) has a drill-down list with per-record provenance, completeness, and currency.
- Weak/duplicate/stale detection from the baseline is preserved and surfaced in the deepened Gaps view.
- Admins can create, edit, and archive partner/resource records that persist across refreshes and link to venues/sources.
- "Venues with no partner link," "partners not surfaced publicly," and "resources that should be connected but aren't" each appear as explicit gaps.
- Stewarded relationships appear in the PRD 06 knowledge graph.
- All write endpoints are admin-gated and server-validated; new code passes a Snyk scan; the cycle runs at $0.

## Test Scenarios

- Open Events stewardship → filter to "stale" → a record shows its AVLgo origin, missing-field issues, and days since last update.
- A venue with events but no contributions and no partner link shows both gap flags.
- Create a partner record and link it to a venue → it persists across a page reload and appears connected in the knowledge graph.
- Archive a partner → it leaves the active directory but is not destroyed.
- An artist with multiple events but zero community context surfaces in the artist gap list.
- A generic/duplicate tag is flagged in the tag inventory.
- Attempt a resource write without an admin session → rejected.
