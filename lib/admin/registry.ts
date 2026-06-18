import "server-only";
import { query } from "@/lib/db";
import {
  getSystemRegistry,
  type DerivedCountKey,
  type RegistryEdge,
  type RegistryNode,
} from "@/lib/system-registry";

/**
 * Admin registry loader (PRD 06 / C1).
 *
 * Bridges the pure, hand-authored `lib/system-registry.ts` model with live data: it attaches
 * current row counts to the relevant nodes at request time. This is the "partly derived" half
 * of the registry — the static structure plus stitched-in truth. Both the visual graph and the
 * `GET /api/admin/system-map` export consume THIS function, so they cannot disagree.
 *
 * Counts are resolved with cheap, independently-degrading queries: a missing or not-yet-created
 * table yields `undefined` for that node rather than failing the whole map.
 */

export type SystemMapNode = RegistryNode & { count?: number };

export type SystemMap = {
  generatedAt: string;
  nodes: SystemMapNode[];
  edges: RegistryEdge[];
  counts: Partial<Record<DerivedCountKey, number>>;
};

/**
 * Explicit literal count queries — one per derived count key. Kept as hardcoded strings (no
 * dynamic table interpolation) so there is no SQL-injection surface and each can fail in
 * isolation. The key matches the `countKey` declared on the corresponding registry node.
 */
const COUNT_QUERIES: Array<{ key: DerivedCountKey; text: string }> = [
  { key: "events", text: "select count(*)::int as count from public.events" },
  { key: "contributions", text: "select count(*)::int as count from public.contributions" },
  { key: "reactions", text: "select count(*)::int as count from public.reactions" },
  { key: "event_intents", text: "select count(*)::int as count from public.event_intents" },
  {
    key: "event_interaction_events",
    text: "select count(*)::int as count from public.event_interaction_events",
  },
  {
    key: "event_person_event_state",
    text: "select count(*)::int as count from public.event_person_event_state",
  },
  { key: "users", text: "select count(*)::int as count from public.users" },
  { key: "accounts", text: "select count(*)::int as count from public.accounts" },
  { key: "user_emails", text: "select count(*)::int as count from public.user_emails" },
  {
    key: "music_connections",
    text: "select count(*)::int as count from public.music_connections",
  },
  {
    key: "music_profile_items",
    text: "select count(*)::int as count from public.music_profile_items",
  },
  {
    key: "listener_discovery_preferences",
    text: "select count(*)::int as count from public.listener_discovery_preferences",
  },
  {
    key: "spotify_event_match_corrections",
    text: "select count(*)::int as count from public.spotify_event_match_corrections",
  },
  {
    key: "system_job_runs",
    text: "select count(*)::int as count from public.system_job_runs",
  },
  {
    key: "admin_resources",
    text: "select count(*)::int as count from public.admin_resources where status <> 'archived'",
  },
  { key: "saved_items", text: "select count(*)::int as count from public.saved_items" },
  {
    key: "event_shared_songs",
    text: "select count(*)::int as count from public.event_shared_songs where status = 'visible'",
  },
  {
    key: "listener_follows",
    text: "select count(*)::int as count from public.listener_follows where status = 'active'",
  },
  {
    key: "curators",
    text: "select count(*)::int as count from public.curators where status = 'active'",
  },
  {
    key: "curator_picks",
    text: "select count(*)::int as count from public.curator_picks where status = 'visible'",
  },
];

async function loadCounts(): Promise<Partial<Record<DerivedCountKey, number>>> {
  const results = await Promise.all(
    COUNT_QUERIES.map(async ({ key, text }) => {
      try {
        const result = await query<{ count: number | string }>(text);
        return [key, Number(result.rows[0]?.count ?? 0)] as const;
      } catch {
        // Table may not exist yet (optional feature off / fresh DB) — degrade gracefully.
        return [key, undefined] as const;
      }
    })
  );

  const counts: Partial<Record<DerivedCountKey, number>> = {};
  for (const [key, value] of results) {
    if (typeof value === "number") {
      counts[key] = value;
    }
  }
  return counts;
}

/**
 * The enriched system map: the static registry with live counts attached to the nodes that
 * declare a `countKey`. Server-side only; never exposes env values, tokens, or secrets.
 */
export async function loadSystemMap(): Promise<SystemMap> {
  const registry = getSystemRegistry();
  const counts = await loadCounts();

  const nodes: SystemMapNode[] = registry.nodes.map((node) => {
    if (node.countKey && typeof counts[node.countKey] === "number") {
      return { ...node, count: counts[node.countKey] };
    }
    return { ...node };
  });

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    edges: registry.edges,
    counts,
  };
}
