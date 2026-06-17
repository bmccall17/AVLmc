import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeFloorHolds,
  computeInfluenceConcentration,
  computeSocialLift,
  serializeBaselineMarkdown,
  INFLUENCE_CONCENTRATION_THRESHOLD,
  type BaselineReading,
} from "../lib/admin/insight-metrics";
import {
  EXPLORATION_FLOOR_BASE,
  SOCIAL_CIRCLE_CAP,
  scoreDiscoveryEvents,
} from "../lib/discovery";
import { toPublicSharedSong, type SharedSong } from "../lib/shared-songs-core";
import type { EventRecord } from "../lib/events";

const REPO = process.cwd();

/* ---- Pure social-benchmark metrics (PRD 27 / C5) -------------------------------- */

test("computeSocialLift reports 'your people' lift separately from popularity", () => {
  const { socialLift, popularityLift } = computeSocialLift([
    { socialCircle: 8, socialHeat: 20 },
    { socialCircle: 4, socialHeat: 10 },
  ]);
  assert.equal(socialLift, 12);
  assert.equal(popularityLift, 30);
});

test("computeInfluenceConcentration flags a single dominant source", () => {
  // One source drives 90% of movement → over the 60% threshold → flagged.
  const dominated = computeInfluenceConcentration([9, 1]);
  assert.equal(dominated.concentrationShare, 0.9);
  assert.equal(dominated.concentrationFlag, true);

  // Evenly split → not flagged.
  const balanced = computeInfluenceConcentration([5, 5]);
  assert.equal(balanced.concentrationFlag, false);

  // No movement → 0 share, unflagged.
  assert.deepEqual(computeInfluenceConcentration([0, 0]), {
    concentrationShare: 0,
    concentrationFlag: false,
  });
  assert.ok(INFLUENCE_CONCENTRATION_THRESHOLD > 0 && INFLUENCE_CONCENTRATION_THRESHOLD < 1);
});

test("computeFloorHolds is true only when social-on novelty does not regress vs baseline", () => {
  assert.equal(computeFloorHolds(20, 20), true);
  assert.equal(computeFloorHolds(20, 25), true);
  assert.equal(computeFloorHolds(20, 15), false);
});

test("serializeBaselineMarkdown emits a dated social block when present", () => {
  const reading = baseReading();
  const md = serializeBaselineMarkdown(reading);
  assert.match(md, /Social & Curator/);
  assert.match(md, /"Your people" lift: 12/);
  assert.match(md, /no money buys rank/);
});

/* ---- Invariant: social never drowns local/novel (cap below floor) --------------- */

test("INVARIANT: the socialCircle cap sits below the exploration floor base", () => {
  // The C4 guardrail, re-asserted at the benchmark level: a maxed social boost can never outweigh
  // the boost a quiet, under-the-radar local show is guaranteed — so social can't evict it.
  assert.ok(SOCIAL_CIRCLE_CAP < EXPLORATION_FLOOR_BASE);
});

/* ---- Invariant: no money buys rank --------------------------------------------- */

test("INVARIANT: no payment/entitlement field can change ranking", () => {
  const event = sampleEvent();
  const baseline = scoreDiscoveryEvents({ counts: {}, events: [event], now: NOW })[event.id];
  // Inject fabricated "money" fields the scorer must ignore entirely.
  const withMoney = scoreDiscoveryEvents({
    counts: {},
    events: [event],
    now: NOW,
    listenerPreferences: {
      weights: { socialCircle: 200 },
      paidBoost: 9999,
      payment: { tier: "premium" },
      purchasedRank: 1,
    } as unknown,
  })[event.id];
  // socialCircle dial is on but there's no circle data, and money fields are ignored → identical.
  assert.equal(withMoney.bestMatchScore, baseline.bestMatchScore);
});

test("INVARIANT: scoring + curator + preferences source carries no payment pathway", () => {
  // A money path is a code-level risk, so guard the source itself (catches a future regression).
  const forbidden = ["payment", "stripe", "billing", "checkout", "purchaseRank", "paidBoost"];
  for (const rel of ["lib/discovery.ts", "lib/curators.ts", "lib/listener-preferences.ts"]) {
    const source = readFileSync(join(REPO, rel), "utf8").toLowerCase();
    for (const token of forbidden) {
      assert.ok(!source.includes(token.toLowerCase()), `${rel} must not reference "${token}"`);
    }
  }
});

test("INVARIANT: the curator self-serve surface carries no payment pathway (PRD 33)", () => {
  // No money may set/raise curator status or rank. Guard the self-serve write surfaces at the source.
  const forbidden = ["payment", "stripe", "billing", "checkout", "purchaserank", "paidboost", "entitlement"];
  for (const rel of [
    "lib/curators.ts",
    "lib/curators-core.ts",
    "app/api/me/curator-application/route.ts",
    "app/api/me/curator/route.ts",
    "app/api/admin/curators/route.ts",
  ]) {
    const source = readFileSync(join(REPO, rel), "utf8").toLowerCase();
    for (const token of forbidden) {
      assert.ok(!source.includes(token), `${rel} must not reference "${token}"`);
    }
  }
});

/* ---- PII / leak audit ----------------------------------------------------------- */

