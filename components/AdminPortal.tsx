"use client";

import Link from "next/link";
import Image from "next/image";

import { useEffect, useState, type ReactNode } from "react";
import type { AdminDashboardData } from "@/lib/admin-data";
import type { SystemMap } from "@/lib/admin/registry";
import type { SystemHealth } from "@/lib/admin/health";
import type { StewardshipData } from "@/lib/admin/stewardship";
import type { RecommendationInsight } from "@/lib/admin/insight";
import type { SystemAnalytics } from "@/lib/admin/analytics";
import type { ListenerSummary, ListenerTrace } from "@/lib/admin/listener-graph";
import type { EventDuplicateAuditGroup } from "@/lib/event-dedupe";
import type { PublicContribution, ContributionStatus } from "@/lib/community";
import { AdminModeration } from "@/components/AdminModeration";
import { ArchitectureSection } from "@/components/admin/ArchitectureSection";
import { KnowledgeGraphSection } from "@/components/admin/KnowledgeGraphSection";
import { HealthSection } from "@/components/admin/HealthSection";
import { StewardshipSection } from "@/components/admin/StewardshipSection";
import { InsightSection } from "@/components/admin/InsightSection";
import { AnalyticsSection } from "@/components/admin/AnalyticsSection";
import { ListenerGraphSection } from "@/components/admin/ListenerGraphSection";
import { CardFxLabSection } from "@/components/admin/CardFxLabSection";

type AdminPortalProps = {
  data: AdminDashboardData;
  systemMap: SystemMap;
  health: SystemHealth;
  contributions: PublicContribution[];
  currentStatus: ContributionStatus | "all";
};

type ListenerBundle = { listeners: ListenerSummary[]; trace: ListenerTrace | null };

type TabId =
  | "overview"
  | "health"
  | "architecture"
  | "knowledge"
  | "insight"
  | "listener"
  | "stewardship"
  | "analytics"
  | "gaps"
  | "resources"
  | "card-lab"
  | "moderation";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "health", label: "Health" },
  { id: "architecture", label: "Architecture" },
  { id: "knowledge", label: "Knowledge Graph" },
  { id: "insight", label: "Recommendation Insight" },
  { id: "listener", label: "Listener Trace" },
  { id: "stewardship", label: "Stewardship" },
  { id: "analytics", label: "Analytics" },
  { id: "gaps", label: "Gaps" },
  { id: "resources", label: "Resources" },
  { id: "card-lab", label: "Card FX Lab" },
  { id: "moderation", label: "Moderation" },
];

export function AdminPortal({
  data,
  systemMap,
  health,
  contributions,
  currentStatus,
}: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Heavy tabs lazy-load their data the first time they are opened, then cache it client-side so
  // switching back is instant. This keeps the initial admin load light.
  const [insight, setInsight] = useState<RecommendationInsight | null>(null);
  const [stewardship, setStewardship] = useState<StewardshipData | null>(null);
  const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
  const [listenerBundle, setListenerBundle] = useState<ListenerBundle | null>(null);

  return (
    <div className="admin-portal">
      <header className="admin-portal-header">
        <div className="admin-portal-brand">
          <Image src="/icon.png" alt="AVLmc logo" width={42} height={42} className="admin-brand-mark" />
          <div>
            <strong>Admin Portal</strong>
            <small>AVL Music Companion</small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="admin-live-link" href="/admin/spotify-access">
            Spotify tester access →
          </Link>
          <Link className="admin-live-link" href="/admin/curators">
            Curators →
          </Link>
          <Link className="admin-live-link" href="/">
            ← Back to live site
          </Link>
        </div>
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
                <a href="/icon.png" target="_blank" rel="noreferrer" style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Image src="/icon.png" alt="Favicon preview" width={24} height={24} style={{ objectFit: 'cover' }} />
                </a>
              </div>
              <div className="admin-mini-row">
                <span>App Icon</span>
                <a href="/icon.png" target="_blank" rel="noreferrer" style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Image src="/icon.png" alt="App Icon preview" width={24} height={24} style={{ objectFit: 'cover' }} />
                </a>
              </div>
              <div className="admin-mini-row">
                <span>Open Graph (og:image)</span>
                <a href="/opengraph-image.png" target="_blank" rel="noreferrer" style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Image src="/opengraph-image.png" alt="OG Image preview" width={42} height={24} style={{ objectFit: 'cover' }} />
                </a>
              </div>
              <div className="admin-mini-row">
                <span>Twitter Image</span>
                <a href="/twitter-image.png" target="_blank" rel="noreferrer" style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Image src="/twitter-image.png" alt="Twitter Image preview" width={42} height={24} style={{ objectFit: 'cover' }} />
                </a>
              </div>
              <div className="admin-mini-row highlight">
                <span>Share Preview Validation</span>
                <strong style={{ color: '#22c55e' }}>Valid</strong>
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
            {tab.id === "health" && health.attention.length > 0 ? (
              <span className="admin-tab-badge alert">{health.attention.length}</span>
            ) : null}
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
        {activeTab === "overview" && (
          <OverviewSection
            data={data}
            insight={insight}
            setInsight={setInsight}
            onOpenInsight={() => setActiveTab("insight")}
          />
        )}
        {activeTab === "health" && <HealthSection health={health} />}
        {activeTab === "architecture" && (
          <ArchitectureSection systemMap={systemMap} health={health} />
        )}
        {activeTab === "knowledge" && (
          <KnowledgeGraphSection systemMap={systemMap} data={data} />
        )}
        {activeTab === "insight" && (
          <LazySection
            value={insight}
            setValue={setInsight}
            url="/api/admin/insight"
            render={(value) => <InsightSection insight={value} />}
          />
        )}
        {activeTab === "listener" && (
          <LazySection
            value={listenerBundle}
            setValue={setListenerBundle}
            url="/api/admin/listeners"
            render={(value) => (
              <ListenerGraphSection listeners={value.listeners} initialTrace={value.trace} />
            )}
          />
        )}
        {activeTab === "stewardship" && (
          <LazySection
            value={stewardship}
            setValue={setStewardship}
            url="/api/admin/stewardship"
            render={(value) => <StewardshipSection stewardship={value} />}
          />
        )}
        {activeTab === "analytics" && (
          <LazySection
            value={analytics}
            setValue={setAnalytics}
            url="/api/admin/analytics?range=7d"
            render={(value) => <AnalyticsSection initial={value} />}
          />
        )}
        {activeTab === "gaps" && <GapsSection data={data} />}
        {activeTab === "resources" && <ResourcesSection data={data} />}
        {activeTab === "card-lab" && <CardFxLabSection />}
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
/*  Lazy tab loader                                                    */
/* ================================================================== */

function LazySection<T>({
  value,
  setValue,
  url,
  render,
}: {
  value: T | null;
  setValue: (value: T) => void;
  url: string;
  render: (value: T) => ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value !== null) {
      return;
    }
    let active = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Could not load this tab’s data.");
        }
        return response.json();
      })
      .then((loaded) => {
        // Cache in the parent so returning to this tab is instant; parent stays mounted.
        setValue(loaded as T);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load this tab’s data.");
        }
      });
    return () => {
      active = false;
    };
  }, [url, value, setValue]);

  if (error) {
    return (
      <div className="admin-section">
        <div className="admin-section-header">
          <h2>Couldn’t load this tab</h2>
        </div>
        <p className="admin-meta">{error} Switch tabs and back to retry.</p>
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="admin-section admin-lazy-loading">
        <span className="admin-lazy-spinner" aria-hidden="true" />
        <p className="admin-meta">Loading…</p>
      </div>
    );
  }

  return <>{render(value)}</>;
}

