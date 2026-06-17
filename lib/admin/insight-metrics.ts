/**
 * Pure, dependency-free helpers for the Discovery Baseline (PRD 22 / Phase 10).
 *
 * Deliberately imports nothing (no `server-only`, no `@/lib/db`) so the baseline math and the
 * markdown snapshot serializer are unit-testable in isolation. `lib/admin/insight.ts` composes
 * these with the live scorer output. All metrics are descriptive — never a single quality score.
 */

/** Engagement actions that count as an impression "converting" into a meaningful interaction. */
export const CONVERTING_ACTIONS = new Set([
  "detail_open",
  "avlgo_click",
  "fire",
  "planning",
  "contribution",
]);

/**
 * Aggregate (not per-impression) proxy for soft-negative volume: of all impressions, the share not
 * matched by a converting action across the window. Returns a whole percentage clamped to [0, 100].
 */
export function computeNonConversionShare(
  byAction: Array<{ action: string; count: number }>,
  impressions: number
): number {
  if (impressions <= 0) return 0;
  const converting = byAction
    .filter((row) => CONVERTING_ACTIONS.has(row.action))
    .reduce((sum, row) => sum + row.count, 0);
  const share = (impressions - converting) / impressions;
  return Math.round(Math.min(1, Math.max(0, share)) * 100);
}

