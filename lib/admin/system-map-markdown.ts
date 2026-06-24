import {
  getNodesByLayer,
  IMPLEMENTATION_NOTE_KIND_LABELS,
  NODE_KIND_LABELS,
  type RegistryEdge,
  type RegistryNode,
  type SystemRegistry,
} from "@/lib/system-registry";

/**
 * Pure Markdown renderer for the System Registry (PRD 06 / C1, Outcome 3).
 *
 * Produces the agent- and human-readable architecture document checked into
 * `docs/product/system-map.generated.md`. Intentionally pure (no DB, no `server-only`) so the
 * generation script can run it without the app. It renders the STATIC structure only — live
 * counts are an in-portal/API enrichment and are deliberately omitted here so the checked-in
 * file is deterministic and reviewable in version control.
 */

const GENERATED_BANNER =
  "<!-- GENERATED FILE — do not edit by hand. Source of truth: lib/system-registry.ts. Regenerate with `npm run generate:system-map`. -->";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function nodeLabelLookup(nodes: RegistryNode[]): Map<string, string> {
  return new Map(nodes.map((node) => [node.id, node.label]));
}

function renderNode(node: RegistryNode, edges: RegistryEdge[], labels: Map<string, string>): string {
  const lines: string[] = [];
  lines.push(`#### ${node.label}  \`${node.id}\``);
  lines.push("");
  lines.push(node.description);
  lines.push("");

  const meta: Array<[string, string]> = [
    ["Kind", NODE_KIND_LABELS[node.kind]],
    ["Source of truth", `\`${node.sourceOfTruth}\``],
    ["Access", node.access],
    ["Ownership", node.ownership],
  ];
  if (node.envVars?.length) {
    meta.push(["Env vars (names only)", node.envVars.map((name) => `\`${name}\``).join(", ")]);
  }
  if (node.healthProbeId) {
    meta.push(["Health probe", `\`${node.healthProbeId}\` (PRD 07)`]);
  }
  if (node.countKey) {
    meta.push(["Live count", `\`${node.countKey}\` (resolved in portal/API)`]);
  }
  if (node.docHref) {
    meta.push(["Reference", node.docHref]);
  }
  for (const [key, value] of meta) {
    lines.push(`- **${key}:** ${value}`);
  }

  if (node.implementationNotes?.length) {
    lines.push("- **Implementation notes:**");
    for (const note of node.implementationNotes) {
      lines.push(`  - _${IMPLEMENTATION_NOTE_KIND_LABELS[note.kind]}:_ ${note.detail}`);
    }
  }

  const outbound = edges.filter((edge) => edge.from === node.id);
  const inbound = edges.filter((edge) => edge.to === node.id);
  if (outbound.length) {
    lines.push("- **Flows to / depends on:**");
    for (const edge of outbound) {
      const target = labels.get(edge.to) ?? edge.to;
      const label = edge.label ? ` — ${edge.label}` : "";
      lines.push(`  - → ${target} (${edge.kind})${label}`);
    }
  }
  if (inbound.length) {
    lines.push("- **Fed by / required by:**");
    for (const edge of inbound) {
      const source = labels.get(edge.from) ?? edge.from;
      const label = edge.label ? ` — ${edge.label}` : "";
      lines.push(`  - ← ${source} (${edge.kind})${label}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderSystemMapMarkdown(registry: SystemRegistry): string {
  const { nodes, edges } = registry;
  const labels = nodeLabelLookup(nodes);
  const layers = getNodesByLayer(nodes);

  const out: string[] = [];
  out.push(GENERATED_BANNER);
  out.push("");
  out.push("# AVL Music Companion — System Map");
  out.push("");
  out.push(
    "Authoritative, generated architecture reference. It is rendered from the typed System Registry " +
      "(`lib/system-registry.ts`) that also powers the `/admin` visual graph and the " +
      "`GET /api/admin/system-map` JSON export, so this document, the portal, and the API cannot drift apart."
  );
  out.push("");
  out.push(
    "A new developer or AI agent can read this file alone to understand how data flows from AVLgo " +
      "into a ranked homepage card, and where each piece's source of truth lives. Live row counts are " +
      "omitted here (they are shown live in the portal); everything else is the real wiring."
  );
  out.push("");

  // Quick orientation: the canonical data flow.
  out.push("## The Spine: AVLgo → Homepage");
  out.push("");
  out.push("```");
  out.push("AVLgo Export ─▶ Event Ingestion ─▶ Deduplication ─▶ events table");
  out.push("                                                       │");
  out.push("                                  Discovery Scoring ◀──┘");
  out.push("                                         │");
  out.push("                                  Event Board ─▶ Homepage");
  out.push("```");
  out.push("");

  // Layer-by-layer node catalog.
  out.push("## Nodes by Layer");
  out.push("");
  for (const layer of layers) {
    out.push(`### ${layer.label}`);
    out.push("");
    out.push(`_${layer.blurb}._`);
    out.push("");
    for (const node of layer.nodes) {
      out.push(renderNode(node, edges, labels));
    }
  }

  // Full edge list for machine consumption / quick scan.
  out.push("## Data Flows & Dependencies");
  out.push("");
  out.push("| From | → | To | Kind | What moves |");
  out.push("| --- | --- | --- | --- | --- |");
  for (const edge of edges) {
    const from = labels.get(edge.from) ?? edge.from;
    const to = labels.get(edge.to) ?? edge.to;
    out.push(
      `| ${escapeCell(from)} | → | ${escapeCell(to)} | ${edge.kind} | ${escapeCell(edge.label ?? "")} |`
    );
  }
  out.push("");

  out.push("---");
  out.push("");
  out.push(
    `_${nodes.length} nodes, ${edges.length} edges. Regenerate with \`npm run generate:system-map\` after editing \`lib/system-registry.ts\`._`
  );
  out.push("");

  return out.join("\n");
}
