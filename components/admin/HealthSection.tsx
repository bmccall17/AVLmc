"use client";

import type {
  HealthProbe,
  HealthSeverity,
  HealthStatus,
  SystemHealth,
} from "@/lib/admin/health";

/**
 * System Health & Connection Visibility (PRD 07 / C2, Outcome 4).
 *
 * A severity-ranked "Needs Attention" list over a per-dependency status grid, plus scheduled-job
 * history. Shows whether the database, AVLgo feed, auth/Spotify, cron jobs, blob storage, and
 * Umami are actually working — not just whether env vars are present. One failing probe never
 * breaks the page (each probe degrades on its own).
 */

const SEVERITY_DOT: Record<HealthSeverity, string> = {
  ok: "#34d399",
  info: "#94a3b8",
  warning: "#f0a93a",
  critical: "#f87171",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: "Healthy",
  degraded: "Degraded",
  down: "Down",
  stale: "Stale",
  misconfigured: "Misconfigured",
  not_configured: "Not configured",
  unknown: "Unknown",
};

type HealthSectionProps = {
  health: SystemHealth;
};

export function HealthSection({ health }: HealthSectionProps) {
  const cronProbes = health.probes.filter((probe) => probe.schedule);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">System Health &amp; Connections</p>
        <h2>Health</h2>
        <p className="admin-lede">
          Live status for every critical dependency — checked when this page loaded, not just config
          presence. {health.okCount} of {health.probes.length} checks healthy.
        </p>
      </div>

      {health.attention.length === 0 ? (
        <div className="admin-health-calm">
          <span className="admin-health-calm-dot" />
          <div>
            <strong>All systems healthy</strong>
            <small>No dependencies need attention right now.</small>
          </div>
        </div>
      ) : (
        <div className="admin-subsection">
          <h3>Needs Attention ({health.attention.length})</h3>
          <div className="admin-health-attention">
            {health.attention.map((probe) => (
              <AttentionRow key={probe.id} probe={probe} />
            ))}
          </div>
        </div>
      )}

      <div className="admin-subsection">
        <h3>All Dependencies</h3>
        <div className="admin-health-grid">
          {health.probes.map((probe) => (
            <ProbeCard key={probe.id} probe={probe} />
          ))}
        </div>
      </div>

      {cronProbes.length > 0 && (
        <div className="admin-subsection">
          <h3>Scheduled Jobs</h3>
          <p className="admin-meta">
            Configured in <code>vercel.json</code>; last runs recorded in{" "}
            <code>system_job_runs</code>.
          </p>
          <div className="admin-health-jobs">
            {cronProbes.map((probe) => (
              <JobCard key={probe.id} probe={probe} />
            ))}
          </div>
        </div>
      )}

      <p className="admin-meta admin-arch-footnote">
        Checked {formatTimestamp(health.generatedAt)} · cached briefly to avoid hammering providers.
      </p>
    </div>
  );
}

function AttentionRow({ probe }: { probe: HealthProbe }) {
  return (
    <div className={`admin-health-attention-row ${probe.severity}`}>
      <span className="admin-health-dot" style={{ background: SEVERITY_DOT[probe.severity] }} />
      <div className="admin-health-attention-body">
        <div className="admin-health-attention-head">
          <strong>{probe.label}</strong>
          <span className="admin-health-status">{STATUS_LABEL[probe.status]}</span>
        </div>
        <p>{probe.detail}</p>
        {probe.remediation && <small className="admin-health-remediation">→ {probe.remediation}</small>}
      </div>
    </div>
  );
}

function ProbeCard({ probe }: { probe: HealthProbe }) {
  return (
    <div className="admin-health-card">
      <div className="admin-health-card-head">
        <span className="admin-health-dot" style={{ background: SEVERITY_DOT[probe.severity] }} />
        <strong>{probe.label}</strong>
        <span className="admin-health-status">{STATUS_LABEL[probe.status]}</span>
      </div>
      <p>{probe.detail}</p>
      <div className="admin-health-card-foot">
        {typeof probe.latencyMs === "number" && <span>{probe.latencyMs}ms</span>}
        <span>checked {formatTimeOnly(probe.checkedAt)}</span>
      </div>
    </div>
  );
}

function JobCard({ probe }: { probe: HealthProbe }) {
  return (
    <div className="admin-health-job">
      <div className="admin-health-card-head">
        <span className="admin-health-dot" style={{ background: SEVERITY_DOT[probe.severity] }} />
        <strong>{probe.label}</strong>
        <code className="admin-health-schedule">{probe.schedule}</code>
      </div>
      <p>{probe.detail}</p>
      {probe.runs && probe.runs.length > 0 && (
        <div className="admin-health-runs">
          {probe.runs.map((run) => (
            <div className={`admin-health-run ${run.status}`} key={run.id}>
              <span className="admin-health-run-status">{run.status === "success" ? "✓" : "✕"}</span>
              <span>{formatTimestamp(run.finishedAt)}</span>
              {typeof run.itemsProcessed === "number" && <span>{run.itemsProcessed} items</span>}
              {typeof run.durationMs === "number" && <span>{Math.round(run.durationMs)}ms</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
