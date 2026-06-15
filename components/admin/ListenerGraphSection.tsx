"use client";

import { useState } from "react";
import type {
  ListenerSummary,
  ListenerTrace,
  ListenerTraceEvent,
} from "@/lib/admin/listener-graph";

/**
 * Listener Taste Knowledge Graph (PRD 10 / C5, Outcome 2).
 *
 * A visual, expandable per-listener trace: identity → connected music data → expressed preferences
 * → behavioral signals → taste settings → surfaced events. Clicking a surfaced event shows the
 * per-listener score breakdown and its movement vs. the anonymous baseline. Admin-only; no tokens
 * or secrets are ever shown. The staged layout doubles as the non-graph accessible fallback.
 */

type Props = {
  listeners: ListenerSummary[];
  initialTrace: ListenerTrace | null;
};

export function ListenerGraphSection({ listeners, initialTrace }: Props) {
  const [trace, setTrace] = useState<ListenerTrace | null>(initialTrace);
  const [selectedId, setSelectedId] = useState<string | null>(initialTrace?.summary.identityKey ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  async function selectListener(identityKey: string) {
    if (identityKey === selectedId) return;
    setSelectedId(identityKey);
    setLoading(true);
    setError(null);
    setOpenEvent(null);
    try {
      const response = await fetch(`/api/admin/listener-trace?id=${encodeURIComponent(identityKey)}`);
      if (!response.ok) throw new Error("Failed to load trace.");
      const data = (await response.json()) as { trace: ListenerTrace };
      setTrace(data.trace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trace.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Listener Taste Knowledge Graph</p>
        <h2>Listener Taste Trace</h2>
        <p className="admin-lede">
          Follow one listener from identity through connected data, preferences, signals, and taste
          settings to the events surfaced for them. Admin-only · no tokens or secrets are shown.
        </p>
      </div>

      {listeners.length === 0 ? (
        <p className="admin-meta">No listeners with taste data yet. Traces appear once people sign in, connect music, or interact with events.</p>
      ) : (
        <div className="admin-steward-controls">
          <label className="admin-listener-picker">
            <span>Listener</span>
            <select value={selectedId ?? ""} onChange={(event) => selectListener(event.target.value)} disabled={loading}>
              {listeners.map((listener) => (
                <option key={listener.identityKey} value={listener.identityKey}>
                  {listener.label}
                  {listener.kind === "anonymous" ? " (anon)" : ""} · {listener.profileItemCount} taste · {listener.signalCount} signals
                </option>
              ))}
            </select>
          </label>
          {loading && <span className="admin-meta">Loading…</span>}
          {error && <span className="admin-resource-form-error">{error}</span>}
        </div>
      )}

      {trace && (
        <div className="admin-trace">
          <Stage n={1} title="Identity">
            <div className="admin-trace-row">
              <strong>{trace.summary.label}</strong>
              <span className={`admin-badge ${trace.summary.kind === "user" ? "active" : "stale"}`}>
                {trace.summary.kind === "user" ? "Signed-in" : "Anonymous"}
              </span>
              {trace.summary.connected && <span className="admin-badge community">Connected</span>}
              {trace.summary.optedOut && <span className="admin-badge stale">Opted out</span>}
            </div>
            <p className="admin-meta">{trace.summary.signalCount} behavioral signals recorded.</p>
          </Stage>

          <Stage n={2} title="Connected music data">
            {trace.connections.length === 0 ? (
              <p className="admin-meta">No connected music providers{trace.summary.kind === "anonymous" ? " (anonymous listener)" : ""}.</p>
            ) : (
              <>
                {trace.connections.map((connection) => (
                  <div className="admin-trace-row" key={connection.provider}>
                    <strong>{connection.provider}</strong>
                    <span className="admin-meta">
                      connected {fmt(connection.connectedAt)} · synced {connection.lastSyncedAt ? fmt(connection.lastSyncedAt) : "—"}
                    </span>
                    {connection.disconnectedAt && <span className="admin-badge stale">Disconnected</span>}
                    {connection.optedOut && <span className="admin-badge stale">Taste opt-out</span>}
                  </div>
                ))}
                <p className="admin-meta">
                  {trace.profileItemCount} taste items · top artists (private):{" "}
                  {trace.topArtists.length > 0 ? trace.topArtists.join(", ") : "none synced"}
                </p>
              </>
            )}
          </Stage>

          <Stage n={3} title="Expressed preferences">
            <div className="admin-trace-weights">
              {trace.preferences.weights.map((weight) => (
                <span key={weight.key} className={`admin-trace-weight${weight.weight !== 0 ? " set" : ""}`}>
                  {weight.label} <em>{weight.weight > 0 ? "+" : ""}{weight.weight}</em>
                </span>
              ))}
            </div>
            {trace.preferences.customSignals.length > 0 && (
              <p className="admin-meta">
                Custom: {trace.preferences.customSignals.map((signal) => `${signal.label} (${signal.direction})`).join(", ")}
              </p>
            )}
          </Stage>

          <Stage n={4} title="Behavioral signals">
            {trace.signals.total === 0 ? (
              <p className="admin-meta">No behavioral signals yet.</p>
            ) : (
              <>
                <p className="admin-meta">
                  {trace.signals.fired} fired · {trace.signals.planning} planning · {trace.signals.removed} removed
                  {trace.signals.removed > 0 ? " (negative learning active)" : ""}
                </p>
                <div className="admin-trace-weights">
                  {trace.signals.byAction.map((action) => (
                    <span key={action.action} className="admin-trace-weight">
                      {action.action.replace(/_/g, " ")} <em>{action.count}</em>
                    </span>
                  ))}
                </div>
              </>
            )}
          </Stage>

          <Stage n={5} title="Taste settings">
            <p className="admin-meta">
              {trace.tasteContributes ? (
                <>Taste <strong>contributes</strong> to this listener&apos;s ranking.</>
              ) : (
                <>
                  Taste contribution is <strong>gated</strong>
                  {trace.summary.optedOut ? " (opted out)" : trace.summary.kind === "anonymous" ? " (anonymous — public/behavioral signals only)" : " (no synced profile)"} —
                  ranking falls back toward the anonymous baseline.
                </>
              )}
            </p>
          </Stage>

          <Stage n={6} title="Surfaced events">
            {trace.surfacedEvents.length === 0 ? (
              <p className="admin-meta">No events in the current window to surface.</p>
            ) : (
              <ol className="admin-rank-list">
                {trace.surfacedEvents.map((event) => (
                  <li key={event.eventId}>
                    <button
                      type="button"
                      className={`admin-rank-item${openEvent === event.eventId ? " active" : ""}`}
                      onClick={() => setOpenEvent(openEvent === event.eventId ? null : event.eventId)}
                    >
                      <span className="admin-rank-num">{event.personalRank}</span>
                      <span className="admin-rank-body">
                        <strong>{event.title}</strong>
                        <small>
                          {event.venueName} · {moverLabel(event)}
                          {event.spotifyMatched ? " · ♫ match" : ""}
                        </small>
                      </span>
                    </button>
                    {openEvent === event.eventId && <EventBreakdown event={event} />}
                  </li>
                ))}
              </ol>
            )}
          </Stage>
        </div>
      )}
    </div>
  );
}

function Stage({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="admin-trace-stage">
      <div className="admin-trace-stage-head">
        <span className="admin-arch-number">{n}</span>
        <strong>{title}</strong>
      </div>
      <div className="admin-trace-stage-body">{children}</div>
    </div>
  );
}

function EventBreakdown({ event }: { event: ListenerTraceEvent }) {
  const max = Math.max(1, ...event.components.map((component) => Math.abs(component.total)));
  return (
    <div className="admin-trace-breakdown">
      <p className="admin-meta">
        Personal score {event.personalScore} · anonymous {event.anonymousScore} · {moverLabel(event)}.{" "}
        {event.spotifyMatched ? "Includes a Spotify artist match." : "No Spotify match for this listener."}
      </p>
      {event.reasons.length > 0 && (
        <div className="admin-insight-reasons">
          {event.reasons.map((reason) => (
            <span className="admin-badge community" key={reason}>{reason}</span>
          ))}
        </div>
      )}
      <div className="admin-component-list">
        {event.components.map((component) => (
          <div className="admin-component-row" key={component.label}>
            <span className="admin-component-label">{component.label}</span>
            <div className="admin-component-bar">
              <span className={component.total >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(component.total) / max) * 100}%` }} />
            </div>
            <span className="admin-component-total">{component.total > 0 ? "+" : ""}{component.total}</span>
            <span className="admin-component-weight">×{component.weight}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function moverLabel(event: ListenerTraceEvent): string {
  if (event.delta > 0) return `▲ ${event.delta} vs anon (#${event.anonymousRank})`;
  if (event.delta < 0) return `▼ ${Math.abs(event.delta)} vs anon (#${event.anonymousRank})`;
  return `= anon (#${event.anonymousRank})`;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