test("LEAK AUDIT: public curator surfaces never reference applications, pending rows, or self-mgmt (PRD 33)", () => {
  // The application_note / pending+rejected rows / self-management reads are private to the
  // applicant + admin. No PUBLIC (anonymous-reachable) curator surface may touch them.
  const publicSurfaces = [
    "app/api/curators/route.ts",
    "app/curators/page.tsx",
    "app/curator/[handle]/page.tsx",
  ];
  const forbidden = [
    "application_note",
    "applicationNote",
    "listCuratorApplications",
    "getMyCuratorStatus",
    "getMyCurator",
    "getSelfServeAvailability",
    "listNotActivatedCurators",
  ];
  for (const rel of publicSurfaces) {
    const source = readFileSync(join(REPO, rel), "utf8");
    for (const token of forbidden) {
      assert.ok(!source.includes(token), `${rel} (public surface) must not reference "${token}"`);
    }
  }
});

test("LEAK AUDIT: every public curator read filters status='active' (PRD 33)", () => {
  // pending/rejected rows must be invisible by construction. Each public read in the service that
  // returns curator rows constrains to active.
  const source = readFileSync(join(REPO, "lib/curators.ts"), "utf8");
  // The three public reads (directory, profile, curated-by) each include the active filter.
  const activeFilters = source.match(/status\s*=\s*'active'/g) ?? [];
  assert.ok(activeFilters.length >= 3, "expected the public curator reads to filter status='active'");
});

test("LEAK AUDIT: toPublicSharedSong never carries the seeder id; sharedBy only when set", () => {
  const song: SharedSong = {
    id: "s1",
    eventId: "e1",
    provider: "spotify",
    providerTrackId: "abc",
    name: "Song",
    artistNames: ["Nyla"],
    externalUrl: null,
    imageUrl: null,
    previewUrl: null,
    shareCount: 1,
    status: "visible",
  };
  const pub = toPublicSharedSong(song, new Set());
  const keys = Object.keys(pub);
  assert.ok(!keys.includes("seeded_by_user_id"));
  assert.ok(!keys.includes("seededByUserId"));
  assert.ok(!keys.includes("status"));
  // sharedBy is attached only by the gated server path, never by the public projection.
  assert.equal((pub as { sharedBy?: unknown }).sharedBy, undefined);
});

test("LEAK AUDIT: anonymous community + OG surfaces reference no social/circle/follow data", () => {
  const anonymousSurfaces = [
    "app/api/community/contributions/route.ts",
    "app/api/community/reactions/route.ts",
    "app/api/community/ticket-intents/route.ts",
    "app/event/[id]/opengraph-image.tsx",
    "app/event/[id]/twitter-image.tsx",
  ];
  const forbidden = [
    "seeded_by_user_id",
    "listener_follows",
    "social-graph",
    "social-activity",
    "getCircleEventActivity",
    "canViewActivityOf",
    "socialCircle",
    "sharedBy",
    "followeeUserId",
  ];
  for (const rel of anonymousSurfaces) {
    const source = readFileSync(join(REPO, rel), "utf8");
    for (const token of forbidden) {
      assert.ok(!source.includes(token), `${rel} (anonymous surface) must not reference "${token}"`);
    }
  }
});

/* ---- Fixtures ------------------------------------------------------------------- */

const NOW = new Date("2026-06-07T12:00:00.000Z");

function sampleEvent(): EventRecord {
  return {
    artistName: "Sample Artist",
    avlgoEventId: "sample-avlgo",
    createdAt: "2026-06-01T00:00:00.000Z",
    eventDate: "2026-06-27",
    eventTime: "8:00 PM",
    eventTitle: "Sample Show",
    eventUrl: "https://www.avlgo.com/events/sample",
    id: "sample-event",
    imageUrl: null,
    source: "AVLgo live feed: TEST",
    startsAt: "2026-06-27T22:00:00.000Z",
    tags: ["Live Music"],
    updatedAt: "2026-06-01T00:00:00.000Z",
    venueName: "Test Venue",
  };
}

function baseReading(): BaselineReading {
  return {
    generatedAt: "2026-06-17T00:00:00.000Z",
    methodology: {
      windowStart: "2026-06-17",
      windowEnd: "2026-07-08",
      scorerVersion: "12.4",
      commit: null,
      syntheticProfileNote: "fixed seed",
    },
    metrics: {
      topN: 10,
      venueSpread: 8,
      artistSpread: 9,
      tagSpread: 6,
      lowDiversity: false,
      noveltyShare: 30,
      localValueShare: 40,
      engagement: { totalHeat: 100, topNHeatShare: 50 },
      coverage: { withSignal: 12, timingOnly: 8, total: 20 },
      signalMix: [{ label: "Timing", count: 5 }],
    },
    behavior: { total: 10, removals: 1, impressions: 100, impressionNonConversionShare: 70 },
    anonymous: [{ title: "A", venueName: "V", score: 50 }],
    social: {
      socialLift: 12,
      popularityLift: 30,
      concentrationShare: 0.4,
      concentrationFlag: false,
      floorHolds: true,
      baselineNoveltyShare: 30,
      socialNoveltyShare: 32,
    },
  };
}