/** Pinned event window for the reading — the min/max event date across the scored events. */
export function computeWindow(events: Array<{ eventDate: string | Date }>): {
  start: string;
  end: string;
} {
  const dates = events
    .map((event) => (typeof event.eventDate === "string" ? event.eventDate : String(event.eventDate)))
    .filter(Boolean)
    .sort();
  return { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" };
}

/** % of the top-N that is under-the-radar (the exploration-floor `novel` flag). */
export function computeNoveltyShare(top: Array<{ novel: boolean }>): number {
  if (top.length === 0) return 0;
  const novel = top.filter((event) => event.novel).length;
  return Math.round((novel / top.length) * 100);
}

/** Community heat across the window and how much concentrates in the top-N. */
export function computeEngagement(
  ranked: Array<{ communitySignal: number }>,
  topN: number
): { totalHeat: number; topNHeatShare: number } {
  const totalHeat = ranked.reduce((sum, event) => sum + event.communitySignal, 0);
  const topNHeat = ranked.slice(0, topN).reduce((sum, event) => sum + event.communitySignal, 0);
  return {
    totalHeat,
    topNHeatShare: totalHeat > 0 ? Math.round((topNHeat / totalHeat) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Social & Curator Benchmark (PRD 27 / C5)                           */
/* ------------------------------------------------------------------ */

/**
 * Default early-warning threshold for influence concentration: flag when a single person / curator /
 * network drives more than this share of total social-driven movement. Descriptive, not a grade;
 * stated on the panel + snapshot and tuned against real data.
 */
export const INFLUENCE_CONCENTRATION_THRESHOLD = 0.6;

export type SocialBenchmark = {
  /** Aggregate "your people" lift across the top-N (sum of socialCircle component totals). */
  socialLift: number;
  /** Aggregate anonymous popularity contribution (sum of socialHeat component totals) — reported separately. */
  popularityLift: number;
  /** Share of social-driven movement attributable to the single largest source, [0,1]. */
  concentrationShare: number;
  /** True when concentrationShare crosses the early-warning threshold. */
  concentrationFlag: boolean;
  /** True when the novel/local exploration floor still holds with social maxed (no regression). */
  floorHolds: boolean;
  baselineNoveltyShare: number;
  socialNoveltyShare: number;
};

/**
 * "Your people" lift vs. anonymous popularity — reported SEPARATELY so social-driven movement is
 * never read as crowd popularity. Sums the per-event `socialCircle` and `socialHeat` component totals
 * across the (top-N) ranking. Pure; the caller supplies the already-scored components.
 */
export function computeSocialLift(
  rows: Array<{ socialCircle: number; socialHeat: number }>
): { socialLift: number; popularityLift: number } {
  let socialLift = 0;
  let popularityLift = 0;
  for (const row of rows) {
    socialLift += Math.max(0, row.socialCircle);
    popularityLift += Math.max(0, row.socialHeat);
  }
  return { socialLift: Math.round(socialLift), popularityLift: Math.round(popularityLift) };
}

/**
 * Influence concentration: of total social-driven movement, the share attributable to the single
 * largest source (a person / curator / network). Returns the share in [0,1] and an early-warning
 * flag when it crosses `threshold`. Zero movement → 0 share, unflagged.
 */
export function computeInfluenceConcentration(
  contributions: number[],
  threshold = INFLUENCE_CONCENTRATION_THRESHOLD
): { concentrationShare: number; concentrationFlag: boolean } {
  const positive = contributions.map((value) => Math.max(0, value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { concentrationShare: 0, concentrationFlag: false };
  }
  const max = Math.max(...positive);
  const share = max / total;
  return {
    concentrationShare: Math.round(share * 100) / 100,
    concentrationFlag: share > threshold,
  };
}

/** The exploration floor holds when novelty share with social on is not below the anonymous baseline. */
export function computeFloorHolds(baselineNoveltyShare: number, socialNoveltyShare: number): boolean {
  return socialNoveltyShare >= baselineNoveltyShare;
}

/** Minimal shape `serializeBaselineMarkdown` reads — satisfied structurally by `RecommendationInsight`. */
export type BaselineReading = {
  generatedAt: string;
  methodology: {
    windowStart: string;
    windowEnd: string;
    scorerVersion: string;
    commit: string | null;
    syntheticProfileNote: string;
  };
  metrics: {
    topN: number;
    venueSpread: number;
    artistSpread: number;
    tagSpread: number;
    lowDiversity: boolean;
    noveltyShare: number;
    localValueShare: number;
    engagement: { totalHeat: number; topNHeatShare: number };
    coverage: { withSignal: number; timingOnly: number; total: number };
    signalMix: Array<{ label: string; count: number }>;
  };
  behavior: {
    total: number;
    removals: number;
    impressions: number;
    impressionNonConversionShare: number;
  };
  anonymous: Array<{ title: string; venueName: string; score: number }>;
  /** Social & Curator Benchmark (PRD 27 / C5) — present once the social signal exists. */
  social?: SocialBenchmark;
};

/**
 * Serialize a reading into a dated, paste-ready markdown block (recording without storage). Pure:
 * copied into the shipped PRD / sprint record so a future reading can be diffed by eye.
 */
export function serializeBaselineMarkdown(reading: BaselineReading): string {
  const { methodology: m, metrics: x, behavior: b, anonymous } = reading;
  const date = reading.generatedAt.slice(0, 10);
  const topN = x.topN;
  const lines = [
    `### Discovery Baseline — ${date}`,
    "",
    `- **Window:** ${m.windowStart || "?"} → ${m.windowEnd || "?"}`,
    `- **Scorer:** v${m.scorerVersion}${m.commit ? ` (commit ${m.commit})` : ""}`,
    `- **Synthetic profile:** ${m.syntheticProfileNote}`,
    `- _Descriptive snapshot — not a single quality score._`,
    "",
    `**Diversity (top ${topN}):** ${x.venueSpread} venues · ${x.artistSpread} artists · ${x.tagSpread} tags${x.lowDiversity ? " · ⚠ low diversity" : ""}`,
    `**Novelty:** ${x.noveltyShare}% of top-${topN} under-the-radar`,
    `**Local value:** ${x.localValueShare}% of top-${topN} carry community signal`,
    `**Engagement:** ${x.engagement.totalHeat} total community heat · ${x.engagement.topNHeatShare}% concentrated in top-${topN}`,
    `**Coverage:** ${x.coverage.withSignal}/${x.coverage.total} events personalized · ${x.coverage.timingOnly} rank on timing alone`,
    `**Signal mix (top ${topN}):** ${x.signalMix.map((s) => `${s.label} ${s.count}`).join(" · ") || "—"}`,
    `**Behavior:** ${b.total} interactions · ${b.removals} removals · ${b.impressions} impressions · ${b.impressionNonConversionShare}% non-converting`,
    "",
    `**Top ${Math.min(5, anonymous.length)} anonymous ranking:**`,
    ...anonymous.slice(0, 5).map((e, i) => `${i + 1}. ${e.title} — ${e.venueName} (score ${e.score})`),
  ];

  if (reading.social) {
    const s = reading.social;
    lines.push(
      "",
      `**Social & Curator (PRD 27):**`,
      `- "Your people" lift: ${s.socialLift} · anonymous popularity (socialHeat): ${s.popularityLift} — read separately, never combined.`,
      `- Influence concentration: ${Math.round(s.concentrationShare * 100)}% from the single largest source${s.concentrationFlag ? " · ⚠ early-warning threshold crossed" : ""}.`,
      `- Exploration floor holds with social maxed: ${s.floorHolds ? "yes" : "⚠ NO"} (novelty ${s.socialNoveltyShare}% vs baseline ${s.baselineNoveltyShare}%).`,
      `- _Descriptive synthetic-circle reading — not a quality score; no money buys rank._`
    );
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Deeper Personalization Benchmark (PRD 28 / Phase 10, Outcome 2)   */
/* ------------------------------------------------------------------ */

/**
 * One real listener's personalization read, reduced to the plain numbers the roll-up needs. Derived
 * from the existing Listener Trace scoring (personal vs anonymous), so the benchmark adds NO new
 * scoring — it aggregates what the per-listener trace already computes. Aggregate-only: a row never
 * carries an identity, token, or any private profile value.
 */
export type PersonalizationListenerRow = {
  /** Listener has enough taste/behavior signal for personalization to do anything. */
  hasSignal: boolean;
  /** This listener's top-N order differs from the anonymous baseline. */
  personalized: boolean;
  /** Mean |personalRank − anonymousRank| across the listener's surfaced top-N. */
  meanDisplacement: number;
  /** Listener has impression-derived implicit skip signals available. */
  hasImplicitSignals: boolean;
  /** # of the listener's surfaced events showing a "you tend to skip…" reason. */
  skipReasonEvents: number;
  /** Novelty share (0–100) of this listener's personalized top-N (the exploration-floor `novel` flag). */
  noveltyShare: number;
  /** Flattened human reasons across the listener's surfaced events (the explainable signal labels). */
  reasons: string[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Whether and how much real listeners' rankings diverge from the anonymous baseline. */
export function computePersonalizationLift(rows: PersonalizationListenerRow[]): {
  listeners: number;
  personalizedShare: number;
  meanDisplacement: number;
  medianDisplacement: number;
} {
  const listeners = rows.length;
  if (listeners === 0) {
    return { listeners: 0, personalizedShare: 0, meanDisplacement: 0, medianDisplacement: 0 };
  }
  const personalized = rows.filter((row) => row.personalized);
  const displacements = personalized.map((row) => row.meanDisplacement);
  const meanDisplacement =
    displacements.length > 0
      ? Math.round((displacements.reduce((sum, value) => sum + value, 0) / displacements.length) * 10) / 10
      : 0;
  return {
    listeners,
    personalizedShare: Math.round((personalized.length / listeners) * 100),
    meanDisplacement,
    medianDisplacement: Math.round(median(displacements) * 10) / 10,
  };
}

/** Which explainable signals drove personalization, ranked by how often they appear across listeners. */
export function computeSignalAttribution(
  rows: PersonalizationListenerRow[],
  limit = 8
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of row.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * The headline Outcome-2 read: do SKIPS measurably move rankings? Reports how many listeners have
 * implicit skip signals and how many actually see a "you tend to skip…" reason on a surfaced event.
 * Implicit cooling stays capped below the explicit `remove` envelope (PRD 18/21), so skips nudge but
 * never bury — that invariant is stated descriptively, never as a grade.
 */
export function computeSkipInfluence(rows: PersonalizationListenerRow[]): {
  listenersWithImplicit: number;
  listenersWithSkipReason: number;
  skipReasonShare: number;
  skipReasonEvents: number;
} {
  const listeners = rows.length;
  const listenersWithImplicit = rows.filter((row) => row.hasImplicitSignals).length;
  const listenersWithSkipReason = rows.filter((row) => row.skipReasonEvents > 0).length;
  const skipReasonEvents = rows.reduce((sum, row) => sum + row.skipReasonEvents, 0);
  return {
    listenersWithImplicit,
    listenersWithSkipReason,
    skipReasonShare: listeners > 0 ? Math.round((listenersWithSkipReason / listeners) * 100) : 0,
    skipReasonEvents,
  };
}

/**
 * Loop-protection read: personalization must not collapse novelty vs the anonymous baseline. The
 * floor "holds" when listeners' mean personalized novelty share is not below the anonymous baseline
 * — i.e. deep personalization isn't quietly burying the quiet/local shows it hasn't clicked yet.
 */
export function computePersonalizationGuardrails(
  rows: PersonalizationListenerRow[],
  baselineNoveltyShare: number
): { meanNoveltyShare: number; baselineNoveltyShare: number; floorHolds: boolean } {
  const personalized = rows.filter((row) => row.personalized);
  const shares = (personalized.length > 0 ? personalized : rows).map((row) => row.noveltyShare);
  const meanNoveltyShare =
    shares.length > 0 ? Math.round(shares.reduce((sum, value) => sum + value, 0) / shares.length) : 0;
  return {
    meanNoveltyShare,
    baselineNoveltyShare,
    floorHolds: meanNoveltyShare >= baselineNoveltyShare,
  };
}

/** How many traceable listeners actually have enough signal to be personalized at all. */
export function computePersonalizationCoverage(
  rows: PersonalizationListenerRow[],
  traceableTotal: number
): { traceable: number; withSignal: number; personalized: number } {
  return {
    traceable: traceableTotal,
    withSignal: rows.filter((row) => row.hasSignal).length,
    personalized: rows.filter((row) => row.personalized).length,
  };
}

/** Aggregate-only Deeper Personalization reading — no listener identities, never a quality score. */
export type PersonalizationReading = {
  generatedAt: string;
  /** False when there are no traceable listeners with enough signal to aggregate. */
  available: boolean;
  methodology: {
    windowStart: string;
    windowEnd: string;
    scorerVersion: string;
    commit: string | null;
    listenersAnalyzed: number;
    note: string;
  };
  lift: ReturnType<typeof computePersonalizationLift>;
  skip: ReturnType<typeof computeSkipInfluence>;
  attribution: Array<{ label: string; count: number }>;
  guardrails: ReturnType<typeof computePersonalizationGuardrails>;
  coverage: ReturnType<typeof computePersonalizationCoverage>;
};

/** Serialize the personalization reading into a dated, paste-ready markdown block (no storage). */
export function serializePersonalizationMarkdown(reading: PersonalizationReading): string {
  const date = reading.generatedAt.slice(0, 10);
  const m = reading.methodology;
  if (!reading.available) {
    return [
      `### Deeper Personalization Benchmark — ${date}`,
      "",
      "_No traceable listeners with enough signal yet — nothing to aggregate._",
    ].join("\n");
  }
  return [
    `### Deeper Personalization Benchmark — ${date}`,
    "",
    `- **Window:** ${m.windowStart || "?"} → ${m.windowEnd || "?"}`,
    `- **Scorer:** v${m.scorerVersion}${m.commit ? ` (commit ${m.commit})` : ""}`,
    `- **Method:** ${m.note}`,
    `- _Descriptive snapshot — not a single quality score; aggregate only, no listener identities._`,
    "",
    `**Lift:** ${reading.lift.personalizedShare}% of ${reading.lift.listeners} listeners get a different top-N · mean displacement ${reading.lift.meanDisplacement} ranks (median ${reading.lift.medianDisplacement}).`,
    `**Skips:** ${reading.skip.listenersWithSkipReason}/${reading.lift.listeners} listeners (${reading.skip.skipReasonShare}%) see a "you tend to skip…" reason · ${reading.skip.skipReasonEvents} surfaced events cooled — capped below explicit remove.`,
    `**Guardrail:** personalized novelty ${reading.guardrails.meanNoveltyShare}% vs anonymous baseline ${reading.guardrails.baselineNoveltyShare}% — floor ${reading.guardrails.floorHolds ? "holds" : "⚠ REGRESSED"}.`,
    `**Coverage:** ${reading.coverage.personalized}/${reading.coverage.withSignal} personalized of ${reading.coverage.traceable} traceable listeners.`,
    `**Top signals:** ${reading.attribution.map((entry) => `${entry.label} ×${entry.count}`).join(" · ") || "—"}`,
  ].join("\n");
}
