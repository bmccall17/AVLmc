import "server-only";
import { query } from "@/lib/db";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import { getUpcomingEvents, type EventRecord } from "@/lib/events";
import {
  enforceExplorationFloor,
  scoreDiscoveryEvents,
  SCORER_VERSION,
  type DiscoveryScore,
  type DiscoveryScoreComponents,
} from "@/lib/discovery";
import type { MusicConnection, MusicProfileItem } from "@/lib/music";
import {
  computeEngagement,
  computeFloorHolds,
  computeInfluenceConcentration,
  computeNonConversionShare,
  computeNoveltyShare,
  computeSocialLift,
  computeWindow,
  serializeBaselineMarkdown,
  type SocialBenchmark,
} from "./insight-metrics";

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
const CACHE_TTL_MS = 30_000;

/**
 * STABLE synthetic taste profile (PRD 22 / Phase 10 — Discovery Baseline).
 *
 * The anonymous-vs-signed-in comparison must move only when the *algorithm* changes — not because
 * the public listings drifted. So the synthetic profile is a FIXED, public-derived seed pinned in
 * code, NOT re-derived from the current window each read. Regenerate this list **intentionally**
 * (a known, recorded act) — e.g. from the most frequent listing artists at a milestone — and bump
 * the pinned date below; never let it drift silently.
 */
const SYNTHETIC_TASTE_SEED: string[] = [
  "Dinah's Daydream",
  "Old-time Jam",
  "Bluegrass Jam w/Drew Matulich",
  "Jazz Brunch with The Four Peanuts",
  "Nobody's Darling String Band",
];
const SYNTHETIC_TASTE_SEED_PINNED = "2026-06-17";

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
  /** Under-the-radar show — boosted by the exploration floor (PRD 21 / C4). */
  novel: boolean;
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
  /** % of the top-N that is under-the-radar (low heat + no profile/personal signal). */
  noveltyShare: number;
  signalMix: Array<{ label: string; count: number }>;
  coverage: { withSignal: number; timingOnly: number; total: number };
  /** Community heat across the window and how much concentrates in the top-N. */
  engagement: { totalHeat: number; topNHeatShare: number };
};

export type BehaviorInsight = {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  removals: number;
  negativeLearningActive: boolean;
  impressions: number;
  implicitLearningActive: boolean;
  /**
   * Aggregate proxy for the soft-negative volume Deeper Personalization consumes: the share of
   * impressions not matched by an engagement action (detail open / AVLgo click / fire / planning /
   * contribution). Window-wide ratio, not a per-impression join — descriptive only.
   */
  impressionNonConversionShare: number;
};

export type BaselineMethodology = {
  /** Pinned event window (min/max event date in the current reading). */
  windowStart: string;
  windowEnd: string;
  /** Manually-bumped scoring algorithm version (`SCORER_VERSION`). */
  scorerVersion: string;
  /** Deployed git commit (short) when available, else null. */
  commit: string | null;
  /** Honest descriptor of the fixed, public-derived synthetic profile seed. */
  syntheticProfileNote: string;
};

export type RecommendationInsight = {
  generatedAt: string;
  anonymous: RankedEvent[];
  signedIn: RankedEvent[];
  movers: Mover[];
  metrics: InsightMetrics;
  behavior: BehaviorInsight;
  syntheticProfile: { artists: string[]; note: string };
  /** Pinned, stated methodology making the reading reproducible (PRD 22). */
  methodology: BaselineMethodology;
  /** Social & Curator Benchmark (PRD 27 / C5): social-driven lift read separately from popularity. */
  social: SocialBenchmark;
  /** Paste-ready dated markdown snapshot of this reading (recording without storage). */
  markdown: string;
};

let cache: { at: number; value: RecommendationInsight } | null = null;

export async function loadRecommendationInsight(force = false): Promise<RecommendationInsight> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const events = await safeUpcomingEvents();
  const counts = await safeCounts(events.map((event) => event.id));

  const anonymousScores = scoreDiscoveryEvents({ events, counts });

  // Fixed, public-derived seed (PRD 22) — NOT re-derived from the window — so the signed-in
  // comparison moves only when the algorithm changes, not when listings drift.
  const synthArtists = SYNTHETIC_TASTE_SEED;
  const { connections, profileItems } = buildSyntheticProfile(synthArtists);
  const signedScores = scoreDiscoveryEvents({ events, counts, connections, profileItems });

  const anonymous = rankEvents(events, anonymousScores, counts);
  // Apply the guaranteed exploration floor (PRD 21 / C4) to the personalized ranking, so the
  // benchmark reads reflect that quiet/local discovery isn't crowded out as personalization sharpens.
  const signedIn = rankEvents(events, signedScores, counts, { enforceFloor: true });

  const social = computeSocialBenchmark(events, counts, connections, profileItems, anonymous);

  const window = computeWindow(events);
  const syntheticProfileNote = `Fixed public-derived seed (${synthArtists.length} artists), pinned ${SYNTHETIC_TASTE_SEED_PINNED} — regenerated intentionally, never a real listener's data.`;

  const value: RecommendationInsight = {
    generatedAt: new Date().toISOString(),
    anonymous,
    signedIn,
    movers: computeMovers(anonymous, signedIn),
    metrics: computeMetrics(events, signedIn, anonymousScores, signedScores),
    behavior: await loadBehavior(),
    social,
    syntheticProfile: { artists: synthArtists, note: syntheticProfileNote },
    methodology: {
      windowStart: window.start,
      windowEnd: window.end,
      scorerVersion: SCORER_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      syntheticProfileNote,
    },
    markdown: "",
  };
  value.markdown = serializeBaselineMarkdown(value);

  cache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------------------------ */
