import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  combineGateOutcomes,
  outcomeFromSpotifyAccessStatus,
  outcomeFromTesterStatus,
  resolveGateOutcome,
} from "../lib/spotify-gate-core";

/**
 * Spotify pre-redirect gate (PRD 43 / Phase 17): the pure outcome matrix, and the guard that
 * `signIn("spotify")` never reappears outside the chooser module (the bug class this epic exists
 * to kill — a direct call strands non-allowlisted users on Spotify's Development-Mode 403).
 * Runs via tsx from the repo root (like tests/system-registry.test.ts), so fs paths are stable.
 */

test("tester_requests statuses map to gate outcomes (seated = approved/invited)", () => {
  assert.equal(outcomeFromTesterStatus(null), "not_found");
  assert.equal(outcomeFromTesterStatus("pending"), "pending");
  assert.equal(outcomeFromTesterStatus("approved"), "allowed");
  assert.equal(outcomeFromTesterStatus("invited"), "allowed");
  assert.equal(outcomeFromTesterStatus("declined"), "declined");
});

test("spotify_access_requests statuses map to gate outcomes (seated = slot_added/approved)", () => {
  assert.equal(outcomeFromSpotifyAccessStatus(null), "not_found");
  assert.equal(outcomeFromSpotifyAccessStatus("pending"), "pending");
  assert.equal(outcomeFromSpotifyAccessStatus("slot_added"), "allowed");
  assert.equal(outcomeFromSpotifyAccessStatus("approved"), "allowed");
  assert.equal(outcomeFromSpotifyAccessStatus("rejected"), "declined");
});

test("combining outcomes is most-permissive-wins (both stores mirror ONE allowlist)", () => {
  assert.equal(combineGateOutcomes("allowed", "not_found"), "allowed");
  assert.equal(combineGateOutcomes("not_found", "allowed"), "allowed");
  assert.equal(combineGateOutcomes("pending", "declined"), "pending");
  assert.equal(combineGateOutcomes("declined", "not_found"), "declined");
  assert.equal(combineGateOutcomes("not_found", "not_found"), "not_found");
});

test("gate matrix: every status combination × flag on/off resolves correctly", () => {
  // Flag on: allowed for everyone, no matter what the stores say (or whether caller is known).
  for (const identified of [true, false]) {
    assert.equal(
      resolveGateOutcome({ openAccess: true, identified, testerStatus: null, accessStatus: null }),
      "allowed"
    );
    assert.equal(
      resolveGateOutcome({
        openAccess: true,
        identified,
        testerStatus: "declined",
        accessStatus: "rejected",
      }),
      "allowed"
    );
  }

  // Flag off, unidentified: the chooser asks for an email first.
  assert.equal(
    resolveGateOutcome({ openAccess: false, identified: false, testerStatus: null, accessStatus: null }),
    "email_required"
  );

  // Flag off, identified: the four core outcomes.
  assert.equal(
    resolveGateOutcome({ openAccess: false, identified: true, testerStatus: null, accessStatus: null }),
    "not_found"
  );
  assert.equal(
    resolveGateOutcome({
      openAccess: false,
      identified: true,
      testerStatus: "pending",
      accessStatus: null,
    }),
    "pending"
  );
  assert.equal(
    resolveGateOutcome({
      openAccess: false,
      identified: true,
      testerStatus: "declined",
      accessStatus: null,
    }),
    "declined"
  );
  assert.equal(
    resolveGateOutcome({
      openAccess: false,
      identified: true,
      testerStatus: "invited",
      accessStatus: null,
    }),
    "allowed"
  );
  // Cross-store: a PRD 36 slot_added rescues a tester_requests miss (and vice versa).
  assert.equal(
    resolveGateOutcome({
      openAccess: false,
      identified: true,
      testerStatus: null,
      accessStatus: "slot_added",
    }),
    "allowed"
  );
  assert.equal(
    resolveGateOutcome({
      openAccess: false,
      identified: true,
      testerStatus: "approved",
      accessStatus: "rejected",
    }),
    "allowed"
  );
});

test("guard: signIn(\"spotify\") appears only in components/SignInChooser.tsx", () => {
  const offenders: string[] = [];
  const roots = ["app", "components", "lib", "auth.ts"];

  const visit = (path: string) => {
    const stats = statSync(path);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        visit(join(path, entry));
      }
      return;
    }
    if (!/\.(ts|tsx)$/.test(path)) return;
    const source = readFileSync(path, "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      if (!line.includes('signIn("spotify"')) continue;
      // Comments may cite the call; only real invocations count.
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
      if (path.endsWith(join("components", "SignInChooser.tsx"))) continue;
      offenders.push(`${path}:${index + 1}`);
    }
  };

  for (const root of roots) {
    visit(root);
  }

  assert.deepEqual(
    offenders,
    [],
    `Direct signIn("spotify") outside the chooser module re-strands non-allowlisted users on ` +
      `Spotify's 403. Route these through SignInChooser/SpotifyGateButton instead:\n${offenders.join("\n")}`
  );
});
