"use client";

import { useState } from "react";
import type { AnalyticsRange, SystemAnalytics } from "@/lib/admin/analytics";

/**
 * Product Analytics & Usage Visibility (PRD 11 / C6, Outcome 7).
 *
 * Umami web analytics (traffic, top pages, referrers) joined with the app's first-party event
 * funnel and conversions, over a selectable range. The Umami half degrades to a clear
 * "not configured" notice; the first-party half always renders.
 */

const RANGES: Array<{ id: AnalyticsRange; label: string }> = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

export function AnalyticsSection({ initial }: { initial: SystemAnalytics }) {
  const [analytics, setAnalytics] = useState<SystemAnalytics>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRange(range: AnalyticsRange) {
    if (range === analytics.range || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics?range=${range}`);
      if (!response.ok) throw new Error("Failed to load analytics.");
      setAnalytics((await response.json()) as SystemAnalytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Product Analytics &amp; Usage</p>
        <h2>Analytics</h2>
        <p className="admin-lede">
          How people actually use AVL Music Companion — Umami web traffic joined with the app&apos;s
          own event funnel and conversions.
        </p>
      </div>

      <div className="admin-arch-toolbar">
        <div className="admin-view-toggle" role="tablist" aria-label="Analytics range">
          {RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              role="tab"
              aria-selected={analytics.range === range.id}
              className={`admin-view-toggle-btn${analytics.range === range.id ? " active" : ""}`}
              onClick={() => changeRange(range.id)}
              disabled={loading}
            >
              {range.label}
            </button>
          ))}
        </div>
        {loading && <span className="admin-meta">Loading…</span>}
        {error && <span className="admin-resource-form-error">{error}</span>}
      </div>

      {analytics.umamiAvailable && analytics.traffic ? (
        <TrafficCards traffic={analytics.traffic} />
      ) : (
        <div className="admin-health-attention-row warning admin-analytics-notice">
          <span className="admin-health-dot" style={{ background: "#f0a93a" }} />
          <div className="admin-health-attention-body">
            <strong>Umami web traffic not shown</strong>
            <p>{analytics.umamiMessage ?? "Umami is not configured."} First-party usage below is live.</p>
          </div>
        </div>
      )}

      {analytics.umamiAvailable && (
        <div className="admin-analytics-two">
          <MetricList title="Top pages" metrics={analytics.topPages} empty="No page data." />
          <MetricList title="Referral sources" metrics={analytics.referrers} empty="No referrer data." />
        </div>
      )}

      <div className="admin-subsection">
        <h3>Event funnel</h3>
        <p className="admin-meta">Arrival → browse → engage. Umami page-level views beside exact first-party actions.</p>
        <div className="admin-funnel">
          {analytics.funnel.map((step) => (
            <div className="admin-funnel-step" key={step.label}>
              <span className="admin-funnel-value">{step.value.toLocaleString()}</span>
              <span className="admin-funnel-label">{step.label}</span>
              <span className={`admin-badge ${step.source === "umami" ? "source" : "community"}`}>{step.source}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-subsection">
        <h3>Conversions ({analytics.range})</h3>
        <div className="admin-stat-grid">
          {analytics.conversions.map((conversion) => (
            <div className="admin-stat-card" key={conversion.label}>
              <span className="admin-stat-value">{conversion.value.toLocaleString()}</span>
              <span className="admin-stat-label">{conversion.label}</span>
            </div>
          ))}
        </div>
      </div>

      <ScalingMilestone scaling={analytics.scaling} />

      <p className="admin-meta admin-arch-footnote">
        Generated {new Date(analytics.generatedAt).toLocaleString()} · Umami{" "}
        {analytics.umamiConfigured ? (analytics.umamiAvailable ? "connected" : "configured but unavailable") : "not configured"}.
      </p>
    </div>
  );
}

function TrafficCards({ traffic }: { traffic: NonNullable<SystemAnalytics["traffic"]> }) {
  return (
    <div className="admin-stat-grid">
      <div className="admin-stat-card">
        <span className="admin-stat-value">{traffic.visitors.toLocaleString()}</span>
        <span className="admin-stat-label">Unique visitors</span>
        <small className="admin-stat-detail">{trend(traffic.visitors, traffic.visitorsPrev)}</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{traffic.visits.toLocaleString()}</span>
        <span className="admin-stat-label">Sessions</span>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{traffic.pageviews.toLocaleString()}</span>
        <span className="admin-stat-label">Pageviews</span>
        <small className="admin-stat-detail">{trend(traffic.pageviews, traffic.pageviewsPrev)}</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{traffic.bounceRate === null ? "—" : `${traffic.bounceRate}%`}</span>
        <span className="admin-stat-label">Bounce rate</span>
      </div>
    </div>
  );
}

function MetricList({ title, metrics, empty }: { title: string; metrics: SystemAnalytics["topPages"]; empty: string }) {
  const max = Math.max(1, ...metrics.map((metric) => metric.value));
  return (
    <div className="admin-subsection" style={{ margin: 0 }}>
      <h3>{title}</h3>
      {metrics.length === 0 ? (
        <p className="admin-meta">{empty}</p>
      ) : (
        <div className="admin-metric-list">
          {metrics.map((metric) => (
            <div className="admin-metric-row" key={metric.label}>
              <span className="admin-metric-label">{metric.label || "(direct)"}</span>
              <div className="admin-metric-bar">
                <span style={{ width: `${(metric.value / max) * 100}%` }} />
              </div>
              <strong>{metric.value.toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScalingMilestone({ scaling }: { scaling: SystemAnalytics["scaling"] }) {
  const nearing = scaling.pctOfCeiling >= 70;
  return (
    <div className="admin-subsection">
      <h3>Umami free-tier usage</h3>
      <p className="admin-meta">
        {scaling.monthlyEvents.toLocaleString()} first-party events in the last 30 days ·{" "}
        {scaling.pctOfCeiling}% of the {scaling.ceiling.toLocaleString()}/mo free-tier ceiling.
      </p>
      <div className="admin-steward-complete-bar" style={{ height: 8 }}>
        <span
          style={{
            width: `${Math.min(100, scaling.pctOfCeiling)}%`,
            background: nearing ? "#f0a93a" : "#34d399",
          }}
        />
      </div>
      {nearing && (
        <p className="admin-health-remediation">
          → Approaching the Umami free-tier ceiling — review the self-host / upgrade scaling milestone.
        </p>
      )}
    </div>
  );
}

function trend(current: number, prev: number | null): string {
  if (prev === null || prev === 0) return "vs. previous period";
  const delta = Math.round(((current - prev) / prev) * 100);
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
  return `${arrow} ${Math.abs(delta)}% vs. previous`;
}