/* ================================================================== */
/*  Overview Section                                                   */
/* ================================================================== */

function OverviewSection({
  data,
  insight,
  setInsight,
  onOpenInsight,
}: {
  data: AdminDashboardData;
  insight: RecommendationInsight | null;
  setInsight: (value: RecommendationInsight) => void;
  onOpenInsight: () => void;
}) {
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

      <DiscoveryHealthCard insight={insight} setInsight={setInsight} onOpenInsight={onOpenInsight} />

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
/*  Discovery Health summary (PRD 22 — Discovery Baseline)             */
/* ================================================================== */

/**
 * Compact discovery-health summary on Overview that links into Recommendation Insight. Lazily
 * fetches the same `/api/admin/insight` payload and caches it via `setInsight`, so opening the
 * Insight tab afterward is instant. Degrades to a plain link if the reading can't load.
 */
function DiscoveryHealthCard({
  insight,
  setInsight,
  onOpenInsight,
}: {
  insight: RecommendationInsight | null;
  setInsight: (value: RecommendationInsight) => void;
  onOpenInsight: () => void;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (insight !== null) return;
    let active = true;
    fetch("/api/admin/insight")
      .then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json();
      })
      .then((loaded) => {
        if (active) setInsight(loaded as RecommendationInsight);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [insight, setInsight]);

  return (
    <div className="admin-subsection">
      <div className="admin-baseline-methodology-head">
        <h3>Discovery health</h3>
        <button type="button" className="admin-button" onClick={onOpenInsight}>
          Open Recommendation Insight →
        </button>
      </div>
      {insight ? (
        <div className="admin-status-bar">
          <StatusIndicator
            label="Diversity"
            active={!insight.metrics.lowDiversity}
            detail={`${insight.metrics.venueSpread} venues`}
          />
          <StatusIndicator
            label="Novelty"
            active={insight.metrics.noveltyShare > 0}
            detail={`${insight.metrics.noveltyShare}% top-${insight.metrics.topN}`}
          />
          <StatusIndicator
            label="Coverage"
            active={insight.metrics.coverage.withSignal > 0}
            detail={`${insight.metrics.coverage.withSignal}/${insight.metrics.coverage.total}`}
          />
          <StatusIndicator
            label="Local value"
            active={insight.metrics.localValueShare > 0}
            detail={`${insight.metrics.localValueShare}%`}
          />
        </div>
      ) : (
        <p className="admin-meta">
          {failed
            ? "Open Recommendation Insight for the live discovery baseline reading."
            : "Loading discovery baseline…"}
        </p>
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
        <h3>Partner &amp; Resource Directory</h3>
        <p className="admin-meta">
          Partners, sponsors, community organizations, press, and venue contacts are now a managed,
          persisted directory — create and link them in the <strong>Stewardship → Directory</strong> tab,
          where they connect to venues and sources and appear in the knowledge graph.
        </p>
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
