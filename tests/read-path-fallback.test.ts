import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * PRD 50 / ADR 002 §2: no render path can trigger `syncUpcomingEvents()`. Ingest belongs to the
 * cron-gated /api/sync routes only — the old fallbacks meant an empty DB read or a bogus
 * `/event/<id>` loop ran a full scrape/normalize/ingest pass inside a render. lib/events.ts
 * imports server-only (via lib/db), so this guard is a source scan (the established pattern from
 * tests/spotify-gate.test.ts) rather than an import-and-spy test. Runs via tsx from the repo root.
 */

const SCAN_ROOTS = ["app", "components", "lib"];
const SYNC_CALL = /syncUpcomingEvents(Detailed|WithDuplicateAudit)?\s*\(/;

// The only places allowed to invoke the sync engine: its own module and the bearer-gated cron
// route. Everything else — pages, components, services — must read the DB or the seed fallback.
const ALLOWED_SYNC_CALLERS = new Set([
  join("lib", "events.ts"),
  join("app", "api", "sync", "avlgo", "route.ts"),
]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : listSourceFiles(full);
    }
    return /\.(ts|tsx|mts)$/.test(entry) ? [full] : [];
  });
}

test("only lib/events.ts and the cron route may call the sync engine", () => {
  const offenders = SCAN_ROOTS.flatMap(listSourceFiles).filter((file) => {
    if (ALLOWED_SYNC_CALLERS.has(file)) {
      return false;
    }
    return SYNC_CALL.test(readFileSync(file, "utf8"));
  });

  assert.deepEqual(
    offenders,
    [],
    `render-path files invoke syncUpcomingEvents*: ${offenders.join(", ")}`
  );
});

test("getUpcomingEvents falls back to seed, never a scrape", () => {
  const body = extractSection("export async function getUpcomingEvents");
  assert.ok(!/syncUpcomingEvents/.test(body), "getUpcomingEvents must not scrape");
  assert.ok(/getSeedFallbackEvents\(now\)/.test(body), "empty read must serve the seed fallback");
});

test("getEventById returns not-found for unknown ids, never a scrape", () => {
  const body = extractSection("export async function getEventById");
  assert.ok(!/syncUpcomingEvents/.test(body), "getEventById must not scrape");
  assert.ok(/getEventByIdFromDatabase\(id\)/.test(body), "lookup must be DB-only");
});

function extractSection(startMarker: string): string {
  const source = readFileSync(join("lib", "events.ts"), "utf8");
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} not found in lib/events.ts`);
  const end = source.indexOf("export ", start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}
