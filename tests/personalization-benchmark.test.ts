import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePersonalizationCoverage,
  computePersonalizationGuardrails,
  computePersonalizationLift,
  computeSignalAttribution,
  computeSkipInfluence,
  serializePersonalizationMarkdown,
  type PersonalizationListenerRow,
  type PersonalizationReading,
} from "../lib/admin/insight-metrics";

/* Deeper Personalization Benchmark pure helpers (PRD 28 / Phase 10, Outcome 2). */

function row(overrides: Partial<PersonalizationListenerRow> = {}): PersonalizationListenerRow {
  return {
    hasSignal: true,
    personalized: true,
    meanDisplacement: 2,
    hasImplicitSignals: false,
    skipReasonEvents: 0,
    noveltyShare: 40,
    reasons: [],
    ...overrides,
  };
}

test("computePersonalizationLift: personalized share + mean/median displacement over personalized only", () => {
  const rows = [
    row({ personalized: true, meanDisplacement: 2 }),
    row({ personalized: true, meanDisplacement: 4 }),
    row({ personalized: false, meanDisplacement: 0 }),
    row({ personalized: false, meanDisplacement: 0 }),
  ];
  const lift = computePersonalizationLift(rows);
  assert.equal(lift.listeners, 4);
  assert.equal(lift.personalizedShare, 50); // 2 of 4
  assert.equal(lift.meanDisplacement, 3); // mean of [2,4]
  assert.equal(lift.medianDisplacement, 3); // median of [2,4]
});

test("computePersonalizationLift: empty → zeros", () => {
  assert.deepEqual(computePersonalizationLift([]), {
    listeners: 0,
    personalizedShare: 0,
    meanDisplacement: 0,
    medianDisplacement: 0,
  });
});

test("computeSignalAttribution: ranks flattened reasons by frequency, capped", () => {
  const rows = [
    row({ reasons: ["saved venue", "matches your top genres"] }),
    row({ reasons: ["saved venue", "saved venue"] }),
    row({ reasons: ["you tend to skip this artist"] }),
  ];
  const attribution = computeSignalAttribution(rows, 2);
  assert.equal(attribution.length, 2);
  assert.deepEqual(attribution[0], { label: "saved venue", count: 3 });
});

test("computeSkipInfluence: counts implicit availability and surfaced skip reasons", () => {
  const rows = [
    row({ hasImplicitSignals: true, skipReasonEvents: 2 }),
    row({ hasImplicitSignals: true, skipReasonEvents: 0 }),
    row({ hasImplicitSignals: false, skipReasonEvents: 0 }),
    row({ hasImplicitSignals: true, skipReasonEvents: 1 }),
  ];
  const skip = computeSkipInfluence(rows);
  assert.equal(skip.listenersWithImplicit, 3);
  assert.equal(skip.listenersWithSkipReason, 2);
  assert.equal(skip.skipReasonShare, 50); // 2 of 4
  assert.equal(skip.skipReasonEvents, 3); // 2 + 0 + 0 + 1
});

test("computePersonalizationGuardrails: floor holds when personalized novelty >= baseline", () => {
  const rows = [
    row({ personalized: true, noveltyShare: 50 }),
    row({ personalized: true, noveltyShare: 30 }),
    row({ personalized: false, noveltyShare: 0 }), // ignored: personalized exist
  ];
  const holds = computePersonalizationGuardrails(rows, 35);
  assert.equal(holds.meanNoveltyShare, 40); // mean of [50,30]
  assert.equal(holds.baselineNoveltyShare, 35);
  assert.equal(holds.floorHolds, true);

  const regressed = computePersonalizationGuardrails(rows, 60);
  assert.equal(regressed.floorHolds, false);
});

test("computePersonalizationGuardrails: falls back to all rows when none personalized", () => {
  const rows = [row({ personalized: false, noveltyShare: 20 }), row({ personalized: false, noveltyShare: 40 })];
  const holds = computePersonalizationGuardrails(rows, 10);
  assert.equal(holds.meanNoveltyShare, 30);
  assert.equal(holds.floorHolds, true);
});

test("computePersonalizationCoverage: with-signal and personalized counts vs traceable total", () => {
  const rows = [
    row({ hasSignal: true, personalized: true }),
    row({ hasSignal: true, personalized: false }),
    row({ hasSignal: false, personalized: false }),
  ];
  assert.deepEqual(computePersonalizationCoverage(rows, 12), {
    traceable: 12,
    withSignal: 2,
    personalized: 1,
  });
});

function sampleReading(): PersonalizationReading {
  const rows = [
    row({ personalized: true, meanDisplacement: 3, hasImplicitSignals: true, skipReasonEvents: 2, noveltyShare: 40, reasons: ["saved venue"] }),
    row({ personalized: false, meanDisplacement: 0, noveltyShare: 30, reasons: [] }),
  ];
  return {
    generatedAt: "2026-06-17T10:00:00.000Z",
    available: true,
    methodology: {
      windowStart: "2026-06-17",
      windowEnd: "2026-07-07",
      scorerVersion: "12.4",
      commit: "abc1234",
      listenersAnalyzed: 2,
      note: "Aggregate roll-up of 2 real traceable listeners' rankings vs. the anonymous baseline (capped at 15); no listener identities.",
    },
    lift: computePersonalizationLift(rows),
    skip: computeSkipInfluence(rows),
    attribution: computeSignalAttribution(rows),
    guardrails: computePersonalizationGuardrails(rows, 35),
    coverage: computePersonalizationCoverage(rows, 5),
  };
}

test("serializePersonalizationMarkdown: dated, descriptive snapshot", () => {
  const md = serializePersonalizationMarkdown(sampleReading());
  assert.match(md, /^### Deeper Personalization Benchmark — 2026-06-17$/m);
  assert.match(md, /\*\*Window:\*\* 2026-06-17 → 2026-07-07/);
  assert.match(md, /\*\*Scorer:\*\* v12\.4 \(commit abc1234\)/);
  assert.match(md, /not a single quality score/);
  assert.match(md, /aggregate only, no listener identities/);
  assert.match(md, /\*\*Lift:\*\* 50% of 2 listeners/);
  assert.match(md, /capped below explicit remove/);
  assert.match(md, /\*\*Top signals:\*\* saved venue ×1/);
});

test("serializePersonalizationMarkdown: unavailable reading is honest and short", () => {
  const reading = sampleReading();
  reading.available = false;
  const md = serializePersonalizationMarkdown(reading);
  assert.match(md, /No traceable listeners with enough signal yet/);
  assert.doesNotMatch(md, /\*\*Lift:\*\*/);
});
