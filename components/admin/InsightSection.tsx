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

      <MethodologyStrip insight={insight} />

      <MetricsRow insight={insight} />

      <SocialStrip insight={insight} />

      <PersonalizationStrip insight={insight} />

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

/**
 * Pinned methodology (PRD 22 — Discovery Baseline): a reading is reproducible only if its window,
 * synthetic profile, and scorer version are stated, and recordable via a dated markdown snapshot.
 */
function MethodologyStrip({ insight }: { insight: RecommendationInsight }) {
  const { methodology: m } = insight;
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(insight.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-subsection admin-baseline-methodology">
      <div className="admin-baseline-methodology-head">
        <div>
          <h3>Baseline reading · methodology</h3>
          <p className="admin-meta">
            Fixed methodology so two readings compare like-for-like — a snapshot is{" "}
            <strong>descriptive</strong>, not a single quality score.
          </p>
        </div>
        <button type="button" className="admin-button" onClick={copyMarkdown}>
          {copied ? "Copied ✓" : "Copy baseline reading as markdown"}
        </button>
      </div>
      <div className="admin-mini-table">
        <div className="admin-mini-row">
          <span>Event window</span>
          <strong>
            <code>{m.windowStart || "?"}</code> → <code>{m.windowEnd || "?"}</code>
          </strong>
        </div>
        <div className="admin-mini-row">
          <span>Scorer version</span>
          <strong>
            v{m.scorerVersion}
            {m.commit ? ` · ${m.commit}` : ""}
          </strong>
        </div>
        <div className="admin-mini-row">
          <span>Synthetic profile</span>
          <strong>{m.syntheticProfileNote}</strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Social & Curator Benchmark strip (PRD 27 / C5): "your people" lift read SEPARATELY from anonymous
 * popularity, the influence-concentration early warning, and the floor-holds confirmation. Synthetic,
 * descriptive — never a quality score; no money buys rank.
 */
function SocialStrip({ insight }: { insight: RecommendationInsight }) {
  const s = insight.social;
  if (!s) {
    return null;
  }

  return (
    <div className="admin-subsection admin-social-strip">
      <h3>Social &amp; Curator benchmark</h3>
      <p className="admin-meta">
        Synthetic-circle reading on the fixed methodology — <em>descriptive, not a quality score; no money buys rank.</em>
      </p>
      <div className="admin-stat-row">
        <div className="admin-stat-card">
          <span className="admin-stat-value">{s.socialLift}</span>
          <span className="admin-stat-label">&ldquo;Your people&rdquo; lift</span>
          <small className="admin-stat-detail">vs. anonymous popularity {s.popularityLift}</small>
          <small className="admin-stat-def">socialCircle vs socialHeat across the top-N — read separately, never combined.</small>
        </div>
        <div className={`admin-stat-card${s.concentrationFlag ? " warning" : ""}`}>
          <span className="admin-stat-value">{Math.round(s.concentrationShare * 100)}%</span>
          <span className="admin-stat-label">Influence concentration</span>
          <small className="admin-stat-detail">{s.concentrationFlag ? "⚠ early-warning threshold crossed" : "within range"}</small>
          <small className="admin-stat-def">Share of social-driven movement from the single largest source (person / curator / network).</small>
        </div>
        <div className={`admin-stat-card${s.floorHolds ? "" : " warning"}`}>
          <span className="admin-stat-value">{s.floorHolds ? "Holds" : "⚠ regressed"}</span>
          <span className="admin-stat-label">Local/novel floor (social maxed)</span>
          <small className="admin-stat-detail">novelty {s.socialNoveltyShare}% vs baseline {s.baselineNoveltyShare}%</small>
          <small className="admin-stat-def">Confirms the Phase 11 exploration floor isn&apos;t crowded out with social on.</small>
        </div>
      </div>
    </div>
  );
}

/**
 * Deeper Personalization Benchmark strip (PRD 28 / Phase 10, Outcome 2): a real-listener aggregate
 * read of whether personalization gives meaningfully different and more useful rankings than the
 * anonymous baseline — lift/displacement, the skip-influence headline, which signals drove it,
 * coverage, and the loop-protection guardrail. Aggregate only (no listener identities); descriptive,
 * never a quality score. The reproducible synthetic-behavior fixture is parked (see PRD 28).
 */
function PersonalizationStrip({ insight }: { insight: RecommendationInsight }) {
  const p = insight.personalization;
  const [copied, setCopied] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(p.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!p.available) {
    return (
      <div className="admin-subsection admin-personalization-strip">
        <h3>Deeper Personalization benchmark</h3>
        <p className="admin-meta">
          No traceable listeners with enough signal yet — nothing to aggregate. This reads real
          listeners, so it fills in once signed-in listeners accumulate taste/behavior signals.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-subsection admin-personalization-strip">
      <div className="admin-baseline-methodology-head">
        <div>
          <h3>Deeper Personalization benchmark</h3>
          <p className="admin-meta">
            Aggregate roll-up of {p.methodology.listenersAnalyzed} real listeners&apos; rankings vs. the
            anonymous baseline — <em>descriptive, not a quality score; aggregate only, no listener identities.</em>
          </p>
        </div>
        <button type="button" className="admin-button" onClick={copyMarkdown}>
          {copied ? "Copied ✓" : "Copy personalization benchmark as markdown"}
        </button>
      </div>
      <div className="admin-stat-row">
        <div className="admin-stat-card">
          <span className="admin-stat-value">{p.lift.personalizedShare}%</span>
          <span className="admin-stat-label">Listeners personalized</span>
          <small className="admin-stat-detail">
            mean displacement {p.lift.meanDisplacement} ranks · median {p.lift.medianDisplacement}
          </small>
          <small className="admin-stat-def">
            Share of the {p.lift.listeners} analyzed listeners whose top-N differs from anonymous, and by how far.
          </small>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-value">{p.skip.skipReasonShare}%</span>
          <span className="admin-stat-label">Skips move ranking</span>
          <small className="admin-stat-detail">
            {p.skip.listenersWithSkipReason}/{p.lift.listeners} listeners · {p.skip.skipReasonEvents} events cooled
          </small>
          <small className="admin-stat-def">
            Listeners seeing a &ldquo;you tend to skip…&rdquo; reason — implicit cooling, capped below explicit remove.
          </small>
        </div>
        <div className={`admin-stat-card${p.guardrails.floorHolds ? "" : " warning"}`}>
          <span className="admin-stat-value">{p.guardrails.floorHolds ? "Holds" : "⚠ regressed"}</span>
          <span className="admin-stat-label">Novelty floor (personalized)</span>
          <small className="admin-stat-detail">
            personalized {p.guardrails.meanNoveltyShare}% vs baseline {p.guardrails.baselineNoveltyShare}%
          </small>
          <small className="admin-stat-def">
            Loop-protection: personalization isn&apos;t burying the quiet/local shows below the anonymous floor.
          </small>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-value">{p.coverage.personalized}</span>
          <span className="admin-stat-label">Coverage</span>
          <small className="admin-stat-detail">
            of {p.coverage.withSignal} with signal · {p.coverage.traceable} traceable
          </small>
          <small className="admin-stat-def">
            How many listeners have enough taste/behavior signal for personalization to do anything.
          </small>
        </div>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-label">Top signals driving personalization</span>
        <div className="admin-signal-mix">
          {p.attribution.length === 0 ? (
            <p className="admin-meta">No personalization reasons surfaced yet.</p>
          ) : (
            p.attribution.map((entry) => (
              <div className="admin-signal-mix-row" key={entry.label}>
                <span>{entry.label}</span>
                <strong>{entry.count}</strong>
              </div>
            ))
          )}
        </div>
        <small className="admin-stat-def">
          Explainable reasons across the analyzed listeners&apos; surfaced events — per-listener evidence lives in Listener Trace.
        </small>
      </div>
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
        <small className="admin-stat-def">Distinct venues/artists/tags across the top-{metrics.topN} — how varied the surfaced set is.</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{metrics.noveltyShare}%</span>
        <span className="admin-stat-label">Novelty</span>
        <small className="admin-stat-detail">of top-{metrics.topN} under-the-radar</small>
        <small className="admin-stat-def">Share of the top-{metrics.topN} that is quiet (low heat, no profile/personal signal) — is exploration surfacing?</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{metrics.localValueShare}%</span>
        <span className="admin-stat-label">Local value</span>
        <small className="admin-stat-detail">top results with community signal</small>
        <small className="admin-stat-def">Share of the top-{metrics.topN} carrying Asheville community activity.</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{metrics.engagement.topNHeatShare}%</span>
        <span className="admin-stat-label">Engagement concentration</span>
        <small className="admin-stat-detail">{metrics.engagement.totalHeat} total heat in window</small>
        <small className="admin-stat-def">Share of all community heat concentrated in the top-{metrics.topN} — is attention top-heavy?</small>
      </div>
      <div className="admin-stat-card">
        <span className="admin-stat-value">{metrics.coverage.withSignal}</span>
        <span className="admin-stat-label">Personalized</span>
        <small className="admin-stat-detail">
          of {metrics.coverage.total} events · {metrics.coverage.timingOnly} rank on timing alone
        </small>
        <small className="admin-stat-def">Events whose score changes once a taste profile is applied (signal coverage).</small>
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
        <small className="admin-stat-def">Dominant ranking component per top-{metrics.topN} event.</small>
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
          <p className="admin-meta">
            {behavior.implicitLearningActive
              ? `${behavior.impressions} impressions feed implicit skip cooling (repeatedly-shown, never-engaged dimensions gently cool)`
              : "no impressions captured yet for implicit skip cooling"}
            .
          </p>
          {behavior.impressions > 0 && (
            <p className="admin-meta">
              {behavior.impressionNonConversionShare}% of impressions never convert to an engagement
              action — the soft-negative volume Deeper Personalization learns from (window-wide proxy).
            </p>
          )}
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
