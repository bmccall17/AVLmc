"use client";

import { useMemo, useState } from "react";
import type { AdminDashboardData } from "@/lib/admin-data";
import type { SystemMap, SystemMapNode } from "@/lib/admin/registry";
import { NODE_KIND_LABELS, type NodeKind } from "@/lib/system-registry";
import { NodeDetail } from "@/components/admin/ArchitectureSection";

/**
 * Knowledge Graph (PRD 06 / C1).
 *
 * Re-pointed at the SAME System Registry that drives the architecture view, so entities and their
 * relationships come from one source of truth instead of a parallel hand-maintained list. Entities
 * are the registry's data stores, external sources, and partners (the things that actually hold
 * data), each with its live count and full connection detail via the shared NodeDetail panel.
 *
 * Venues / artists / tags are not registry nodes — they are facets *within* the events catalog —
 * so they are shown as clearly-labelled derived breakdowns rather than re-modelled entities.
 */

const KIND_GLYPH: Record<NodeKind, string> = {
  surface: "▦",
  service: "⚙",
  datastore: "▤",
  integration: "⇄",
  job: "⏱",
  external_source: "☁",
  partner: "★",
};

type KnowledgeGraphSectionProps = {
  systemMap: SystemMap;
  data: AdminDashboardData;
};

export function KnowledgeGraphSection({ systemMap, data }: KnowledgeGraphSectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, SystemMapNode>();
    for (const node of systemMap.nodes) map.set(node.id, node);
    return map;
  }, [systemMap.nodes]);

  const sources = systemMap.nodes.filter((node) => node.kind === "external_source");
  const stores = systemMap.nodes.filter((node) => node.kind === "datastore");
  const partners = systemMap.nodes.filter((node) => node.kind === "partner");

  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <p className="admin-eyebrow">Living Map</p>
        <h2>Knowledge Graph</h2>
        <p className="admin-lede">
          The entities that make up AVL Music Companion and how they connect — sourced from the same
          registry as the architecture view. Click any entity to trace its source of truth and
          relationships.
        </p>
      </div>

      <EntityGroup
        title="Sources"
        nodes={sources}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <EntityGroup
        title="Data Stores"
        nodes={stores}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <EntityGroup
        title="Partners"
        nodes={partners}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {selected && (
        <NodeDetail
          node={selected}
          edges={systemMap.edges}
          byId={byId}
          onNavigate={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      <div className="admin-subsection">
        <h3>Within the Events Catalog</h3>
        <p className="admin-meta">
          Facets derived from the <code>events</code> store — not separate entities, but the
          dimensions the board and discovery scoring index on.
        </p>
        <div className="admin-kg-facets">
          <FacetCard label="Venues" value={data.venues.length} detail={`${data.venues.filter((v) => v.hasUpcoming).length} with upcoming`} />
          <FacetCard label="Artists" value={data.metadataStats.totalArtists} detail="distinct in window" />
          <FacetCard label="Tags & Genres" value={data.metadataStats.totalTags} detail="distinct classifications" />
        </div>
      </div>
    </div>
  );
}

function EntityGroup({
  title,
  nodes,
  selectedId,
  onSelect,
}: {
  title: string;
  nodes: SystemMapNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="admin-subsection">
      <h3>{title}</h3>
      <div className="admin-kg-grid">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={`admin-kg-node${selectedId === node.id ? " expanded" : ""}`}
            onClick={() => onSelect(selectedId === node.id ? null : node.id)}
            aria-expanded={selectedId === node.id}
          >
            <span className="admin-kg-icon">{KIND_GLYPH[node.kind]}</span>
            <div className="admin-kg-info">
              <strong>
                {node.label}{" "}
                {typeof node.count === "number" ? <em>{node.count.toLocaleString()}</em> : null}
              </strong>
              <small>{NODE_KIND_LABELS[node.kind]} · {node.description}</small>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function FacetCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="admin-stat-card">
      <span className="admin-stat-value">{value.toLocaleString()}</span>
      <span className="admin-stat-label">{label}</span>
      <small className="admin-stat-detail">{detail}</small>
    </div>
  );
}
