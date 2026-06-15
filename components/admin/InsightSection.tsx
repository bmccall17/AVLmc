"use client";

import { useMemo, useState } from "react";
import type { RankedEvent, RecommendationInsight } from "@/lib/admin/insight";

/**
 * Recommendation Quality & Listener Insight (PRD 09 / C4, Outcome 5).
 *
 * Explains the ranking engine: aggregate quality metrics, an anonymous-vs-signed-in comparison
 * (using a synthetic, public-derived taste profile), per-event score breakdowns from the live
 * scoring output, and the behavioral-signal mix. No private profile values are shown.
 */

export function InsightSection({ insight }: { insight: RecommendationInsight }) {
  const [selectedId, setSelectedId] = useState<string | null>(insight.signedIn[0]?.eventId ?? null);

  const selected = useMemo(() => {
    const signed = insight.signedIn.find((event) => event.eventId === selectedId);
    const anon = insight.anonymous.find((event) => event.eventId === selectedId);
    return { signed, anon };
  }, [insight, selectedId]);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Recommendation Quality &amp; Listener Insight</p>
        <h2>Recommendation Insight</h2>
        <p className="admin-lede">
          Why events are ranked the way they are, how a signed-in listener&apos;s taste changes the
          order, and whether personalization is diverse and locally valuable. Explanations come
          straight from the live scoring output.
        </p>
      </div>

      <MetricsRow insight={insight} />

      {insight.movers.length > 0 && (
        <div className="admin-subsection">
          <h3>What changes when signed in</h3>
          <p className="admin-meta">
            Synthetic taste profile: {insight.syntheticProfile.artists.join(", ") || "none available"}.{" "}
            <em>{insight.syntheticProfile.note}</em>
          </p>
          <div className="admin-mover-list">
            {insight.movers.map((mover) => (
              <div className="admin-mover" key={mover.eventId}>
                <span className={`admin-mover-delta ${mover.delta > 0 ? "up" : "down"}`}>
                  {mover.delta > 0 ? "▲" : "▼"} {Math.abs(mover.delta)}
                </span>
                <div className="admin-mover-body">
                  <strong>{mover.title}</strong>
                  <small>
                    #{mover.anonRank} → #{mover.signedRank} · {mover.reason}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="admin-subsection">
        <h3>Ranking: anonymous vs. signed-in</h3>
        <div className="admin-insight-columns">
          <RankColumn
            title="Anonymous visitor"
            subtitle="Public &amp; community signals only"
            events={insight.anonymous}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <RankColumn
            title="Signed-in (synthetic taste)"
            subtitle="Adds taste profile &amp; personal signals"
            events={insight.signedIn}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      {selected.signed && (
        <ScoreBreakdown signed={selected.signed} anonScore={selected.anon?.score ?? null} />
      )}

      <BehaviorPanel behavior={insight.behavior} />

      <p className="admin-meta admin-arch-footnote">
        Scored over the rolling window · generated {new Date(insight.generatedAt).toLocaleString()}.
      </p>
    </div>
  );
}

function MetricsRow({ insight }: { insight: RecommendationInsight }) {
  const { metrics } = insight;
  return (
    <div className="admin-stat-grid">
      <div className={`admin-stat-card${metrics.lowDiversity ? " warning" : ""}`}>
        <span className="admin-stat-value">{metrics.venueSpread}</span>
        <span className="admin-stat-label">Venue spread (top {metrics.topN})</span>
        <small className="admin-stat-detail">
          {metrics.artistSpread} artists · {metrics.tagSpread} tags
          {metrics.lowDiversity ? " · low diversity" : ""}
        </small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{metrics.localValueShare}%</span>
        <span className="admin-stat-label">Local value</span>
        <small className="admin-stat-detail">top results with community signal</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{metrics.coverage.withSignal}</span>
        <span className="admin-stat-label">Personalized</span>
        <small className="admin-stat-detail">
          of {metrics.coverage.total} events · {metrics.coverage.timingOnly} rank on timing alone
        </small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-label">Signal mix (top {metrics.topN})</span>
        <div className="admin-signal-mix">
          {metrics.signalMix.map((entry) => (
            <div className="admin-signal-mix-row" key={entry.label}>
              <span>{entry.label}</span>
              <strong>{entry.count}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RankColumn({
  title,
  subtitle,
  events,
  selectedId,
  onSelect,
}: {
  title: string;
  subtitle: string;
  events: RankedEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="admin-insight-col">
      <div className="admin-insight-col-head">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <ol className="admin-rank-list">
        {events.slice(0, 12).map((event) => (
          <li key={event.eventId}>
            <button
              type="button"
              className={`admin-rank-item${selectedId === event.eventId ? " active" : ""}`}
              onClick={() => onSelect(event.eventId)}
            >
              <span className="admin-rank-num">{event.rank}</span>
              <span className="admin-rank-body">
                <strong>{event.title}</strong>
                <small>
                  {event.venueName} · score {event.score}
                  {event.spotifyMatched ? " · ♫ match" : ""}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScoreBreakdown({ signed, anonScore }: { signed: RankedEvent; anonScore: number | null }) {
  const maxTotal = Math.max(1, ...signed.components.map((component) => Math.abs(component.total)));
  return (
    <div className="admin-node-detail">
      <div className="admin-node-detail-header">
        <div>
          <span className="admin-badge layer">Why this ranks here</span>
          <h3>{signed.title}</h3>
        </div>
      </div>
      <p className="admin-node-detail-desc">
        Signed-in score <strong>{signed.score}</strong>
        {anonScore !== null ? ` · anonymous score ${anonScore}` : ""} · rank #{signed.rank}.{" "}
        {signed.spotifyMatched ? "Spotify artist match contributed." : "No Spotify profile match → profile component = 0."}
      </p>

      {signed.reasons.length > 0 && (
        <div className="admin-insight-reasons">
          {signed.reasons.map((reason) => (
            <span className="admin-badge community" key={reason}>
              {reason}
            </span>
          ))}
        </div>
      )}

      <div className="admin-component-list">
        {signed.components.length === 0 ? (
          <p className="admin-meta">No weighted components contributed beyond base timing.</p>
        ) : (
          signed.components.map((component) => (
            <div className="admin-component-row" key={component.label}>
              <span className="admin-component-label">{component.label}</span>
              <div className="admin-component-bar">
                <span
                  className={component.total >= 0 ? "pos" : "neg"}
                  style={{ width: `${(Math.abs(component.total) / maxTotal) * 100}%` }}
                />
              </div>
              <span className="admin-component-total">{component.total > 0 ? "+" : ""}{component.total}</span>
              <span className="admin-component-weight">×{component.weight}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BehaviorPanel({ behavior }: { behavior: RecommendationInsight["behavior"] }) {
  return (
    <div className="admin-subsection">
      <h3>Behavioral signals</h3>
      {behavior.total === 0 ? (
        <p className="admin-meta">No interaction events recorded yet.</p>
      ) : (
        <>
          <p className="admin-meta">
            {behavior.total} interactions recorded ·{" "}
            {behavior.negativeLearningActive
              ? `${behavior.removals} removals are downranking similar events (negative learning active)`
              : "no removals yet"}
            .
          </p>
          <div className="admin-mini-table">
            {behavior.byAction.map((action) => (
              <div className="admin-mini-row" key={action.action}>
                <span>{formatAction(action.action)}</span>
                <strong>{action.count}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
