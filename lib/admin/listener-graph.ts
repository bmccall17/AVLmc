import "server-only";
import { query } from "@/lib/db";
import { getUpcomingEvents, type EventRecord } from "@/lib/events";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import { listMusicConnections, listMusicProfileItems } from "@/lib/music";
import { getListenerDiscoveryPreferences } from "@/lib/listener-preferences-store";
import { getSavedKeys } from "@/lib/saved-items";
import {
  listDiscoveryPreferenceSignals,
  listDiscoveryStates,
  listSpotifyMatchCorrections,
  type DiscoveryPersonEventState,
} from "@/lib/discovery-memory";
import {
  LISTENER_PREFERENCE_CONTROLS,
  type ListenerDiscoveryPreferences,
} from "@/lib/listener-preferences";
import {
  scoreDiscoveryEvents,
  type DiscoveryScore,
  type DiscoveryScoreComponents,
} from "@/lib/discovery";
import type { RankedComponent } from "@/lib/admin/insight";

/**
 * Listener Taste Knowledge Graph (PRD 10 / C5, Outcome 2).
 *
 * Assembles a privacy-first, per-listener trace: identity → connected music data → expressed
 * preferences → behavioral signals → taste settings → surfaced events. It composes the existing
 * per-user loaders with the live scoring engine (PRD 09), and contrasts the listener's ranking
 * with the anonymous baseline so the personalization is explainable, not a black box.
 *
 * Privacy (the highest-sensitivity surface in the initiative): admin-only; the minimum identifying
 * surface (internal id / identity_key, never email); top-artist NAMES are shown for the trace but
 * no OAuth tokens, refresh tokens, external ids, or session secrets are ever read or returned.
 */

const CACHE_TTL_MS = 30_000;
const SURFACED_LIMIT = 12;

export type ListenerKind = "user" | "anonymous";

export type ListenerSummary = {
  identityKey: string;
  kind: ListenerKind;
  label: string;
  connected: boolean;
  profileItemCount: number;
  signalCount: number;
  optedOut: boolean;
};

export type ListenerTraceEvent = {
  eventId: string;
  title: string;
  venueName: string;
  eventDate: string;
  personalRank: number;
  personalScore: number;
  anonymousRank: number;
  anonymousScore: number;
  delta: number;
  reasons: string[];
  spotifyMatched: boolean;
  components: RankedComponent[];
};

export type ListenerTrace = {
  generatedAt: string;
  summary: ListenerSummary;
  connections: Array<{
    provider: string;
    connectedAt: string;
    lastSyncedAt: string | null;
    disconnectedAt: string | null;
    optedOut: boolean;
  }>;
  topArtists: string[];
  profileItemCount: number;
  preferences: {
    weights: Array<{ key: string; label: string; weight: number }>;
    customSignals: Array<{ label: string; kind: string; direction: string; weight: number }>;
  };
  signals: {
    total: number;
    byAction: Array<{ action: string; count: number }>;
    fired: number;
    planning: number;
    removed: number;
  };
  tasteContributes: boolean;
  surfacedEvents: ListenerTraceEvent[];
};

/* ------------------------------------------------------------------ */
/*  Listener directory                                                 */
/* ------------------------------------------------------------------ */

export async function listTraceableListeners(): Promise<ListenerSummary[]> {
  const [users, anon] = await Promise.all([listSignedInListeners(), listAnonymousListeners()]);
  return [...users, ...anon];
}

async function listSignedInListeners(): Promise<ListenerSummary[]> {
  try {
    const result = await query<{
      id: string;
      connected: boolean;
      profile_items: number;
      signals: number;
      opted_out: boolean;
    }>(
      `
        select
          u.id::text as id,
          exists(select 1 from public.music_connections mc where mc.user_id = u.id and mc.disconnected_at is null) as connected,
          coalesce((select count(*) from public.music_profile_items mpi where mpi.user_id = u.id), 0)::int as profile_items,
          coalesce((select count(*) from public.event_interaction_events e where e.user_id = u.id), 0)::int as signals,
          exists(select 1 from public.music_connections mc where mc.user_id = u.id and mc.taste_opt_out_at is not null) as opted_out
        from public.users u
        where exists(select 1 from public.music_connections mc where mc.user_id = u.id)
           or exists(select 1 from public.music_profile_items mpi where mpi.user_id = u.id)
           or exists(select 1 from public.listener_discovery_preferences p where p.user_id = u.id)
           or exists(select 1 from public.event_interaction_events e where e.user_id = u.id)
        order by profile_items desc, signals desc
        limit 50
      `
    );
    return result.rows.map((row) => ({
      identityKey: `user:${row.id}`,
      kind: "user" as const,
      label: `Listener #${row.id}`,
      connected: row.connected,
      profileItemCount: Number(row.profile_items),
      signalCount: Number(row.signals),
      optedOut: row.opted_out,
    }));
  } catch {
    return [];
  }
}

