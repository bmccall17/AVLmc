"use client";

import { useMemo, useState } from "react";
import type { SystemMap, SystemMapNode } from "@/lib/admin/registry";
import type { HealthProbe, HealthSeverity, SystemHealth } from "@/lib/admin/health";
import {
  NODE_KIND_LABELS,
  SYSTEM_LAYERS,
  type NodeKind,
  type RegistryEdge,
  type SystemLayer,
} from "@/lib/system-registry";

/**
 * Living architectural reference (PRD 06 / C1, Outcomes 1 & 3).
 *
 * Renders the System Registry as an interactive, expandable graph that starts at a high-level
 * layered view and lets any node expand for depth. A non-graph "list" view provides the same
 * information for accessibility and small screens. Both views are driven by the single registry
 * the JSON export and generated Markdown also consume — there is no second hand-maintained model.
 */

type ArchitectureSectionProps = {
  systemMap: SystemMap;
  health?: SystemHealth;
};

const SEVERITY_DOT: Record<HealthSeverity, string> = {
  ok: "#34d399",
  info: "#94a3b8",
  warning: "#f0a93a",
  critical: "#f87171",
};

const LAYER_COLOR: Record<SystemLayer, string> = {
  sources: "#f59e0b",
  processing: "#a78bfa",
  data: "#60a5fa",
  experience: "#34d399",
  community: "#f472b6",
  identity: "#2dd4bf",
  operations: "#94a3b8",
  partners: "#facc15",
};

const KIND_GLYPH: Record<NodeKind, string> = {
  surface: "▦",
  service: "⚙",
  datastore: "▤",
  integration: "⇄",
  job: "⏱",
  external_source: "☁",
  partner: "★",
};

// Layout geometry for the SVG graph.
const NODE_W = 158;
const NODE_H = 58;
const COL_GAP = 224;
const ROW_GAP = 18;
const PAD = 28;

type Positioned = {
  node: SystemMapNode;
  x: number;
  y: number;
};

