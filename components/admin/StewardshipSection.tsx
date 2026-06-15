"use client";

import { useMemo, useState } from "react";
import type {
  FreshnessState,
  StewardEvent,
  StewardshipData,
} from "@/lib/admin/stewardship";
import {
  RESOURCE_STATUSES,
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPES,
  type AdminResource,
  type ResourceStatus,
  type ResourceType,
} from "@/lib/admin/resource-types";

/**
 * Content & Data Stewardship (PRD 08 / C3, Outcome 6).
 *
 * Record-level drill-downs for events, venues, artists, tags, and sources — each showing origin,
 * completeness, currency, and connections — plus a persisted, admin-managed partner/resource
 * directory (create / edit / archive) and the derived "should be connected but isn't" gaps.
 */

type SubView = "events" | "venues" | "artists" | "tags" | "sources" | "directory";

const SUB_VIEWS: Array<{ id: SubView; label: string }> = [
  { id: "events", label: "Events" },
  { id: "venues", label: "Venues" },
  { id: "artists", label: "Artists" },
  { id: "tags", label: "Tags" },
  { id: "sources", label: "Sources" },
  { id: "directory", label: "Directory" },
];

const FRESHNESS_COLOR: Record<FreshnessState, string> = {
  current: "#34d399",
  aging: "#f0a93a",
  stale: "#f87171",
};

