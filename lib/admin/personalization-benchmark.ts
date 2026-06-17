import "server-only";
import { getUpcomingEvents, type EventRecord } from "@/lib/events";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import { scoreDiscoveryEvents, SCORER_VERSION, type DiscoveryScore } from "@/lib/discovery";
import {
  listTraceableListeners,
  scoreListenerAgainstAnonymous,
  type ListenerScoring,
} from "@/lib/admin/listener-graph";
import {
  computePersonalizationCoverage,
  computePersonalizationGuardrails,
  computePersonalizationLift,
  computeNoveltyShare,
  computeSignalAttribution,
  computeSkipInfluence,
  computeWindow,
  serializePersonalizationMarkdown,
  type PersonalizationListenerRow,
  type PersonalizationReading,
} from "@/lib/admin/insight-metrics";

/**
 * Deeper Personalization Benchmark (PRD 28 / Phase 10, Outcome 2).
 *
 * The aggregate read for "are real listeners getting meaningfully different and more useful
 * rankings than the anonymous baseline?". It rolls up the EXISTING per-listener Listener Trace
 * scoring (`scoreListenerAgainstAnonymous`) across a bounded set of real traceable listeners —
 * adding no new scoring and no new table. Output is aggregate-only (shares/means/counts): no
 * listener identity, token, or private profile value is ever included. Descriptive, never a grade.
 *
 * The reproducible synthetic-behavior fixture (a committed skip/engage fixture that moves only when
 * the algorithm changes) is intentionally PARKED — see PRD 28 "Parked — Synthetic Behavior Fixture".
 */

const CACHE_TTL_MS = 30_000;
const TOP_N = 10;
// Bound the per-listener re-scoring cost on the admin path: each listener is a small loader
// fan-out + one scoring pass, cached. Conservative cap; raise only if the read stays cheap.
const MAX_LISTENERS = 15;

export type PersonalizationBenchmark = PersonalizationReading & { markdown: string };

let cache: { at: number; value: PersonalizationBenchmark } | null = null;

/**
 * Compute the benchmark from already-loaded shared inputs (so the Insight payload reuses its single
 * events/counts/anonymousScores load). Resilient: any failure degrades to an `available: false`
 * reading rather than breaking the Insight surface.
 */
export async function loadPersonalizationBenchmark(
  events: EventRecord[],
  counts: Record<string, CommunityCounts | undefined>,
  anonymousScores: Record<string, DiscoveryScore>
): Promise<PersonalizationBenchmark> {
  const generatedAt = new Date().toISOString();
  const window = computeWindow(events);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

  let listeners: Awaited<ReturnType<typeof listTraceableListeners>> = [];
  try {
    listeners = await listTraceableListeners();
  } catch {
    listeners = [];
  }
  const analyzed = listeners.slice(0, MAX_LISTENERS);

  const rows: PersonalizationListenerRow[] = [];
  for (const listener of analyzed) {
    let scoring: ListenerScoring | null = null;
    try {
      scoring = await scoreListenerAgainstAnonymous(listener.identityKey, events, counts, anonymousScores);
    } catch {
      scoring = null;
    }
    if (scoring) rows.push(toRow(scoring));
  }

  const baselineNoveltyShare = computeAnonymousNoveltyShare(anonymousScores);

  const reading: PersonalizationReading = {
    generatedAt,
    available: rows.length > 0,
    methodology: {
      windowStart: window.start,
      windowEnd: window.end,
      scorerVersion: SCORER_VERSION,
      commit,
      listenersAnalyzed: rows.length,
      note: `Aggregate roll-up of ${rows.length} real traceable listeners' rankings vs. the anonymous baseline (capped at ${MAX_LISTENERS}); no listener identities.`,
    },
    lift: computePersonalizationLift(rows),
    skip: computeSkipInfluence(rows),
    attribution: computeSignalAttribution(rows),
    guardrails: computePersonalizationGuardrails(rows, baselineNoveltyShare),
    coverage: computePersonalizationCoverage(rows, listeners.length),
  };

  const value: PersonalizationBenchmark = {
    ...reading,
    markdown: serializePersonalizationMarkdown(reading),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Standalone entry point (loads its own shared inputs) for callers outside the Insight payload. */
export async function loadPersonalizationBenchmarkStandalone(force = false): Promise<PersonalizationBenchmark> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let events: EventRecord[] = [];
  try {
    events = await getUpcomingEvents();
  } catch {
    events = [];
  }
  let counts: Record<string, CommunityCounts | undefined> = {};
  try {
    counts = events.length > 0 ? await getCommunityCountsByEvent(events.map((event) => event.id)) : {};
  } catch {
    counts = {};
  }
  const anonymousScores = scoreDiscoveryEvents({ events, counts });
  return loadPersonalizationBenchmark(events, counts, anonymousScores);
}

/* ------------------------------------------------------------------ */
/*  Per-listener → row reduction                                       */
/* ------------------------------------------------------------------ */

function toRow(scoring: ListenerScoring): PersonalizationListenerRow {
  const surfaced = scoring.surfaced;
  const top = surfaced.slice(0, TOP_N);
  const displacements = top.map((event) => Math.abs(event.delta));
  const meanDisplacement = top.length > 0 ? displacements.reduce((sum, value) => sum + value, 0) / top.length : 0;
  const moved = top.some((event) => event.delta !== 0);

  const skipReasonEvents = surfaced.filter((event) =>
    event.reasons.some((reason) => /skip/i.test(reason))
  ).length;

  const weights = scoring.preferences.weights ?? {};
  const tunedWeight = Object.values(weights).some((weight) => Number(weight) !== 0);
  const hasSignal =
    scoring.signals.length > 0 ||
    scoring.profileItems.length > 0 ||
    scoring.preferences.customSignals.length > 0 ||
    tunedWeight;

  return {
    hasSignal,
    personalized: moved,
    meanDisplacement,
    hasImplicitSignals: scoring.implicitSignals.length > 0,
    skipReasonEvents,
    noveltyShare: computeNoveltyShare(top),
    reasons: surfaced.flatMap((event) => event.reasons),
  };
}

/** Anonymous baseline novelty share over the top-N (the exploration-floor `novel` flag). */
function computeAnonymousNoveltyShare(anonymousScores: Record<string, DiscoveryScore>): number {
  const top = Object.values(anonymousScores)
    .sort((a, b) => b.bestBetsScore - a.bestBetsScore)
    .slice(0, TOP_N)
    .map((score) => ({ novel: score.components.novelty.base > 0 }));
  return computeNoveltyShare(top);
}