export function ArchitectureSection({ systemMap, health }: ArchitectureSectionProps) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { positions, byId, width, height } = useMemo(
    () => layoutGraph(systemMap.nodes),
    [systemMap.nodes]
  );

  const healthByProbe = useMemo(() => {
    const map = new Map<string, HealthProbe>();
    for (const probe of health?.probes ?? []) map.set(probe.id, probe);
    return map;
  }, [health]);

  const probeForNode = (node: SystemMapNode): HealthProbe | undefined =>
    node.healthProbeId ? healthByProbe.get(node.healthProbeId) : undefined;

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Living Architectural Reference</p>
        <h2>System Architecture</h2>
        <p className="admin-lede">
          How AVL Music Companion is wired — sources, processing, data, experience, and the flows
          between them. Start high-level, click any node to expand its details, source of truth, and
          connections. This map and the{" "}
          <a className="admin-resource-link inline" href="/api/admin/system-map" target="_blank" rel="noreferrer">
            JSON export
          </a>{" "}
          come from one registry.
        </p>
      </div>

      <div className="admin-arch-toolbar">
        <div className="admin-view-toggle" role="tablist" aria-label="Architecture view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "graph"}
            className={`admin-view-toggle-btn${view === "graph" ? " active" : ""}`}
            onClick={() => setView("graph")}
          >
            Graph
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={`admin-view-toggle-btn${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
        <div className="admin-arch-legend">
          {SYSTEM_LAYERS.map((layer) => (
            <span className="admin-arch-legend-item" key={layer.id}>
              <span className="admin-arch-legend-dot" style={{ background: LAYER_COLOR[layer.id] }} />
              {layer.label}
            </span>
          ))}
        </div>
      </div>

      {view === "graph" ? (
        <GraphView
          positions={positions}
          edges={systemMap.edges}
          width={width}
          height={height}
          selectedId={selectedId}
          probeForNode={probeForNode}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
        />
      ) : (
        <ListView
          nodes={systemMap.nodes}
          edges={systemMap.edges}
          byId={byId}
          selectedId={selectedId}
          probeForNode={probeForNode}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
        />
      )}

      {selected && (
        <NodeDetail
          node={selected}
          edges={systemMap.edges}
          byId={byId}
          probe={probeForNode(selected)}
          onNavigate={(id) => setSelectedId(id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      <p className="admin-meta admin-arch-footnote">
        {systemMap.nodes.length} nodes · {systemMap.edges.length} flows · derived from{" "}
        <code>lib/system-registry.ts</code> · generated {formatTimestamp(systemMap.generatedAt)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Graph view (SVG)                                                   */
/* ------------------------------------------------------------------ */

function GraphView({
  positions,
  edges,
  width,
  height,
  selectedId,
  probeForNode,
  onSelect,
}: {
  positions: Positioned[];
  edges: RegistryEdge[];
  width: number;
  height: number;
  selectedId: string | null;
  probeForNode: (node: SystemMapNode) => HealthProbe | undefined;
  onSelect: (id: string) => void;
}) {
  const posById = useMemo(() => {
    const map = new Map<string, Positioned>();
    for (const p of positions) map.set(p.node.id, p);
    return map;
  }, [positions]);

  return (
    <div className="admin-arch-graph-scroll">
      <svg
        className="admin-arch-graph"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="System architecture graph. Switch to List view for an accessible breakdown."
      >
        <defs>
          <marker id="arrow-faint" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.45)" />
          </marker>
          <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f8fafc" />
          </marker>
        </defs>

        {/* Edges first so nodes paint on top. */}
        <g>
          {edges.map((edge, index) => {
            const from = posById.get(edge.from);
            const to = posById.get(edge.to);
            if (!from || !to) return null;
            const active = selectedId === edge.from || selectedId === edge.to;
            const dimmed = selectedId !== null && !active;
            return (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                d={edgePath(from, to)}
                className={`admin-arch-edge${active ? " active" : ""}${dimmed ? " dimmed" : ""}`}
                markerEnd={active ? "url(#arrow-active)" : "url(#arrow-faint)"}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {positions.map(({ node, x, y }) => {
            const color = LAYER_COLOR[node.layer];
            const isSelected = selectedId === node.id;
            const isNeighbor =
              selectedId !== null &&
              !isSelected &&
              edges.some(
                (edge) =>
                  (edge.from === selectedId && edge.to === node.id) ||
                  (edge.to === selectedId && edge.from === node.id)
              );
            const dimmed = selectedId !== null && !isSelected && !isNeighbor;
            const probe = probeForNode(node);
            return (
              <g
                key={node.id}
                className={`admin-arch-node${isSelected ? " selected" : ""}${isNeighbor ? " neighbor" : ""}${dimmed ? " dimmed" : ""}`}
                transform={`translate(${x}, ${y})`}
                onClick={() => onSelect(node.id)}
                style={{ cursor: "pointer" }}
              >
                <rect width={NODE_W} height={NODE_H} rx={10} className="admin-arch-node-rect" stroke={color} />
                <rect width={5} height={NODE_H} rx={2} fill={color} />
                <text x={16} y={23} className="admin-arch-node-label">
                  {KIND_GLYPH[node.kind]} {truncate(node.label, 17)}
                </text>
                <text x={16} y={42} className="admin-arch-node-sub">
                  {NODE_KIND_LABELS[node.kind]}
                  {typeof node.count === "number" ? ` · ${formatCount(node.count)}` : ""}
                </text>
                {probe && (
                  <circle
                    cx={NODE_W - 13}
                    cy={13}
                    r={5}
                    fill={SEVERITY_DOT[probe.severity]}
                    stroke="rgba(10,10,12,0.7)"
                    strokeWidth={1.5}
                  >
                    <title>{`${probe.label}: ${probe.detail}`}</title>
                  </circle>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List view (non-graph fallback)                                     */
/* ------------------------------------------------------------------ */

function ListView({
  nodes,
  byId,
  selectedId,
  probeForNode,
  onSelect,
}: {
  nodes: SystemMapNode[];
  edges: RegistryEdge[];
  byId: Map<string, SystemMapNode>;
  selectedId: string | null;
  probeForNode: (node: SystemMapNode) => HealthProbe | undefined;
  onSelect: (id: string) => void;
}) {
  void byId;
  const layers = SYSTEM_LAYERS.map((layer) => ({
    ...layer,
    nodes: nodes.filter((node) => node.layer === layer.id),
  })).filter((group) => group.nodes.length > 0);

  return (
    <div className="admin-arch-list">
      {layers.map((layer) => (
        <div className="admin-arch-list-layer" key={layer.id}>
          <div className="admin-arch-list-layer-header">
            <span className="admin-arch-legend-dot" style={{ background: LAYER_COLOR[layer.id] }} />
            <strong>{layer.label}</strong>
            <small>{layer.blurb}</small>
          </div>
          <div className="admin-arch-list-nodes">
            {layer.nodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`admin-arch-list-node${selectedId === node.id ? " active" : ""}`}
                onClick={() => onSelect(node.id)}
                aria-expanded={selectedId === node.id}
              >
                <span className="admin-arch-list-node-glyph">{KIND_GLYPH[node.kind]}</span>
                <span className="admin-arch-list-node-body">
                  <strong>{node.label}</strong>
                  <small>{node.description}</small>
                </span>
                {(() => {
                  const probe = probeForNode(node);
                  return probe ? (
                    <span
                      className="admin-health-dot"
                      style={{ background: SEVERITY_DOT[probe.severity] }}
                      title={`${probe.label}: ${probe.detail}`}
                    />
                  ) : null;
                })()}
                {typeof node.count === "number" && (
                  <span className="admin-arch-list-node-count">{formatCount(node.count)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node detail (shared by both views)                                 */
/* ------------------------------------------------------------------ */

export function NodeDetail({
  node,
  edges,
  byId,
  probe,
  onNavigate,
  onClose,
}: {
  node: SystemMapNode;
  edges: RegistryEdge[];
  byId: Map<string, SystemMapNode>;
  probe?: HealthProbe;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const outbound = edges.filter((edge) => edge.from === node.id);
  const inbound = edges.filter((edge) => edge.to === node.id);
  const sourceIsTable = node.kind === "datastore";

  return (
    <div className="admin-node-detail">
      <div className="admin-node-detail-header">
        <div>
          <span className="admin-badge layer" style={{ borderColor: LAYER_COLOR[node.layer] }}>
            {KIND_GLYPH[node.kind]} {NODE_KIND_LABELS[node.kind]}
          </span>
          <h3>{node.label}</h3>
        </div>
        <button type="button" className="admin-node-detail-close" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>

      <p className="admin-node-detail-desc">{node.description}</p>

      {probe && (
        <div className={`admin-node-health ${probe.severity}`}>
          <span className="admin-health-dot" style={{ background: SEVERITY_DOT[probe.severity] }} />
          <span>
            <strong>Live health:</strong> {probe.detail}
            {probe.remediation ? <em> — {probe.remediation}</em> : null}
          </span>
        </div>
      )}

      <div className="admin-node-detail-meta">
        <div className="admin-node-detail-field">
          <span>Source of truth</span>
          <code>{node.sourceOfTruth}{sourceIsTable ? " (table)" : ""}</code>
        </div>
        <div className="admin-node-detail-field">
          <span>Access</span>
          <strong className={`admin-access-${node.access}`}>{node.access}</strong>
        </div>
        <div className="admin-node-detail-field">
          <span>Ownership</span>
          <strong>{ownershipLabel(node.ownership)}</strong>
        </div>
        {typeof node.count === "number" && (
          <div className="admin-node-detail-field">
            <span>Live count</span>
            <strong>{node.count.toLocaleString()}</strong>
          </div>
        )}
        {node.envVars && node.envVars.length > 0 && (
          <div className="admin-node-detail-field wide">
            <span>Required config (names only)</span>
            <span className="admin-env-name-list">
              {node.envVars.map((name) => (
                <code key={name}>{name}</code>
              ))}
            </span>
          </div>
        )}
        {node.healthProbeId && (
          <div className="admin-node-detail-field">
            <span>Health probe</span>
            <code>{node.healthProbeId}</code>
          </div>
        )}
        {node.docHref && (
          <div className="admin-node-detail-field">
            <span>Reference</span>
            <a className="admin-resource-link" href={node.docHref} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          </div>
        )}
      </div>

      <div className="admin-node-detail-edges">
        <div>
          <h4>Flows to / depends on</h4>
          {outbound.length === 0 ? (
            <p className="admin-meta">No outbound connections.</p>
          ) : (
            <ul>
              {outbound.map((edge, index) => (
                <li key={`${edge.to}-${index}`}>
                  <button type="button" className="admin-edge-link" onClick={() => onNavigate(edge.to)}>
                    → {byId.get(edge.to)?.label ?? edge.to}
                  </button>
                  {edge.label ? <small> — {edge.label}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4>Fed by / required by</h4>
          {inbound.length === 0 ? (
            <p className="admin-meta">No inbound connections.</p>
          ) : (
            <ul>
              {inbound.map((edge, index) => (
                <li key={`${edge.from}-${index}`}>
                  <button type="button" className="admin-edge-link" onClick={() => onNavigate(edge.from)}>
                    ← {byId.get(edge.from)?.label ?? edge.from}
                  </button>
                  {edge.label ? <small> — {edge.label}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout + geometry helpers                                          */
/* ------------------------------------------------------------------ */

function layoutGraph(nodes: SystemMapNode[]): {
  positions: Positioned[];
  byId: Map<string, SystemMapNode>;
  width: number;
  height: number;
} {
  const byId = new Map<string, SystemMapNode>();
  for (const node of nodes) byId.set(node.id, node);

  const orderedLayers = SYSTEM_LAYERS.map((layer) => layer.id).filter((layerId) =>
    nodes.some((node) => node.layer === layerId)
  );

  const positions: Positioned[] = [];
  let maxRows = 0;

  orderedLayers.forEach((layerId, col) => {
    const layerNodes = nodes.filter((node) => node.layer === layerId);
    maxRows = Math.max(maxRows, layerNodes.length);
    layerNodes.forEach((node, row) => {
      positions.push({
        node,
        x: PAD + col * COL_GAP,
        y: PAD + row * (NODE_H + ROW_GAP),
      });
    });
  });

  const width = PAD * 2 + (orderedLayers.length - 1) * COL_GAP + NODE_W;
  const height = PAD * 2 + Math.max(0, maxRows - 1) * (NODE_H + ROW_GAP) + NODE_H;

  return { positions, byId, width, height };
}

function edgePath(from: Positioned, to: Positioned): string {
  const sameColumn = Math.abs(from.x - to.x) < 1;
  const forward = to.x >= from.x;

  // Exit/enter on the sides facing the target; same-column edges bow out to the right.
  const sx = sameColumn ? from.x + NODE_W : forward ? from.x + NODE_W : from.x;
  const tx = sameColumn ? to.x + NODE_W : forward ? to.x : to.x + NODE_W;
  const sy = from.y + NODE_H / 2;
  const ty = to.y + NODE_H / 2;

  if (sameColumn) {
    const bow = 56;
    return `M ${sx} ${sy} C ${sx + bow} ${sy}, ${tx + bow} ${ty}, ${tx} ${ty}`;
  }

  const dx = Math.max(48, Math.abs(tx - sx) / 2);
  const c1x = forward ? sx + dx : sx - dx;
  const c2x = forward ? tx - dx : tx + dx;
  return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatCount(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return String(value);
}

function ownershipLabel(ownership: SystemMapNode["ownership"]): string {
  if (ownership === "automated") return "🤖 Automated";
  if (ownership === "manual") return "👤 Manual";
  return "🤝 Hybrid";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