export function StewardshipSection({ stewardship }: { stewardship: StewardshipData }) {
  const [view, setView] = useState<SubView>("events");

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Content &amp; Data Stewardship</p>
        <h2>Stewardship</h2>
        <p className="admin-lede">
          Where each record came from, whether it is complete and current, and how it connects to
          the ecosystem — plus the curated partner/resource directory.
        </p>
      </div>

      <GapStrip gaps={stewardship.gaps} onJump={setView} />

      <div className="admin-view-toggle admin-steward-tabs" role="tablist" aria-label="Stewardship views">
        {SUB_VIEWS.map((sub) => (
          <button
            key={sub.id}
            type="button"
            role="tab"
            aria-selected={view === sub.id}
            className={`admin-view-toggle-btn${view === sub.id ? " active" : ""}`}
            onClick={() => setView(sub.id)}
          >
            {sub.label}
            {sub.id === "directory" ? ` (${stewardship.resources.filter((r) => r.status !== "archived").length})` : ""}
          </button>
        ))}
      </div>

      {view === "events" && <EventsView events={stewardship.events} />}
      {view === "venues" && <VenuesView venues={stewardship.venues} />}
      {view === "artists" && <ArtistsView artists={stewardship.artists} />}
      {view === "tags" && <TagsView tags={stewardship.tags} />}
      {view === "sources" && <SourcesView sources={stewardship.sources} />}
      {view === "directory" && <ResourceDirectory initial={stewardship.resources} venues={stewardship.venues.map((v) => v.venueName)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gaps strip                                                         */
/* ------------------------------------------------------------------ */

function GapStrip({ gaps, onJump }: { gaps: StewardshipData["gaps"]; onJump: (view: SubView) => void }) {
  const items: Array<{ label: string; count: number; view: SubView }> = [
    { label: "Venues w/o partner", count: gaps.venuesNoPartner, view: "venues" },
    { label: "Venues w/o community", count: gaps.venuesNoCommunity, view: "venues" },
    { label: "Artists w/o community", count: gaps.artistsNoCommunity, view: "artists" },
    { label: "Generic tags", count: gaps.genericTags, view: "tags" },
    { label: "Stale events", count: gaps.staleEvents, view: "events" },
    { label: "Resources not public", count: gaps.resourcesNotPublic, view: "directory" },
  ];
  return (
    <div className="admin-steward-gapstrip">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`admin-steward-gap${item.count > 0 ? " warn" : " clear"}`}
          onClick={() => onJump(item.view)}
        >
          <strong>{item.count}</strong>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

function EventsView({ events }: { events: StewardEvent[] }) {
  const [filter, setFilter] = useState<"all" | "incomplete" | "stale">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((event) => {
      if (filter === "incomplete" && event.issues.length === 0) return false;
      if (filter === "stale" && event.freshness !== "stale") return false;
      if (q && !`${event.title} ${event.venueName} ${event.artistName}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [events, filter, search]);

  const shown = filtered.slice(0, 60);

  return (
    <div>
      <div className="admin-steward-controls">
        <div className="admin-view-toggle">
          {(["all", "incomplete", "stale"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`admin-view-toggle-btn${filter === key ? " active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {key[0].toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        <input
          className="admin-steward-search"
          type="search"
          placeholder="Search events, venues, artists…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <p className="admin-meta">
        Showing {shown.length} of {filtered.length} events in the rolling window.
      </p>

      <div className="admin-steward-events">
        {shown.map((event) => {
          const sourceHref = safeExternalHref(event.eventUrl);
          return (
          <div className="admin-steward-event" key={event.id}>
            <div className="admin-steward-event-main">
              <strong>{event.title}</strong>
              <span className="admin-meta">
                {event.venueName} · {event.eventDate} · {event.artistName || "—"}
              </span>
              <div className="admin-steward-event-tagrow">
                <span className="admin-badge source">{event.source}</span>
                <FreshnessBadge freshness={event.freshness} days={event.daysSinceUpdate} />
                {event.issues.map((issue) => (
                  <span className="admin-issue-badge" key={issue}>
                    {issue}
                  </span>
                ))}
              </div>
            </div>
            <div className="admin-steward-event-side">
              <div className="admin-steward-complete">
                <div className="admin-steward-complete-bar">
                  <span style={{ width: `${event.completeness}%`, background: completeColor(event.completeness) }} />
                </div>
                <small>{event.completeness}% complete</small>
              </div>
              <div className="admin-steward-conns">
                <span title="Community contributions">💬 {event.contributions}</span>
                <span title="Reactions">🔥 {event.reactions}</span>
                <span title="Going / ticket intents">🎟 {event.intents}</span>
                <span title="Interaction signals">👁 {event.interactions}</span>
              </div>
              {sourceHref && (
                <a className="admin-edge-link" href={sourceHref} target="_blank" rel="noreferrer">
                  source ↗
                </a>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function FreshnessBadge({ freshness, days }: { freshness: FreshnessState; days: number }) {
  return (
    <span className="admin-badge" style={{ background: `${FRESHNESS_COLOR[freshness]}22`, color: FRESHNESS_COLOR[freshness] }}>
      {freshness} · {days}d
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Venues / Artists / Tags / Sources                                  */
/* ------------------------------------------------------------------ */

function VenuesView({ venues }: { venues: StewardshipData["venues"] }) {
  return (
    <div className="admin-venue-list">
      {venues.map((venue) => (
        <div className="admin-venue-row" key={venue.venueName}>
          <div className="admin-venue-info">
            <strong>{venue.venueName}</strong>
            <span>
              {venue.eventCount} event{venue.eventCount !== 1 ? "s" : ""} · {venue.upcomingCount} upcoming
            </span>
          </div>
          <div className="admin-venue-status">
            {venue.hasCommunity && <span className="admin-badge community">Community</span>}
            {venue.hasPartnerLink && <span className="admin-badge active">Partner</span>}
            {venue.gaps.map((gap) => (
              <span className="admin-badge stale" key={gap}>
                {gap}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtistsView({ artists }: { artists: StewardshipData["artists"] }) {
  return (
    <div className="admin-venue-list">
      {artists.map((artist) => (
        <div className="admin-venue-row" key={artist.name}>
          <div className="admin-venue-info">
            <strong>{artist.name}</strong>
            <span>
              {artist.eventCount} event{artist.eventCount !== 1 ? "s" : ""} in window
            </span>
          </div>
          <div className="admin-venue-status">
            {artist.hasCommunityContext ? (
              <span className="admin-badge community">Has community</span>
            ) : (
              <span className="admin-badge stale">No community signal</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TagsView({ tags }: { tags: StewardshipData["tags"] }) {
  return (
    <div className="admin-steward-tags">
      {tags.map((tag) => (
        <span className={`admin-steward-tag${tag.isGeneric ? " generic" : ""}`} key={tag.tag}>
          {tag.tag} <em>{tag.eventCount}</em>
          {tag.isGeneric && <small>generic</small>}
        </span>
      ))}
    </div>
  );
}

function SourcesView({ sources }: { sources: StewardshipData["sources"] }) {
  return (
    <div className="admin-health-grid">
      {sources.map((source) => (
        <div className="admin-health-card" key={source.source}>
          <div className="admin-health-card-head">
            <span className="admin-health-dot" style={{ background: FRESHNESS_COLOR[source.freshness] }} />
            <strong>{source.source}</strong>
            <span className="admin-health-status">{source.freshness}</span>
          </div>
          <p>
            {source.eventCount} events · last ingest{" "}
            {source.lastIngest ? new Date(source.lastIngest).toLocaleString() : "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resource directory (CRUD)                                          */
/* ------------------------------------------------------------------ */

const EMPTY_FORM = {
  id: null as string | null,
  type: "venue_partner" as ResourceType,
  name: "",
  url: "",
  description: "",
  linkedVenueName: "",
  linkedSource: "",
  status: "active" as ResourceStatus,
  surfacedPublicly: false,
  notes: "",
};

function ResourceDirectory({ initial, venues }: { initial: AdminResource[]; venues: string[] }) {
  const [resources, setResources] = useState<AdminResource[]>(initial);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = form.id !== null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const method = editing ? "PATCH" : "POST";
      const response = await fetch("/api/admin/resources", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as { resource?: AdminResource; error?: string };
      if (!response.ok || !data.resource) {
        throw new Error(data.error ?? "Save failed.");
      }
      upsert(data.resource);
      setForm({ ...EMPTY_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(resource: AdminResource, status: ResourceStatus) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/resources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: resource.id, statusOnly: true, status }),
      });
      const data = (await response.json().catch(() => ({}))) as { resource?: AdminResource; error?: string };
      if (!response.ok || !data.resource) {
        throw new Error(data.error ?? "Update failed.");
      }
      upsert(data.resource);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  function upsert(resource: AdminResource) {
    setResources((prev) => {
      const next = prev.filter((item) => item.id !== resource.id);
      next.push(resource);
      return next.sort(byStatusThenName);
    });
  }

  function startEdit(resource: AdminResource) {
    setForm({
      id: resource.id,
      type: resource.type,
      name: resource.name,
      url: resource.url ?? "",
      description: resource.description ?? "",
      linkedVenueName: resource.linkedVenueName ?? "",
      linkedSource: resource.linkedSource ?? "",
      status: resource.status,
      surfacedPublicly: resource.surfacedPublicly,
      notes: resource.notes ?? "",
    });
    setError(null);
  }

  const active = resources.filter((r) => r.status !== "archived");
  const archived = resources.filter((r) => r.status === "archived");

  return (
    <div className="admin-steward-directory">
      <form
        className="admin-resource-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h3>{editing ? "Edit resource" : "Add resource"}</h3>
        <div className="admin-resource-form-grid">
          <label>
            <span>Type</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ResourceType })}>
              {RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RESOURCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Name *</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={200} />
          </label>
          <label>
            <span>URL</span>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" maxLength={500} />
          </label>
          <label>
            <span>Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ResourceStatus })}>
              {RESOURCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Linked venue</span>
            <input
              value={form.linkedVenueName}
              onChange={(e) => setForm({ ...form, linkedVenueName: e.target.value })}
              list="steward-venue-list"
              maxLength={200}
            />
            <datalist id="steward-venue-list">
              {venues.map((venue) => (
                <option key={venue} value={venue} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Linked source</span>
            <input value={form.linkedSource} onChange={(e) => setForm({ ...form, linkedSource: e.target.value })} maxLength={100} />
          </label>
          <label className="wide">
            <span>Description</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
          </label>
          <label className="wide">
            <span>Notes</span>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.surfacedPublicly}
              onChange={(e) => setForm({ ...form, surfacedPublicly: e.target.checked })}
            />
            <span>Surfaced publicly</span>
          </label>
        </div>
        {error && <p className="admin-resource-form-error">{error}</p>}
        <div className="admin-resource-form-actions">
          <button type="submit" className="admin-login-button" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add resource"}
          </button>
          {editing && (
            <button type="button" className="admin-view-toggle-btn" onClick={() => setForm({ ...EMPTY_FORM })}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="admin-subsection">
        <h3>Directory ({active.length})</h3>
        {active.length === 0 ? (
          <p className="admin-meta">No resources yet. Add partners, sources, sponsors, and community contacts above.</p>
        ) : (
          <div className="admin-resource-list">
            {active.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} onEdit={startEdit} onArchive={(r) => changeStatus(r, "archived")} busy={busy} />
            ))}
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div className="admin-subsection">
          <h3>Archived ({archived.length})</h3>
          <div className="admin-resource-list">
            {archived.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} onEdit={startEdit} onRestore={(r) => changeStatus(r, "active")} busy={busy} archived />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  resource,
  onEdit,
  onArchive,
  onRestore,
  busy,
  archived,
}: {
  resource: AdminResource;
  onEdit: (resource: AdminResource) => void;
  onArchive?: (resource: AdminResource) => void;
  onRestore?: (resource: AdminResource) => void;
  busy: boolean;
  archived?: boolean;
}) {
  const url = safeExternalHref(resource.url);
  return (
    <div className={`admin-resource-row${archived ? " archived" : ""}`}>
      <div className="admin-resource-row-body">
        <div className="admin-resource-row-head">
          <strong>{resource.name}</strong>
          <span className="admin-badge layer">{RESOURCE_TYPE_LABELS[resource.type]}</span>
          <span className={`admin-badge ${resource.status === "active" ? "active" : "stale"}`}>{resource.status}</span>
          {resource.surfacedPublicly && <span className="admin-badge community">Public</span>}
        </div>
        {resource.description && <p className="admin-meta">{resource.description}</p>}
        <div className="admin-resource-row-meta">
          {resource.linkedVenueName && <span>↳ venue: {resource.linkedVenueName}</span>}
          {resource.linkedSource && <span>↳ source: {resource.linkedSource}</span>}
          {url && (
            <a className="admin-edge-link" href={url} target="_blank" rel="noreferrer">
              open ↗
            </a>
          )}
        </div>
      </div>
      <div className="admin-resource-row-actions">
        <button type="button" className="admin-view-toggle-btn" onClick={() => onEdit(resource)} disabled={busy}>
          Edit
        </button>
        {onArchive && (
          <button type="button" className="admin-view-toggle-btn" onClick={() => onArchive(resource)} disabled={busy}>
            Archive
          </button>
        )}
        {onRestore && (
          <button type="button" className="admin-view-toggle-btn" onClick={() => onRestore(resource)} disabled={busy}>
            Restore
          </button>
        )}
      </div>
    </div>
  );
}

function byStatusThenName(a: AdminResource, b: AdminResource): number {
  const rank = (status: ResourceStatus) => (status === "active" ? 0 : status === "prospect" ? 1 : 2);
  return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
}

function completeColor(value: number): string {
  if (value >= 100) return "#34d399";
  if (value >= 50) return "#f0a93a";
  return "#f87171";
}

/**
 * Only allow http(s) URLs into an anchor href. External feed/resource URLs are untrusted, and
 * React does not block `javascript:`/`data:` URLs — this prevents DOM-based XSS via a hostile URL.
 */
function safeExternalHref(url: string | null | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}
