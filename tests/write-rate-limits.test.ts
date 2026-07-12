import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createWriteRateLimiter,
  getClientIp,
  honeypotTripped,
} from "../lib/write-rate-limit";

/**
 * PRD 52 — shared sliding-window limiter for the public write routes. Pure-node: injected `now`,
 * `reset()` between cases, no next/server. The source scan at the bottom regression-locks the
 * wiring the same way tests/events-cache.test.ts locks the revalidate calls.
 */

const WINDOW_MS = 10 * 60 * 1000;

test("the Nth write within the window is limited; the N-1 before it are not", () => {
  const limiter = createWriteRateLimiter({ route: "t-nth", maxPerIp: 5 });
  limiter.reset();
  const now = 1_000_000;

  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.check({ ip: "1.2.3.4", now: now + i }), false, `attempt ${i + 1} allowed`);
  }
  assert.equal(limiter.check({ ip: "1.2.3.4", now: now + 5 }), true, "6th attempt limited");
});

test("the window slides: an attempt after windowMs succeeds again", () => {
  const limiter = createWriteRateLimiter({ route: "t-window", maxPerIp: 2 });
  limiter.reset();
  const now = 1_000_000;

  assert.equal(limiter.check({ ip: "ip", now }), false);
  assert.equal(limiter.check({ ip: "ip", now: now + 1 }), false);
  assert.equal(limiter.check({ ip: "ip", now: now + 2 }), true, "limited inside the window");
  assert.equal(limiter.check({ ip: "ip", now: now + WINDOW_MS + 1 }), false, "allowed after expiry");
});

test("routes are isolated: exhausting one route leaves another unlimited for the same IP", () => {
  const a = createWriteRateLimiter({ route: "t-iso-a", maxPerIp: 1 });
  const b = createWriteRateLimiter({ route: "t-iso-b", maxPerIp: 1 });
  a.reset();
  b.reset();
  const now = 1_000_000;

  assert.equal(a.check({ ip: "9.9.9.9", now }), false);
  assert.equal(a.check({ ip: "9.9.9.9", now: now + 1 }), true, "route A limited");
  assert.equal(b.check({ ip: "9.9.9.9", now: now + 2 }), false, "route B unaffected");
});

test("rotating the identity (cleared cookie) does not reset the IP dimension", () => {
  // The PRD-named contributions case: same IP, fresh session id per request.
  const limiter = createWriteRateLimiter({ route: "t-cookie", maxPerIp: 5, maxPerIdentity: 5 });
  limiter.reset();
  const now = 1_000_000;

  for (let i = 0; i < 5; i++) {
    assert.equal(
      limiter.check({ ip: "5.5.5.5", identity: `fresh-session-${i}`, now: now + i }),
      false
    );
  }
  assert.equal(
    limiter.check({ ip: "5.5.5.5", identity: "fresh-session-6", now: now + 5 }),
    true,
    "6th attempt limited by IP despite a brand-new session id"
  );
});

test("the identity dimension limits the same identity across different IPs", () => {
  const limiter = createWriteRateLimiter({ route: "t-identity", maxPerIp: 100, maxPerIdentity: 3 });
  limiter.reset();
  const now = 1_000_000;

  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.check({ ip: `10.0.0.${i}`, identity: "user-1", now: now + i }), false);
  }
  assert.equal(
    limiter.check({ ip: "10.0.0.99", identity: "user-1", now: now + 3 }),
    true,
    "4th attempt limited by identity despite a fresh IP"
  );
});

test("a limited attempt is not recorded against the other dimension", () => {
  const limiter = createWriteRateLimiter({ route: "t-norecord", maxPerIp: 1, maxPerIdentity: 5 });
  limiter.reset();
  const now = 1_000_000;

  assert.equal(limiter.check({ ip: "ip-a", identity: "id-1", now }), false);
  // IP-limited attempts spam the identity window…
  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.check({ ip: "ip-a", identity: "id-1", now: now + 1 + i }), true);
  }
  // …but the identity window only holds the one recorded attempt, so a new IP is fine.
  assert.equal(limiter.check({ ip: "ip-b", identity: "id-1", now: now + 20 }), false);
});

test("getClientIp takes the first x-forwarded-for hop, trimmed; unknown without one", () => {
  const withHeader = new Request("https://example.test/api", {
    headers: { "x-forwarded-for": " 203.0.113.7 , 198.51.100.1" },
  });
  assert.equal(getClientIp(withHeader), "203.0.113.7");

  const withoutHeader = new Request("https://example.test/api");
  assert.equal(getClientIp(withoutHeader), "unknown");
});

test("honeypotTripped only trips on a non-empty string", () => {
  assert.equal(honeypotTripped("http://spam.example"), true);
  assert.equal(honeypotTripped("  x  "), true);
  assert.equal(honeypotTripped(""), false);
  assert.equal(honeypotTripped("   "), false);
  assert.equal(honeypotTripped(undefined), false);
  assert.equal(honeypotTripped(null), false);
  assert.equal(honeypotTripped(42), false);
});

/* ---- Wiring (source scan — routes import next/server) ------------------------------------ */

const LIMITED_WRITE_ROUTES = [
  "app/api/feedback/route.ts",
  "app/api/community/reactions/route.ts",
  "app/api/community/contributions/route.ts",
  "app/api/community/ticket-intents/route.ts",
  "app/api/discovery/event-action/route.ts",
  "app/api/discovery/spotify-match-correction/route.ts",
  "app/api/me/avatar/route.ts",
];

test("every public write route wires the shared limiter", () => {
  for (const route of LIMITED_WRITE_ROUTES) {
    const source = readFileSync(join(...route.split("/")), "utf8");
    assert.ok(
      source.includes("createWriteRateLimiter("),
      `${route} must create a write rate limiter`
    );
    assert.ok(source.includes("limiter.check("), `${route} must check the limiter`);
    assert.ok(source.includes("429"), `${route} must return 429 when limited`);
  }
});

test("feedback carries the website honeypot", () => {
  const route = readFileSync(join("app", "api", "feedback", "route.ts"), "utf8");
  assert.ok(route.includes("honeypotTripped("), "route must check the honeypot");

  const form = readFileSync(join("components", "FeedbackForm.tsx"), "utf8");
  assert.ok(form.includes('name="website"'), "form must render the hidden website field");
});
