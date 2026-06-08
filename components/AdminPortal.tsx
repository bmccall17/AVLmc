"use client";

import Link from "next/link";

import { useState } from "react";
import type { AdminDashboardData } from "@/lib/admin-data";
import type { EventDuplicateAuditGroup } from "@/lib/event-dedupe";
import type { PublicContribution, ContributionStatus } from "@/lib/community";
import { AdminModeration } from "@/components/AdminModeration";

type AdminPortalProps = {
  data: AdminDashboardData;
  contributions: PublicContribution[];
  currentStatus: ContributionStatus | "all";
};

type TabId =
  | "overview"
  | "architecture"
  | "knowledge"
  | "gaps"
  | "resources"
  | "moderation";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "knowledge", label: "Knowledge Graph" },
  { id: "gaps", label: "Gaps" },
  { id: "resources", label: "Resources" },
  { id: "moderation", label: "Moderation" },
];

export function AdminPortal({
  data,
  contributions,
  currentStatus,
}: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="admin-portal">
      <header className="admin-portal-header">
        <div className="admin-portal-brand">
          <span className="admin-brand-mark">AVLmc</span>
          <div>
            <strong>Admin Portal</strong>
            <small>AVL Music Companion</small>
          </div>
        </div>
        <Link
          className="admin-live-link"
          href="/"
        >
          ← Back to live site
        </Link>
      </header>

      <section className="admin-product-statement">
        <div style={{ display: 'grid', gap: '32px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div>
            <p className="admin-eyebrow">Product Statement</p>
            <h1>
              AVL Music Companion helps people find the Asheville show worth talking
              about.
            </h1>
            <p className="admin-lede">
              It turns the local live-music feed into a more human discovery
              experience by layering community notes, listening signals, venue
              context, playlist connections, and local recommendations on top of
              upcoming shows. The goal is not simply to list events, but to help
              people notice what is happening, understand why it might matter, and
              feel more connected to Asheville&apos;s music community.
            </p>
          </div>
          <div className="admin-subsection" style={{ margin: 0, height: 'max-content' }}>
            <h3>Social Identity & Metadata</h3>
            <p className="admin-meta">Canonical metadata for the public layout</p>
            <div className="admin-mini-table">
              <div className="admin-mini-row">
                <span>Title</span>
                <strong>AVL Music Companion</strong>
              </div>
              <div className="admin-mini-row">
                <span>Description</span>
                <strong>Upcoming Asheville shows from AVLgo...</strong>
              </div>
              <div className="admin-mini-row">
                <span>Favicon</span>
                <span className="admin-badge stale">Missing</span>
              </div>
              <div className="admin-mini-row">
                <span>App Icon</span>
                <span className="admin-badge stale">Missing</span>
              </div>
              <div className="admin-mini-row">
                <span>Open Graph (og:image)</span>
                <span className="admin-badge stale">Missing</span>
              </div>
              <div className="admin-mini-row">
                <span>Twitter Image</span>
                <span className="admin-badge stale">Missing</span>
              </div>
              <div className="admin-mini-row highlight">
                <span>Share Preview Validation</span>
                <strong>Needs Action</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`admin-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.label}
            {tab.id === "gaps" && data.weakEvents.length > 0 ? (
              <span className="admin-tab-badge">{data.weakEvents.length}</span>
            ) : null}
            {tab.id === "moderation" && contributions.length > 0 ? (
              <span className="admin-tab-badge">{contributions.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="admin-tab-content">
        {activeTab === "overview" && <OverviewSection data={data} />}
        {activeTab === "architecture" && <ArchitectureSection data={data} />}
        {activeTab === "knowledge" && <KnowledgeGraphSection data={data} />}
        {activeTab === "gaps" && <GapsSection data={data} />}
        {activeTab === "resources" && <ResourcesSection data={data} />}
        {activeTab === "moderation" && (
          <AdminModeration
            contributions={contributions}
            currentStatus={currentStatus}
          />
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Overview Section                                                   */
/* ================================================================== */

function OverviewSection({ data }: { data: AdminDashboardData }) {
  const gapCount =
    data.fieldCompleteness.missingImage +
    data.fieldCompleteness.missingTime +
    data.fieldCompleteness.weakUrl +
    data.fieldCompleteness.emptyTags;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">System Health</p>
        <h2>Dashboard Overview</h2>
      </div>

      <div className="admin-stat-grid">
        <StatCard
          label="Events"
          value={data.eventStats.totalEvents}
          detail={`${data.eventStats.upcomingCount} upcoming · ${data.eventStats.pastCount} past`}
        />
        <StatCard
          label="Venues"
          value={data.venues.length}
          detail={`${data.venues.filter((v) => v.hasUpcoming).length} with upcoming shows`}
        />
        <StatCard
          label="Contributions"
          value={data.contributionStats.total}
          detail={`${data.contributionStats.songs} songs · ${data.contributionStats.notes} notes · ${data.contributionStats.voices} voices`}
        />
        <StatCard
          label="Signals"
          value={data.reactionStats.totalGoing + data.reactionStats.totalFire}
          detail={`${data.reactionStats.totalGoing} going · ${data.reactionStats.totalFire} fire`}
        />
        <StatCard
          label="Users"
          value={data.userStats.totalUsers}
          detail={`${data.userStats.usersWithMusicConnection} connected`}
        />
        <StatCard
          label="Gaps Found"
          value={gapCount}
          detail={`${data.duplicateGroups.length} duplicates · ${data.weakEvents.length} weak records`}
          variant={gapCount > 0 ? "warning" : "success"}
        />
      </div>

      <div className="admin-status-bar">
        <StatusIndicator
          label="Database"
          active={data.systemStatus.databaseConnected}
        />
        <StatusIndicator
          label="AVLgo Feed"
          active
          detail={data.systemStatus.isCustomFeed ? "Custom" : "Live"}
        />
        <StatusIndicator
          label="Auth"
          active={data.systemStatus.authEnabled}
        />
        <StatusIndicator
          label="Spotify"
          active={data.systemStatus.spotifyEnabled}
        />
      </div>

      <div className="admin-subsection">
        <h3>Date Window</h3>
        <p className="admin-meta">
          <code>{data.eventStats.dateRange.start}</code> →{" "}
          <code>{data.eventStats.dateRange.end}</code> (21-day rolling window)
        </p>
      </div>

      {data.eventStats.eventsBySource.length > 0 && (
        <div className="admin-subsection">
          <h3>Events by Source</h3>
          <div className="admin-mini-table">
            {data.eventStats.eventsBySource.map((source) => (
              <div className="admin-mini-row" key={source.source}>
                <span>{source.source}</span>
                <strong>{source.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.interactionStats.byAction.length > 0 && (
        <div className="admin-subsection">
          <h3>Interaction Events</h3>
          <p className="admin-meta">
            {data.interactionStats.total} total interactions recorded
          </p>
          <div className="admin-mini-table">
            {data.interactionStats.byAction.map((action) => (
              <div className="admin-mini-row" key={action.action}>
                <span>{formatActionName(action.action)}</span>
                <strong>{action.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Architecture Section                                               */
/* ================================================================== */

function ArchitectureSection({ data }: { data: AdminDashboardData }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">System Reference</p>
        <h2>Architectural Overview</h2>
        <p className="admin-lede">
          How AVL Music Companion is wired together — from data sources through
          processing into the public experience.
        </p>
      </div>

      <div className="admin-arch-pipeline">
        <PipelineStage
          number={1}
          title="Data Sources"
          items={[
            {
              name: "AVLgo Export API",
              detail: data.systemStatus.isCustomFeed ? "Custom feed URL" : "Live feed (avlgo.com/api/export/json)",
              status: "active",
            },
            {
              name: "Seed Events",
              detail: "5 hardcoded fallback events when API is unavailable",
              status: "fallback",
            },
            {
              name: "Spotify Web API",
              detail: data.systemStatus.spotifyEnabled ? "Enabled — top artists/tracks" : "Not configured",
              status: data.systemStatus.spotifyEnabled ? "active" : "inactive",
            },
          ]}
        />

        <div className="admin-arch-arrow">→</div>

        <PipelineStage
          number={2}
          title="Processing"
          items={[
            {
              name: "Normalization",
              detail: "Flexible field mapping, date/time parsing, URL normalization",
              status: "auto",
            },
            {
              name: "Music Filtering",
              detail: "Only events tagged Live Music or matching music keywords",
              status: "auto",
            },
            {
              name: "Deduplication",
              detail: `${data.duplicateGroups.length} duplicate groups detected`,
              status: data.duplicateGroups.length > 0 ? "warning" : "active",
            },
            {
              name: "21-day Window",
              detail: "Rolling date filter from today + 21 days",
              status: "auto",
            },
          ]}
        />

        <div className="admin-arch-arrow">→</div>

        <PipelineStage
          number={3}
          title="Storage"
          items={[
            { name: "events", detail: `${data.eventStats.totalEvents} records`, status: "active" },
            { name: "contributions", detail: `${data.contributionStats.total} records`, status: "active" },
            { name: "reactions", detail: `${data.reactionStats.totalFire} fire reactions`, status: "active" },
            { name: "event_intents", detail: `${data.reactionStats.totalGoing} going intents`, status: "active" },
            { name: "music_connections", detail: `${data.musicConnectionStats.active} active`, status: "active" },
            { name: "music_profile_items", detail: "Spotify taste data", status: "active" },
            { name: "Admin Portal", detail: "Read-only system views", status: "fallback" },
          ]}
        />

        <div className="admin-arch-arrow">→</div>

        <PipelineStage
          number={4}
          title="Public Experience"
          items={[
            { name: "Event Board", detail: "Card grid with date/venue/tags", status: "active" },
            { name: "Community Panel", detail: "Songs, notes, voices per event", status: "active" },
            { name: "Discovery Scoring", detail: "Personalized ranking via taste + signals", status: "active" },
            { name: "Match Cards", detail: "Spotify artist matching on event cards", status: data.systemStatus.spotifyEnabled ? "active" : "inactive" },
          ]}
        />
      </div>

      <div className="admin-subsection">
        <h3>Dependency Map</h3>
        <p className="admin-meta">What breaks if a source is unavailable</p>
        <div className="admin-dep-table">
          <div className="admin-dep-header">
            <span>Feature</span>
            <span>Depends On</span>
            <span>Fallback</span>
          </div>
          <DepRow
            feature="Event Board"
            depends="AVLgo feed, PostgreSQL"
            fallback="Seed events (5 hardcoded)"
          />
          <DepRow
            feature="Community Notes"
            depends="PostgreSQL contributions"
            fallback="Empty state shown"
          />
          <DepRow
            feature="Discovery Scoring"
            depends="Spotify profile, interaction history"
            fallback="Public signals only"
          />
          <DepRow
            feature="Going / Fire"
            depends="PostgreSQL intents + reactions"
            fallback="Zero counts"
          />
          <DepRow
            feature="Spotify Match"
            depends="Spotify API, user auth, taste data"
            fallback="No match badges shown"
          />
          <DepRow
            feature="Duplicate Detection"
            depends="Event normalization"
            fallback="All variants shown"
          />
        </div>
      </div>

      <div className="admin-subsection">
        <h3>Data Flow: Manual vs Automated</h3>
        <div className="admin-mini-table">
          <div className="admin-mini-row">
            <span>🤖 AVLgo event sync</span>
            <strong>Automated</strong>
          </div>
          <div className="admin-mini-row">
            <span>🤖 Event normalization + dedup</span>
            <strong>Automated</strong>
          </div>
          <div className="admin-mini-row">
            <span>🤖 Spotify taste sync</span>
            <strong>Automated (on auth)</strong>
          </div>
          <div className="admin-mini-row">
            <span>🤖 Discovery scoring</span>
            <strong>Automated (per request)</strong>
          </div>
          <div className="admin-mini-row">
            <span>👤 Community contributions</span>
            <strong>User-generated</strong>
          </div>
          <div className="admin-mini-row">
            <span>👤 Content moderation</span>
            <strong>Manual (admin)</strong>
          </div>
          <div className="admin-mini-row">
            <span>👤 Spotify match corrections</span>
            <strong>User-initiated</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Knowledge Graph Section                                            */
/* ================================================================== */

function KnowledgeGraphSection({ data }: { data: AdminDashboardData }) {
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

  const entityGroups = [
    {
      id: "events",
      label: "Events",
      icon: "📅",
      count: data.eventStats.totalEvents,
      detail: `${data.eventStats.upcomingCount} upcoming across ${data.venues.length} venues`,
    },
    {
      id: "venues",
      label: "Venues",
      icon: "📍",
      count: data.venues.length,
      detail: `${data.venues.filter((v) => v.hasCommunity).length} with community activity`,
    },
    {
      id: "contributions",
      label: "Community Contributions",
      icon: "💬",
      count: data.contributionStats.total,
      detail: `${data.contributionStats.songs} songs, ${data.contributionStats.notes} notes, ${data.contributionStats.voices} voices`,
    },
    {
      id: "signals",
      label: "Engagement Signals",
      icon: "🔥",
      count: data.reactionStats.totalGoing + data.reactionStats.totalFire + data.interactionStats.total,
      detail: `${data.reactionStats.totalGoing} going, ${data.reactionStats.totalFire} fire, ${data.interactionStats.total} interactions`,
    },
    {
      id: "artists",
      label: "Artists",
      icon: "🎸",
      count: data.metadataStats.totalArtists,
      detail: `Distinct artists across ${data.eventStats.totalEvents} events`,
    },
    {
      id: "tags",
      label: "Tags & Genres",
      icon: "🏷️",
      count: data.metadataStats.totalTags,
      detail: `Distinct event tags and classifications`,
    },
    {
      id: "playlists",
      label: "Playlists",
      icon: "🎧",
      count: 1,
      detail: "Ryan's local music discovery playlist",
    },
    {
      id: "users",
      label: "Users & Music Profiles",
      icon: "👤",
      count: data.userStats.totalUsers,
      detail: `${data.userStats.usersWithMusicConnection} Spotify-connected, ${data.userStats.usersWithProfileItems} with taste profiles`,
    },
    {
      id: "sources",
      label: "External Sources",
      icon: "🔗",
      count: data.eventStats.eventsBySource.length,
      detail: data.eventStats.eventsBySource.map((s) => s.source).join(", ") || "None",
    },
  ];

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Living Map</p>
        <h2>Knowledge Graph</h2>
        <p className="admin-lede">
          Entity relationships across the AVL Music Companion ecosystem. Click
          an entity to explore its connections.
        </p>
      </div>

      <div className="admin-kg-grid">
        {entityGroups.map((entity) => (
          <button
            key={entity.id}
            className={`admin-kg-node${expandedEntity === entity.id ? " expanded" : ""}`}
            onClick={() =>
              setExpandedEntity(expandedEntity === entity.id ? null : entity.id)
            }
            type="button"
          >
            <span className="admin-kg-icon">{entity.icon}</span>
            <div className="admin-kg-info">
              <strong>
                {entity.label} <em>{entity.count}</em>
              </strong>
              <small>{entity.detail}</small>
            </div>
          </button>
        ))}
      </div>

      {expandedEntity === "venues" && (
        <div className="admin-kg-detail">
          <h3>Venue → Event Chain</h3>
          <p className="admin-meta">
            Each venue and its connected events, community activity, and
            relationship status.
          </p>
          <div className="admin-venue-list">
            {data.venues.slice(0, 30).map((venue) => (
              <div className="admin-venue-row" key={venue.venueName}>
                <div className="admin-venue-info">
                  <strong>{venue.venueName}</strong>
                  <span>
                    {venue.eventCount} event{venue.eventCount !== 1 ? "s" : ""}
                    {venue.hasUpcoming ? " · upcoming" : ""}
                    {venue.hasCommunity ? " · has community" : ""}
                  </span>
                </div>
                <div className="admin-venue-status">
                  {venue.hasUpcoming && (
                    <span className="admin-badge active">Active</span>
                  )}
                  {venue.hasCommunity && (
                    <span className="admin-badge community">Community</span>
                  )}
                  {!venue.hasUpcoming && (
                    <span className="admin-badge stale">Past only</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedEntity === "signals" && (
        <div className="admin-kg-detail">
          <h3>Signal Breakdown</h3>
          <div className="admin-mini-table">
            <div className="admin-mini-row">
              <span>Going intents (total)</span>
              <strong>{data.reactionStats.totalGoing}</strong>
            </div>
            {Object.entries(data.reactionStats.goingBySource).map(([source, count]) => (
              <div className="admin-mini-row indent" key={source}>
                <span>↳ via {source}</span>
                <strong>{count}</strong>
              </div>
            ))}
            <div className="admin-mini-row">
              <span>Fire reactions</span>
              <strong>{data.reactionStats.totalFire}</strong>
            </div>
            {data.interactionStats.byAction.map((action) => (
              <div className="admin-mini-row" key={action.action}>
                <span>{formatActionName(action.action)}</span>
                <strong>{action.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedEntity === "contributions" && (
        <div className="admin-kg-detail">
          <h3>Contribution Breakdown</h3>
          <div className="admin-mini-table">
            <div className="admin-mini-row">
              <span>Songs</span>
              <strong>{data.contributionStats.songs}</strong>
            </div>
            <div className="admin-mini-row">
              <span>Notes (comments)</span>
              <strong>{data.contributionStats.notes}</strong>
            </div>
            <div className="admin-mini-row">
              <span>Voices (audio)</span>
              <strong>{data.contributionStats.voices}</strong>
            </div>
            <div className="admin-mini-row highlight">
              <span>Visible</span>
              <strong>{data.contributionStats.visible}</strong>
            </div>
            <div className="admin-mini-row">
              <span>Hidden</span>
              <strong>{data.contributionStats.hidden}</strong>
            </div>
            <div className="admin-mini-row">
              <span>Pending</span>
              <strong>{data.contributionStats.pending}</strong>
            </div>
          </div>
        </div>
      )}

      {expandedEntity === "users" && (
        <div className="admin-kg-detail">
          <h3>User & Music Profile Details</h3>
          <div className="admin-mini-table">
            <div className="admin-mini-row">
              <span>Total users</span>
              <strong>{data.userStats.totalUsers}</strong>
            </div>
            <div className="admin-mini-row">
              <span>With music connection</span>
              <strong>{data.userStats.usersWithMusicConnection}</strong>
            </div>
            <div className="admin-mini-row">
              <span>With taste profile items</span>
              <strong>{data.userStats.usersWithProfileItems}</strong>
            </div>
            <div className="admin-mini-row">
              <span>Active connections</span>
              <strong>{data.musicConnectionStats.active}</strong>
            </div>
            <div className="admin-mini-row">
              <span>Disconnected</span>
              <strong>{data.musicConnectionStats.disconnected}</strong>
            </div>
            {data.musicConnectionStats.byProvider.map((p) => (
              <div className="admin-mini-row indent" key={p.provider}>
                <span>↳ {p.provider}</span>
                <strong>{p.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedEntity === "events" && (
        <div className="admin-kg-detail">
          <h3>Event Sources & Distribution</h3>
          <div className="admin-mini-table">
            {data.eventStats.eventsBySource.map((s) => (
              <div className="admin-mini-row" key={s.source}>
                <span>{s.source}</span>
                <strong>{s.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {expandedEntity === "artists" && (
        <div className="admin-kg-detail">
          <h3>Artist Network</h3>
          <p className="admin-meta">
            There are {data.metadataStats.totalArtists} distinct artists playing in the current window.
            Connecting artists to Spotify matching and discovery scoring allows personalized recommendations.
          </p>
          <div className="admin-chain">
            <div className="admin-chain-node source">
              <strong>Event Artist</strong>
            </div>
            <span className="admin-chain-link">→</span>
            <div className="admin-chain-node process">
              <strong>Spotify Match</strong>
            </div>
            <span className="admin-chain-link">→</span>
            <div className="admin-chain-node public">
              <strong>Personalized Discovery</strong>
            </div>
          </div>
        </div>
      )}

      {expandedEntity === "tags" && (
        <div className="admin-kg-detail">
          <h3>Tags & Genres</h3>
          <p className="admin-meta">
            {data.metadataStats.totalTags} distinct tags are used across events.
            Tags filter the event board and help power the discovery score.
          </p>
        </div>
      )}

      {expandedEntity === "playlists" && (
        <div className="admin-kg-detail">
          <h3>Ecosystem Playlists</h3>
          <div className="admin-mini-table">
            <div className="admin-mini-row highlight">
              <span>Ryan&apos;s Playlist</span>
              <strong><a href="https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM" target="_blank" rel="noreferrer" style={{color: 'inherit'}}>Open ↗</a></strong>
            </div>
          </div>
        </div>
      )}

      {expandedEntity === "sources" && (
        <div className="admin-kg-detail">
          <h3>External Source Reference</h3>
          <div className="admin-chain">
            <div className="admin-chain-node source">
              <strong>AVLgo</strong>
              <small>Primary event source</small>
              <code>{data.systemStatus.isCustomFeed ? "Custom feed" : "avlgo.com/api/export/json"}</code>
            </div>
            <span className="admin-chain-link">→</span>
            <div className="admin-chain-node process">
              <strong>Normalize & Filter</strong>
              <small>Music events only</small>
            </div>
            <span className="admin-chain-link">→</span>
            <div className="admin-chain-node storage">
              <strong>PostgreSQL</strong>
              <small>{data.eventStats.totalEvents} events stored</small>
            </div>
            <span className="admin-chain-link">→</span>
            <div className="admin-chain-node public">
              <strong>Public Board</strong>
              <small>avlmc.vercel.app</small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Gaps Section                                                       */
/* ================================================================== */

function GapsSection({ data }: { data: AdminDashboardData }) {
  const [expandedGap, setExpandedGap] = useState<string | null>(null);

  const gapCategories = buildGapCategories(data);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Content Health</p>
        <h2>Gaps &amp; Disconnections</h2>
        <p className="admin-lede">
          Surfaces missing metadata, disconnected venues, weak event records,
          dead links, and duplicate records. Click a category to see affected
          records.
        </p>
      </div>

      <div className="admin-gap-summary">
        {gapCategories.map((gap) => (
          <button
            key={gap.id}
            className={`admin-gap-card${gap.count > 0 ? ` ${gap.severity}` : " clear"}${expandedGap === gap.id ? " expanded" : ""}`}
            onClick={() =>
              setExpandedGap(expandedGap === gap.id ? null : gap.id)
            }
            type="button"
          >
            <span className="admin-gap-count">{gap.count}</span>
            <span className="admin-gap-label">{gap.label}</span>
          </button>
        ))}
      </div>

      {expandedGap === "missing-image" && (
        <GapDetailList
          title="Events Missing Images"
          events={data.weakEvents.filter((e) =>
            e.issues.includes("Missing image")
          )}
        />
      )}

      {expandedGap === "missing-time" && (
        <GapDetailList
          title="Events Missing Time"
          events={data.weakEvents.filter((e) =>
            e.issues.includes("Missing time")
          )}
        />
      )}

      {expandedGap === "weak-url" && (
        <GapDetailList
          title="Events with Generic URLs"
          events={data.weakEvents.filter((e) =>
            e.issues.includes("Generic URL")
          )}
        />
      )}

      {expandedGap === "empty-tags" && (
        <GapDetailList
          title="Events with No Tags"
          events={data.weakEvents.filter((e) => e.issues.includes("No tags"))}
        />
      )}

      {expandedGap === "duplicates" && (
        <DuplicatesList groups={data.duplicateGroups} />
      )}

      {expandedGap === "stale-events" && (
        <div className="admin-gap-detail">
          <h3>Stale / Past Events</h3>
          <p className="admin-meta">
            There are {data.eventStats.pastCount} past events currently retained in the rolling window.
            They are naturally filtered out of the public upcoming view.
          </p>
        </div>
      )}

      {expandedGap === "no-community" && (
        <div className="admin-gap-detail">
          <h3>Venues with No Community Activity</h3>
          <div className="admin-venue-list">
            {data.venues
              .filter((v) => !v.hasCommunity)
              .map((v) => (
                <div className="admin-venue-row" key={v.venueName}>
                  <div className="admin-venue-info">
                    <strong>{v.venueName}</strong>
                    <span>
                      {v.eventCount} event{v.eventCount !== 1 ? "s" : ""} · no
                      contributions yet
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GapDetailList({
  title,
  events,
}: {
  title: string;
  events: AdminDashboardData["weakEvents"];
}) {
  return (
    <div className="admin-gap-detail">
      <h3>{title}</h3>
      {events.length === 0 ? (
        <p className="admin-meta">No affected records found.</p>
      ) : (
        <div className="admin-gap-table">
          <div className="admin-gap-table-header">
            <span>Event</span>
            <span>Venue</span>
            <span>Date</span>
            <span>Issues</span>
          </div>
          {events.map((event) => (
            <div className="admin-gap-table-row" key={event.id}>
              <span className="admin-gap-event-title">{event.eventTitle}</span>
              <span>{event.venueName}</span>
              <span>
                <code>{event.eventDate}</code>
              </span>
              <span>
                {event.issues.map((issue) => (
                  <span className="admin-issue-badge" key={issue}>
                    {issue}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DuplicatesList({
  groups,
}: {
  groups: EventDuplicateAuditGroup[];
}) {
  if (groups.length === 0) {
    return (
      <div className="admin-gap-detail">
        <h3>Duplicate Event Groups</h3>
        <p className="admin-meta">No duplicates detected in the current window.</p>
      </div>
    );
  }

  return (
    <div className="admin-gap-detail">
      <h3>Duplicate Event Groups ({groups.length})</h3>
      <div className="admin-dup-list">
        {groups.map((group) => (
          <div className="admin-dup-group" key={group.groupKey}>
            <div className="admin-dup-canonical">
              <span className="admin-badge active">Canonical</span>
              <strong>{group.canonical.eventTitle}</strong>
              <small>
                {group.canonical.venueName} · {group.canonical.eventDate}
              </small>
            </div>
            {group.hidden.map((hidden) => (
              <div className="admin-dup-hidden" key={hidden.id}>
                <span className="admin-badge stale">Hidden</span>
                <strong>{hidden.eventTitle}</strong>
                <small>
                  {hidden.venueName} · {hidden.eventDate} · source:{" "}
                  {hidden.source}
                </small>
              </div>
            ))}
            {group.winnerReasons.length > 0 && (
              <p className="admin-dup-reason">
                Why: {group.winnerReasons.join("; ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Resources Section                                                  */
/* ================================================================== */

function ResourcesSection({ data }: { data: AdminDashboardData }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Ecosystem</p>
        <h2>Local Resources &amp; Partners</h2>
        <p className="admin-lede">
          External connections, data sources, and partner relationships that
          power the AVL Music Companion experience.
        </p>
      </div>

      <div className="admin-resource-grid">
        <ResourceCard
          title="AVLgo Source"
          status="connected"
          detail={
            data.systemStatus.isCustomFeed
              ? "Custom feed URL configured"
              : "Live feed from avlgo.com/api/export/json"
          }
          link="https://www.avlgo.com"
        />
        <ResourceCard
          title="Ryan's Playlist"
          status="connected"
          detail="Curated Spotify playlist featured in the navigation bar"
          link="https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM"
        />
        <ResourceCard
          title="Spotify Integration"
          status={data.systemStatus.spotifyEnabled ? "connected" : "inactive"}
          detail={
            data.systemStatus.spotifyEnabled
              ? `Active — ${data.musicConnectionStats.active} connected users`
              : "Not configured (AUTH_SPOTIFY_ID / AUTH_SPOTIFY_SECRET needed)"
          }
        />
        <ResourceCard
          title="Public Site"
          status="connected"
          detail="avlmc.vercel.app — live deployment"
          link="https://avlmc.vercel.app"
        />
      </div>

      <div className="admin-subsection">
        <h3>Venue Directory</h3>
        <p className="admin-meta">
          {data.venues.length} venue{data.venues.length !== 1 ? "s" : ""} in the
          current event window
        </p>
        <div className="admin-venue-list">
          {data.venues.map((venue) => (
            <div className="admin-venue-row" key={venue.venueName}>
              <div className="admin-venue-info">
                <strong>{venue.venueName}</strong>
                <span>
                  {venue.eventCount} event{venue.eventCount !== 1 ? "s" : ""}
                  {venue.hasUpcoming ? " · upcoming" : " · past only"}
                  {venue.hasCommunity ? " · community active" : ""}
                </span>
              </div>
              <div className="admin-venue-status">
                {venue.hasUpcoming ? (
                  <span className="admin-badge active">Active</span>
                ) : (
                  <span className="admin-badge stale">Past</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-subsection">
        <h3>Environment Configuration</h3>
        <p className="admin-meta">
          Which environment variables are configured (values hidden for security)
        </p>
        <div className="admin-env-table">
          <EnvRow name="DATABASE_URL" set={data.systemStatus.databaseConnected} />
          <EnvRow name="AVLGO_API_URL" set={data.systemStatus.isCustomFeed} />
          <EnvRow name="NEXT_PUBLIC_AUTH_ENABLED" set={data.systemStatus.authEnabled} />
          <EnvRow name="AUTH_SPOTIFY_ENABLED" set={data.systemStatus.spotifyEnabled} />
          <EnvRow name="AUTH_SPOTIFY_ID" set={data.systemStatus.spotifyEnabled} />
          <EnvRow name="AUTH_SPOTIFY_SECRET" set={data.systemStatus.spotifyEnabled} />
        </div>
      </div>

      <div className="admin-subsection">
        <h3>Partner Slots — Not Yet Connected</h3>
        <p className="admin-meta">
          These represent future partner relationships that the product could
          support.
        </p>
        <div className="admin-partner-slots">
          <PartnerSlot name="Community Organizations" />
          <PartnerSlot name="Press / Media Resources" />
          <PartnerSlot name="Playlist Collaborators" />
          <PartnerSlot name="Potential Sponsors" />
          <PartnerSlot name="Venue Contacts" />
          <PartnerSlot name="Artist / Community Resources" />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Shared UI pieces                                                   */
/* ================================================================== */

function StatCard({
  label,
  value,
  detail,
  variant,
}: {
  label: string;
  value: number;
  detail: string;
  variant?: "warning" | "success";
}) {
  return (
    <div className={`admin-stat-card${variant ? ` ${variant}` : ""}`}>
      <span className="admin-stat-value">{value.toLocaleString()}</span>
      <span className="admin-stat-label">{label}</span>
      <small className="admin-stat-detail">{detail}</small>
    </div>
  );
}

function StatusIndicator({
  label,
  active,
  detail,
}: {
  label: string;
  active: boolean;
  detail?: string;
}) {
  return (
    <div className="admin-status-indicator">
      <span className={`admin-status-dot ${active ? "on" : "off"}`} />
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function PipelineStage({
  number,
  title,
  items,
}: {
  number: number;
  title: string;
  items: Array<{
    name: string;
    detail: string;
    status: string;
  }>;
}) {
  return (
    <div className="admin-arch-stage">
      <div className="admin-arch-stage-header">
        <span className="admin-arch-number">{number}</span>
        <strong>{title}</strong>
      </div>
      <div className="admin-arch-items">
        {items.map((item) => (
          <div
            className={`admin-arch-item ${item.status}`}
            key={item.name}
          >
            <strong>{item.name}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepRow({
  feature,
  depends,
  fallback,
}: {
  feature: string;
  depends: string;
  fallback: string;
}) {
  return (
    <div className="admin-dep-row">
      <span>{feature}</span>
      <span>{depends}</span>
      <span className="admin-dep-fallback">{fallback}</span>
    </div>
  );
}

function ResourceCard({
  title,
  status,
  detail,
  link,
}: {
  title: string;
  status: "connected" | "inactive";
  detail: string;
  link?: string;
}) {
  return (
    <div className={`admin-resource-card ${status}`}>
      <div className="admin-resource-header">
        <strong>{title}</strong>
        <span className={`admin-badge ${status === "connected" ? "active" : "stale"}`}>
          {status === "connected" ? "Connected" : "Not connected"}
        </span>
      </div>
      <p>{detail}</p>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="admin-resource-link"
        >
          Open ↗
        </a>
      )}
    </div>
  );
}

function EnvRow({ name, set }: { name: string; set: boolean }) {
  return (
    <div className="admin-env-row">
      <code>{name}</code>
      <span className={`admin-badge ${set ? "active" : "stale"}`}>
        {set ? "Set" : "Not set"}
      </span>
    </div>
  );
}

function PartnerSlot({ name }: { name: string }) {
  return (
    <div className="admin-partner-slot">
      <span className="admin-partner-icon">○</span>
      <span>{name}</span>
      <span className="admin-badge stale">Not yet connected</span>
    </div>
  );
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function buildGapCategories(data: AdminDashboardData) {
  return [
    {
      id: "missing-image",
      label: "Missing Images",
      count: data.fieldCompleteness.missingImage,
      severity: "critical" as const,
    },
    {
      id: "missing-time",
      label: "Missing Time",
      count: data.fieldCompleteness.missingTime,
      severity: "warning" as const,
    },
    {
      id: "weak-url",
      label: "Generic URLs",
      count: data.fieldCompleteness.weakUrl,
      severity: "critical" as const,
    },
    {
      id: "empty-tags",
      label: "No Tags",
      count: data.fieldCompleteness.emptyTags,
      severity: "warning" as const,
    },
    {
      id: "duplicates",
      label: "Duplicates",
      count: data.duplicateGroups.length,
      severity: "info" as const,
    },
    {
      id: "stale-events",
      label: "Stale / Past Events",
      count: data.eventStats.pastCount,
      severity: "info" as const,
    },
    {
      id: "no-community",
      label: "No Community Activity",
      count: data.venues.filter((v) => !v.hasCommunity).length,
      severity: "info" as const,
    },
  ];
}

function formatActionName(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