async function listAnonymousListeners(): Promise<ListenerSummary[]> {
  try {
    const result = await query<{ identity_key: string; signals: number }>(
      `
        select identity_key, count(*)::int as signals
        from public.event_interaction_events
        where identity_key like 'session:%' and user_id is null
        group by identity_key
        order by count(*) desc
        limit 15
      `
    );
    return result.rows.map((row) => ({
      identityKey: row.identity_key,
      kind: "anonymous" as const,
      label: `Anonymous · …${row.identity_key.slice(-6)}`,
      connected: false,
      profileItemCount: 0,
      signalCount: Number(row.signals),
      optedOut: false,
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Per-listener trace                                                 */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { at: number; value: ListenerTrace }>();

export async function loadListenerTrace(identityKey: string): Promise<ListenerTrace | null> {
  const cached = cache.get(identityKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const identity = parseIdentity(identityKey);
  if (!identity) return null;

  const events = await safeUpcomingEvents();
  const counts = await safeCounts(events.map((event) => event.id));
  const eventIds = events.map((event) => event.id);

  const [connections, profileItems, preferences, signals, corrections, states, savedKeys] = await Promise.all([
    identity.userId ? safe(() => listMusicConnections(identity.userId as string), []) : Promise.resolve([]),
    identity.userId ? safe(() => listMusicProfileItems(identity.userId as string), []) : Promise.resolve([]),
    identity.userId
      ? safe(() => getListenerDiscoveryPreferences(identity.userId as string), defaultPrefs())
      : Promise.resolve(defaultPrefs()),
    safe(() => listDiscoveryPreferenceSignals(identity), []),
    safe(() => listSpotifyMatchCorrections(eventIds, identity), []),
    safe(() => listDiscoveryStates(eventIds, identity), {}),
    identity.userId ? safe(() => getSavedKeys(identity.userId as string), []) : Promise.resolve([]),
  ]);

  // Saved venues/artists feed the venuePreference / artistAffinity bases (PRD 14 / C3), so the
  // trace attributes any favorite-driven boost to this listener's saves.
  const savedFavorites = savedKeys
    .filter((key) => key.itemType === "venue" || key.itemType === "artist")
    .map((key) => ({ itemType: key.itemType as "venue" | "artist", itemKey: key.itemKey }));

  const optedOut = connections.some((connection) => connection.tasteOptOutAt !== null);
  const connectedActive = connections.some((connection) => connection.disconnectedAt === null);
  const tasteContributes = connectedActive && !optedOut && profileItems.length > 0;

  const personalScores = scoreDiscoveryEvents({
    events,
    counts,
    connections,
    profileItems,
    listenerPreferences: preferences,
    preferenceSignals: signals,
    savedFavorites,
    spotifyMatchCorrections: corrections,
  });
  const anonymousScores = scoreDiscoveryEvents({ events, counts });

  const anonRank = rankMap(anonymousScores);
  const surfacedEvents = buildSurfaced(events, personalScores, anonymousScores, anonRank);

  const stateValues = Object.values(states).filter(
    (state): state is DiscoveryPersonEventState => Boolean(state)
  );

  const summary: ListenerSummary = {
    identityKey,
    kind: identity.userId ? "user" : "anonymous",
    label: identity.userId ? `Listener #${identity.userId}` : `Anonymous · …${identityKey.slice(-6)}`,
    connected: connectedActive,
    profileItemCount: profileItems.length,
    signalCount: signals.length,
    optedOut,
  };

  const value: ListenerTrace = {
    generatedAt: new Date().toISOString(),
    summary,
    connections: connections.map((connection) => ({
      provider: connection.provider,
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt,
      disconnectedAt: connection.disconnectedAt,
      optedOut: connection.tasteOptOutAt !== null,
    })),
    topArtists: profileItems
      .filter((item) => item.itemType === "top_artist")
      .slice(0, 8)
      .map((item) => item.name),
    profileItemCount: profileItems.length,
    preferences: {
      weights: LISTENER_PREFERENCE_CONTROLS.map((control) => ({
        key: control.key,
        label: control.label,
        weight: round(preferences.weights[control.key] ?? 0),
      })),
      customSignals: preferences.customSignals.map((signal) => ({
        label: signal.label,
        kind: signal.kind,
        direction: signal.direction,
        weight: round(signal.weight),
      })),
    },
    signals: {
      total: signals.length,
      byAction: countByAction(signals),
      fired: stateValues.filter((state) => state.fire).length,
      planning: stateValues.filter((state) => state.planning).length,
      removed: stateValues.filter((state) => state.removed).length,
    },
    tasteContributes,
    surfacedEvents,
  };

  cache.set(identityKey, { at: Date.now(), value });
  return value;
}

/* ------------------------------------------------------------------ */
/*  Scoring → trace helpers                                            */
/* ------------------------------------------------------------------ */

function buildSurfaced(
  events: EventRecord[],
  personalScores: Record<string, DiscoveryScore>,
  anonymousScores: Record<string, DiscoveryScore>,
  anonRank: Map<string, number>
): ListenerTraceEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));

  return Object.values(personalScores)
    .map((score) => ({ score, event: byId.get(score.eventId) }))
    .filter((entry): entry is { score: DiscoveryScore; event: EventRecord } => Boolean(entry.event))
    .sort((a, b) => b.score.bestBetsScore - a.score.bestBetsScore)
    .slice(0, SURFACED_LIMIT)
    .map(({ score, event }, index) => {
      const anonymousRank = anonRank.get(event.id) ?? Object.keys(personalScores).length;
      return {
        eventId: event.id,
        title: event.eventTitle,
        venueName: event.venueName,
        eventDate: typeof event.eventDate === "string" ? event.eventDate : String(event.eventDate),
        personalRank: index + 1,
        personalScore: round(score.bestBetsScore),
        anonymousRank,
        anonymousScore: round(anonymousScores[event.id]?.bestBetsScore ?? 0),
        delta: anonymousRank - (index + 1),
        reasons: score.reasons.map((reason) => reason.label),
        spotifyMatched: score.spotifyMatched,
        components: explainComponents(score.components),
      };
    });
}

function rankMap(scores: Record<string, DiscoveryScore>): Map<string, number> {
  const ranked = Object.values(scores).sort((a, b) => b.bestBetsScore - a.bestBetsScore);
  const map = new Map<string, number>();
  ranked.forEach((score, index) => map.set(score.eventId, index + 1));
  return map;
}

function explainComponents(components: DiscoveryScoreComponents): RankedComponent[] {
  return Object.values(components)
    .map((component) => ({
      label: component.label,
      weight: round(component.weight),
      base: round(component.base),
      adjustment: round(component.adjustment),
      total: round(component.total),
    }))
    .filter((component) => component.total !== 0 || component.weight !== 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function countByAction(signals: Array<{ action: string }>): Array<{ action: string; count: number }> {
  const map = new Map<string, number>();
  for (const signal of signals) map.set(signal.action, (map.get(signal.action) ?? 0) + 1);
  return Array.from(map.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseIdentity(identityKey: string): { userId?: string; sessionId?: string } | null {
  if (identityKey.startsWith("user:")) {
    const userId = identityKey.slice("user:".length);
    return userId ? { userId } : null;
  }
  if (identityKey.startsWith("session:")) {
    const sessionId = identityKey.slice("session:".length);
    return sessionId ? { sessionId } : null;
  }
  return null;
}

function defaultPrefs(): ListenerDiscoveryPreferences {
  return {
    customSignals: [],
    updatedAt: null,
    weights: Object.fromEntries(
      LISTENER_PREFERENCE_CONTROLS.map((control) => [control.key, 0])
    ) as ListenerDiscoveryPreferences["weights"],
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function safeUpcomingEvents(): Promise<EventRecord[]> {
  return safe(() => getUpcomingEvents(), []);
}

async function safeCounts(ids: string[]): Promise<Record<string, CommunityCounts | undefined>> {
  if (ids.length === 0) return {};
  return safe(() => getCommunityCountsByEvent(ids), {});
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
