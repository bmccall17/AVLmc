import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVENTS_CACHE_TAG,
  createEventReadCache,
  filterNotYetStarted,
  type TaggedCacheFactory,
  type TaggedCacheOptions,
} from "../lib/event-read-cache";

/**
 * PRD 51 / ADR 002: the event read path is cached once-per-key, invalidated by tag on write, and
 * fresh after the cron revalidates. The cache wiring is pure (lib/event-read-cache.ts) and tested
 * against a faithful fake of `unstable_cache` (memoize by key parts + args; tag registry) with
 * the underlying DB fn as a spy — no live DB, honoring the no-local-DATABASE_URL constraint.
 * The write-side wiring (which routes revalidate which tag) is asserted by source scan below,
 * the established pattern from tests/spotify-gate.test.ts. Runs via tsx from the repo root.
 */

type FakeEvent = { id: string; startsAt: string | null };

function createFakeCache() {
  const entries = new Map<string, unknown>();
  const tagsByKey = new Map<string, string[]>();

  const factory = (<Args extends string[], Result>(
    fn: (...args: Args) => Promise<Result>,
    keyParts: string[],
    options: TaggedCacheOptions
  ) =>
    async (...args: Args): Promise<Result> => {
      const key = JSON.stringify([keyParts, args]);
      if (entries.has(key)) {
        return entries.get(key) as Result;
      }
      const value = await fn(...args);
      entries.set(key, value);
      tagsByKey.set(key, options.tags);
      return value;
    }) as TaggedCacheFactory;

  const revalidateTag = (tag: string) => {
    for (const [key, tags] of tagsByKey) {
      if (tags.includes(tag)) {
        entries.delete(key);
      }
    }
  };

  return { factory, revalidateTag };
}

function createHarness(initial: FakeEvent[]) {
  const fake = createFakeCache();
  let rows = initial;
  let listCalls = 0;
  let byIdCalls = 0;

  const cache = createEventReadCache<FakeEvent, FakeEvent>({
    cacheFactory: fake.factory,
    listUpcomingByDay: async () => {
      listCalls += 1;
      return rows;
    },
    getById: async (id) => {
      byIdCalls += 1;
      return rows.find((row) => row.id === id) ?? null;
    },
  });

  return {
    cache,
    revalidateTag: fake.revalidateTag,
    setRows: (next: FakeEvent[]) => {
      rows = next;
    },
    counts: () => ({ listCalls, byIdCalls }),
  };
}

const EVENT_A: FakeEvent = { id: "a", startsAt: null };
const EVENT_B: FakeEvent = { id: "b", startsAt: null };

test("underlying query runs once across repeated reads of the same day", async () => {
  const harness = createHarness([EVENT_A]);

  assert.deepEqual(await harness.cache.readUpcomingByDay("2026-07-12"), [EVENT_A]);
  assert.deepEqual(await harness.cache.readUpcomingByDay("2026-07-12"), [EVENT_A]);
  assert.deepEqual(await harness.cache.readUpcomingByDay("2026-07-12"), [EVENT_A]);
  assert.equal(harness.counts().listCalls, 1);
});

test("revalidating the events tag forces a re-query", async () => {
  const harness = createHarness([EVENT_A]);

  await harness.cache.readUpcomingByDay("2026-07-12");
  harness.revalidateTag(EVENTS_CACHE_TAG);
  await harness.cache.readUpcomingByDay("2026-07-12");
  assert.equal(harness.counts().listCalls, 2);
});

test("freshness: a feed change appears after the cron revalidate — and only then", async () => {
  const harness = createHarness([EVENT_A]);

  assert.deepEqual(await harness.cache.readUpcomingByDay("2026-07-12"), [EVENT_A]);

  // The feed changed (new event ingested) but no revalidate ran: the old set persists —
  // proving we don't cache-bust on every read.
  harness.setRows([EVENT_A, EVENT_B]);
  assert.deepEqual(await harness.cache.readUpcomingByDay("2026-07-12"), [EVENT_A]);

  // The cron's revalidateTag lands: the new event appears immediately.
  harness.revalidateTag(EVENTS_CACHE_TAG);
  assert.deepEqual(await harness.cache.readUpcomingByDay("2026-07-12"), [EVENT_A, EVENT_B]);
});

test("by-id reads cache per id and re-query after revalidate", async () => {
  const harness = createHarness([EVENT_A]);

  assert.deepEqual(await harness.cache.readById("a"), EVENT_A);
  assert.deepEqual(await harness.cache.readById("a"), EVENT_A);
  assert.equal(await harness.cache.readById("missing"), null);
  assert.equal(harness.counts().byIdCalls, 2);

  harness.revalidateTag(EVENTS_CACHE_TAG);
  await harness.cache.readById("a");
  assert.equal(harness.counts().byIdCalls, 3);
});

test("filterNotYetStarted replays the SQL per-view filter over day-cached rows", () => {
  const now = new Date("2026-07-12T20:00:00");
  const events: FakeEvent[] = [
    { id: "no-time", startsAt: null },
    { id: "started", startsAt: "2026-07-12T19:00:00" },
    { id: "starting-now", startsAt: "2026-07-12T20:00:00" },
    { id: "later", startsAt: "2026-07-12T21:00:00" },
    { id: "bad-date", startsAt: "not-a-date" },
  ];

  assert.deepEqual(
    filterNotYetStarted(events, now).map((event) => event.id),
    ["no-time", "starting-now", "later", "bad-date"]
  );
});

/* ---- Write-side wiring (source scan — lib/events.ts imports server-only) ---------------- */

const SIGNAL_WRITE_ROUTES = [
  "app/api/community/reactions/route.ts",
  "app/api/community/contributions/route.ts",
  "app/api/community/contributions/[id]/route.ts",
  "app/api/community/ticket-intents/route.ts",
  "app/api/discovery/event-action/route.ts",
  "app/api/admin/contributions/route.ts",
  "app/api/admin/shared-songs/route.ts",
  "app/api/me/circle-share/route.ts",
  "app/api/me/curator/route.ts",
  "app/api/admin/curators/route.ts",
];

test("every public-signal write route revalidates the event-signals tag", () => {
  for (const route of SIGNAL_WRITE_ROUTES) {
    const source = readFileSync(join(...route.split("/")), "utf8");
    assert.ok(
      source.includes("revalidateEventSignals(") || source.includes("revalidateEventReads("),
      `${route} must revalidate cached signals after a successful write`
    );
  }
});

test("the AVLgo cron revalidates the events tag after a sync", () => {
  const source = readFileSync(join("app", "api", "sync", "avlgo", "route.ts"), "utf8");
  assert.ok(source.includes("revalidateEventReads("), "avlgo sync must revalidate event reads");
});

test("the event read path routes through the tagged cache", () => {
  const events = readFileSync(join("lib", "events.ts"), "utf8");
  assert.ok(events.includes("createEventReadCache"), "lib/events.ts must wire the read cache");
  assert.ok(events.includes("unstable_cache"), "lib/events.ts must inject unstable_cache");

  const board = readFileSync(join("app", "page.tsx"), "utf8");
  assert.ok(board.includes("getPublicBoardSignals"), "board must read cached public signals");

  const detail = readFileSync(join("app", "event", "[id]", "page.tsx"), "utf8");
  assert.ok(detail.includes("getPublicEventContext"), "detail must read cached public context");
});
