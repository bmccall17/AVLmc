import "server-only";
import { query } from "@/lib/db";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import { getUpcomingEvents, type EventRecord } from "@/lib/events";
import {
  scoreDiscoveryEvents,
  type DiscoveryScore,
  type DiscoveryScoreComponents,
} from "@/lib/discovery";
import type { MusicConnection, MusicProfileItem } from "@/lib/music";

/**
 * Recommendation Quality & Listener Insight (PRD 09 / C4, Outcome 5).
 *
 * Makes the ranking engine legible from the admin: WHY an event is prioritized (the live
 * `components`/`reasons` from `scoreDiscoveryEvents`), HOW anonymous vs. signed-in ranking differ,
 * and aggregate quality metrics (diversity, local value, signal mix, coverage). The scoring
 * algorithm is unchanged — this only observes and explains its output.
 *
 * Privacy: the signed-in comparison uses a SYNTHETIC taste profile derived from the window's own
 * public event artists — never a real listener's private data. No OAuth tokens or private profile
 * values are read or returned.
 */

const TOP_N = 10;
const SYNTH_ARTISTS = 5;
const CACHE_TTL_MS = 30_000;

export type RankedComponent = {
  label: string;
  weight: number;
  base: number;
  adjustment: number;
  total: number;
};

export type RankedEvent = {
  eventId: string;
  title: string;
  venueName: string;
  artistName: string;
  eventDate: string;
  rank: number;
  score: number;
  reasons: string[];
  spotifyMatched: boolean;
  components: RankedComponent[];
  communitySignal: number;
};

export type Mover = {
  eventId: string;
  title: string;
  anonRank: number;
  signedRank: number;
  delta: number;
  reason: string;
};

export type InsightMetrics = {
  topN: number;
  venueSpread: number;
  tagSpread: number;
  artistSpread: number;
  lowDiversity: boolean;
  localValueShare: number;
  signalMix: Array<{ label: string; count: number }>;
  coverage: { withSignal: number; timingOnly: number; total: number };
};

export type BehaviorInsight = {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  removals: number;
  negativeLearningActive: boolean;
};

export type RecommendationInsight = {
  generatedAt: string;
  anonymous: RankedEvent[];
  signedIn: RankedEvent[];
  movers: Mover[];
  metrics: InsightMetrics;
  behavior: BehaviorInsight;
  syntheticProfile: { artists: string[]; note: string };
};

let cache: { at: number; value: RecommendationInsight } | null = null;

export async function loadRecommendationInsight(force = false): Promise<RecommendationInsight> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const events = await safeUpcomingEvents();
  const counts = await safeCounts(events.map((event) => event.id));

  const anonymousScores = scoreDiscoveryEvents({ events, counts });

  const synthArtists = topArtists(events, SYNTH_ARTISTS);
  const { connections, profileItems } = buildSyntheticProfile(synthArtists);
  const signedScores = scoreDiscoveryEvents({ events, counts, connections, profileItems });

  const anonymous = rankEvents(events, anonymousScores, counts);
  const signedIn = rankEvents(events, signedScores, counts);

  const value: RecommendationInsight = {
    generatedAt: new Date().toISOString(),
    anonymous,
    signedIn,
    movers: computeMovers(anonymous, signedIn),
    metrics: computeMetrics(events, signedIn, anonymousScores, signedScores),
    behavior: await loadBehavior(),
    syntheticProfile: {
      artists: synthArtists,
      note: "Derived from the most frequent artists in the current public listings — not a real listener's data.",
    },
  };

  cache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------------------------ */
/*  Ranking + explanation                                              */
/* ------------------------------------------------------------------ */

function rankEvents(
  events: EventRecord[],
  scores: Record<string, DiscoveryScore>,
  counts: Record<string, CommunityCounts | undefined>
): RankedEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));

  return Object.values(scores)
    .map((score) => {
      const event = byId.get(score.eventId);
      return { score, event };
    })
    .filter((entry): entry is { score: DiscoveryScore; event: EventRecord } => Boolean(entry.event))
    .sort((a, b) => b.score.bestBetsScore - a.score.bestBetsScore)
    .map(({ score, event }, index) => ({
      eventId: event.id,
      title: event.eventTitle,
      venueName: event.venueName,
      artistName: event.artistName,
      eventDate: typeof event.eventDate === "string" ? event.eventDate : String(event.eventDate),
      rank: index + 1,
      score: Math.round(score.bestBetsScore * 10) / 10,
      reasons: score.reasons.map((reason) => reason.label),
      spotifyMatched: score.spotifyMatched,
      components: explainComponents(score.components),
      communitySignal: communityTotal(counts[event.id]),
    }));
}

/** Flatten the component record into a ranked, readable list (largest absolute impact first). */
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