/*  Ranking + explanation                                              */
/* ------------------------------------------------------------------ */

function rankEvents(
  events: EventRecord[],
  scores: Record<string, DiscoveryScore>,
  counts: Record<string, CommunityCounts | undefined>,
  options: { enforceFloor?: boolean } = {}
): RankedEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));

  const sorted = Object.values(scores)
    .map((score) => {
      const event = byId.get(score.eventId);
      return { score, event };
    })
    .filter((entry): entry is { score: DiscoveryScore; event: EventRecord } => Boolean(entry.event))
    .sort((a, b) => b.score.bestBetsScore - a.score.bestBetsScore)
    // A novel/under-the-radar show is one the exploration floor boosted (PRD 21 / C4).
    .map((entry) => ({ ...entry, novel: entry.score.components.novelty.base > 0 }));

  const ranked = options.enforceFloor ? enforceExplorationFloor(sorted, TOP_N) : sorted;

  return ranked.map(({ score, event, novel }, index) => ({
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
      novel,
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
    noveltyShare: computeNoveltyShare(top),
    signalMix: Array.from(mix.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    coverage: { withSignal, timingOnly: events.length - withSignal, total: events.length },
    engagement: computeEngagement(signedIn, TOP_N),
  };
}

/* ------------------------------------------------------------------ */
/*  Social & Curator Benchmark (PRD 27 / C5)                           */
/* ------------------------------------------------------------------ */

/**
 * Read social-driven lift SEPARATELY from anonymous popularity, on the fixed PRD 22 methodology,
 * using a deterministic synthetic "circle" over the window (a friend cohort + one curator) with the
 * socialCircle dial maxed. Reports the "your people" lift vs. socialHeat, the influence-concentration
 * share (largest single source) with an early-warning flag, and whether the exploration floor holds
 * with social on. All synthetic + descriptive — never a real listener's data, never a quality grade.
 */
function computeSocialBenchmark(
  events: EventRecord[],
  counts: Record<string, CommunityCounts | undefined>,
  connections: MusicConnection[],
  profileItems: MusicProfileItem[],
  anonymous: RankedEvent[]
): SocialBenchmark {
  // Deterministic synthetic circle: the first events in the window get friend going/firing, and a
  // single "followed curator" picks two of them — enough to exercise lift + concentration.
  const circleActivityByEvent: Record<string, { eventId: string; goingCount: number; fireCount: number; people: [] }> = {};
  const followedCuratorPicksByEvent: Record<string, Array<{ handle: string; displayName: string }>> = {};
  events.slice(0, 6).forEach((event, index) => {
    circleActivityByEvent[event.id] = {
      eventId: event.id,
      goingCount: 2,
      fireCount: index % 2 === 0 ? 1 : 0,
      people: [],
    };
  });
  for (const event of events.slice(0, 2)) {
    followedCuratorPicksByEvent[event.id] = [{ handle: "benchmark-curator", displayName: "Benchmark Curator" }];
  }

  const socialScores = scoreDiscoveryEvents({
    events,
    counts,
    connections,
    profileItems,
    listenerPreferences: { weights: { socialCircle: 200 } },
    circleActivityByEvent,
    followedCuratorPicksByEvent,
  });
  const socialRanked = rankEvents(events, socialScores, counts, { enforceFloor: true });
  const top = socialRanked.slice(0, TOP_N);

  // Lift: "your people" (socialCircle) vs anonymous popularity (socialHeat), summed across the top-N.
  const liftRows = top.map((event) => {
    const components = socialScores[event.eventId]?.components;
    return {
      socialCircle: components?.socialCircle.total ?? 0,
      socialHeat: components?.socialHeat.total ?? 0,
    };
  });
  const { socialLift, popularityLift } = computeSocialLift(liftRows);

  // Concentration: split socialCircle movement between the single curator and the friend network.
  let curatorContribution = 0;
  let friendContribution = 0;
  for (const event of events) {
    const adj = socialScores[event.id]?.components.socialCircle.adjustment ?? 0;
    if (adj <= 0) continue;
    if (followedCuratorPicksByEvent[event.id]) {
      curatorContribution += adj;
    } else {
      friendContribution += adj;
    }
  }
  const { concentrationShare, concentrationFlag } = computeInfluenceConcentration([
    curatorContribution,
    friendContribution,
  ]);

  const baselineNoveltyShare = computeNoveltyShare(anonymous.slice(0, TOP_N));
  const socialNoveltyShare = computeNoveltyShare(top);

  return {
    socialLift,
    popularityLift,
    concentrationShare,
    concentrationFlag,
    floorHolds: computeFloorHolds(baselineNoveltyShare, socialNoveltyShare),
    baselineNoveltyShare,
    socialNoveltyShare,
  };
}

/* ------------------------------------------------------------------ */
/*  Synthetic profile (privacy-safe)                                   */
/* ------------------------------------------------------------------ */

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
    // Impressions now feed implicit skip cooling (PRD 18 / C1) — surfaced so the admin can see the
    // implicit-learning input alongside explicit removals.
    const impressions = byAction.find((row) => row.action === "impression")?.count ?? 0;
    return {
      total,
      byAction,
      removals,
      negativeLearningActive: removals > 0,
      impressions,
      implicitLearningActive: impressions > 0,
      impressionNonConversionShare: computeNonConversionShare(byAction, impressions),
    };
  } catch {
    return {
      total: 0,
      byAction: [],
      removals: 0,
      negativeLearningActive: false,
      impressions: 0,
      implicitLearningActive: false,
      impressionNonConversionShare: 0,
    };
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
