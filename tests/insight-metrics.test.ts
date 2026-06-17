import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeEngagement,
  computeNonConversionShare,
  computeNoveltyShare,
  computeWindow,
  serializeBaselineMarkdown,
  type BaselineReading,
} from "../lib/admin/insight-metrics";

/* Discovery Baseline pure helpers (PRD 22 / Phase 10). */

test("computeNonConversionShare: impressions minus converting actions, clamped to [0,100]", () => {
  const byAction = [
    { action: "impression", count: 100 },
    { action: "detail_open", count: 20 },
    { action: "fire", count: 5 },
    { action: "remove", count: 3 }, // not a conversion
  ];
  // 100 impressions, 25 converting → 75% never convert.
  assert.equal(computeNonConversionShare(byAction, 100), 75);
});

test("computeNonConversionShare: no impressions → 0", () => {
  assert.equal(computeNonConversionShare([{ action: "fire", count: 9 }], 0), 0);
});

test("computeNonConversionShare: more conversions than impressions clamps to 0", () => {
  const byAction = [{ action: "detail_open", count: 50 }];
  assert.equal(computeNonConversionShare(byAction, 10), 0);
});

test("computeNoveltyShare: share of top-N flagged novel", () => {
  const top = [{ novel: true }, { novel: false }, { novel: true }, { novel: false }];
  assert.equal(computeNoveltyShare(top), 50);
  assert.equal(computeNoveltyShare([]), 0);
});

test("computeEngagement: total heat and top-N concentration", () => {
  const ranked = [
    { communitySignal: 10 },
    { communitySignal: 6 },
    { communitySignal: 3 },
    { communitySignal: 1 },
  ];
  // total = 20; top-2 = 16 → 80% concentrated.
  assert.deepEqual(computeEngagement(ranked, 2), { totalHeat: 20, topNHeatShare: 80 });
  assert.deepEqual(computeEngagement([], 5), { totalHeat: 0, topNHeatShare: 0 });
});

test("computeWindow: min/max event date across events", () => {
  const events = [
    { eventDate: "2026-06-20" },
    { eventDate: "2026-06-16" },
    { eventDate: "2026-07-01" },
  ];
  assert.deepEqual(computeWindow(events), { start: "2026-06-16", end: "2026-07-01" });
  assert.deepEqual(computeWindow([]), { start: "", end: "" });
});

function sampleReading(): BaselineReading {
  return {
    generatedAt: "2026-06-16T12:34:56.000Z",
    methodology: {
      windowStart: "2026-06-16",
      windowEnd: "2026-07-07",
      scorerVersion: "11.4",
      commit: "abc1234",
      syntheticProfileNote: "Fixed public-derived seed (5 artists), pinned 2026-06-16.",
    },
    metrics: {
      topN: 10,
      venueSpread: 7,
      artistSpread: 9,
      tagSpread: 12,
      lowDiversity: false,
      noveltyShare: 30,
      localValueShare: 60,
      engagement: { totalHeat: 42, topNHeatShare: 55 },
      coverage: { withSignal: 18, timingOnly: 22, total: 40 },
      signalMix: [
        { label: "Timing", count: 5 },
        { label: "Community heat", count: 3 },
      ],
    },
    behavior: { total: 500, removals: 4, impressions: 300, impressionNonConversionShare: 72 },
    anonymous: [
      { title: "Show A", venueName: "Venue 1", score: 88.5 },
      { title: "Show B", venueName: "Venue 2", score: 81.2 },
    ],
  };
}

test("serializeBaselineMarkdown: dated, descriptive snapshot with methodology", () => {
  const md = serializeBaselineMarkdown(sampleReading());
  assert.match(md, /^### Discovery Baseline — 2026-06-16$/m);
  assert.match(md, /\*\*Window:\*\* 2026-06-16 → 2026-07-07/);
  assert.match(md, /\*\*Scorer:\*\* v11\.4 \(commit abc1234\)/);
  assert.match(md, /not a single quality score/);
  assert.match(md, /\*\*Novelty:\*\* 30% of top-10 under-the-radar/);
  assert.match(md, /\*\*Engagement:\*\* 42 total community heat · 55% concentrated in top-10/);
  assert.match(md, /1\. Show A — Venue 1 \(score 88\.5\)/);
});

test("serializeBaselineMarkdown: omits commit when absent", () => {
  const reading = sampleReading();
  reading.methodology.commit = null;
  const md = serializeBaselineMarkdown(reading);
  assert.match(md, /\*\*Scorer:\*\* v11\.4$/m);
  assert.doesNotMatch(md, /commit/);
});