function computeMovers(anonymous: RankedEvent[], signedIn: RankedEvent[]): Mover[] {
  const anonRank = new Map(anonymous.map((event) => [event.eventId, event.rank]));
  return signedIn
    .map((event) => {
      const previous = anonRank.get(event.eventId) ?? signedIn.length;
      const delta = previous - event.rank; // positive = moved up
      const reason =
        event.reasons.find((label) => /spotify|match|taste/i.test(label)) ??
        event.reasons[0] ??
        "personal signals";
      return {
        eventId: event.eventId,
        title: event.title,
        anonRank: previous,
        signedRank: event.rank,
        delta,
        reason,
      };
    })
    .filter((mover) => mover.delta !== 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6);
}

function computeMetrics(
  events: EventRecord[],
  signedIn: RankedEvent[],
  anonymousScores: Record<string, DiscoveryScore>,
  signedScores: Record<string, DiscoveryScore>
): InsightMetrics {
  const top = signedIn.slice(0, TOP_N);
  const venues = new Set(top.map((event) => event.venueName));
  const artists = new Set(top.map((event) => event.artistName).filter(Boolean));
  const tags = new Set<string>();
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const ranked of top) {
    const event = byId.get(ranked.eventId);
    for (const tag of event?.tags ?? []) tags.add(tag);
  }

  const localValueCount = top.filter((event) => event.communitySignal > 0).length;

  // Signal mix: the dominant (largest-impact) component label per top event.
  const mix = new Map<string, number>();
  for (const event of top) {
    const dominant = event.spotifyMatched ? "Spotify match" : event.components[0]?.label ?? "Timing";
    mix.set(dominant, (mix.get(dominant) ?? 0) + 1);
  }

  // Coverage: an event "received a personalization signal" when the signed-in score differs from
  // the anonymous score — i.e. taste/personal inputs changed its ranking score.
  let withSignal = 0;
  for (const event of events) {
    const anon = anonymousScores[event.id]?.bestBetsScore ?? 0;
    const signed = signedScores[event.id]?.bestBetsScore ?? 0;
    if (Math.abs(signed - anon) > 0.01) withSignal += 1;
  }

  return {
    topN: top.length,
    venueSpread: venues.size,
    tagSpread: tags.size,
    artistSpread: artists.size,
    lowDiversity: top.length > 0 && venues.size <= Math.ceil(top.length / 3),
    localValueShare: top.length > 0 ? Math.round((localValueCount / top.length) * 100) : 0,
    signalMix: Array.from(mix.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    coverage: { withSignal, timingOnly: events.length - withSignal, total: events.length },
  };
}

/* ------------------------------------------------------------------ */
/*  Synthetic profile (privacy-safe)                                   */
/* ------------------------------------------------------------------ */

function topArtists(events: EventRecord[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const name = event.artistName?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function buildSyntheticProfile(artists: string[]): {
  connections: MusicConnection[];
  profileItems: MusicProfileItem[];
} {
  const now = new Date().toISOString();
  const connections: MusicConnection[] = [
    {
      provider: "spotify",
      scopes: [],
      connectedAt: now,
      lastSyncedAt: now,
      tasteOptOutAt: null,
      disconnectedAt: null,
    },
  ];
  const profileItems: MusicProfileItem[] = artists.map((name, index) => ({
    id: `synthetic-${index}`,
    provider: "spotify",
    itemType: "top_artist",
    providerItemId: `synthetic-${index}`,
    name,
    artistNames: [name],
    genres: [],
    externalUrl: null,
    imageUrl: null,
    rank: index + 1,
    timeRange: "medium_term",
    syncedAt: now,
  }));
  return { connections, profileItems };
}

/* ------------------------------------------------------------------ */
/*  Behavioral signals                                                 */
/* ------------------------------------------------------------------ */

async function loadBehavior(): Promise<BehaviorInsight> {
  try {
    const result = await query<{ action: string; count: number }>(
      `
        select action, count(*)::int as count
        from public.event_interaction_events
        group by action
        order by count desc
      `
    );
    const byAction = result.rows.map((row) => ({ action: row.action, count: Number(row.count) }));
    const total = byAction.reduce((sum, row) => sum + row.count, 0);
    const removals = byAction.find((row) => row.action === "remove")?.count ?? 0;
    return { total, byAction, removals, negativeLearningActive: removals > 0 };
  } catch {
    return { total: 0, byAction: [], removals: 0, negativeLearningActive: false };
  }
}

/* ------------------------------------------------------------------ */
/*  Safe loaders + helpers                                             */
/* ------------------------------------------------------------------ */

async function safeUpcomingEvents(): Promise<EventRecord[]> {
  try {
    return await getUpcomingEvents();
  } catch {
    return [];
  }
}

async function safeCounts(ids: string[]): Promise<Record<string, CommunityCounts | undefined>> {
  if (ids.length === 0) return {};
  try {
    return await getCommunityCountsByEvent(ids);
  } catch {
    return {};
  }
}

function communityTotal(counts: CommunityCounts | undefined): number {
  if (!counts) return 0;
  return counts.songs + counts.notes + counts.voices + counts.going + counts.fire;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
