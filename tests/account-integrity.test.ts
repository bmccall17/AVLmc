import assert from "node:assert/strict";
import test from "node:test";
import {
  checkAccountIntegrity,
  type AccountSnapshot,
  type IntegrityExpectation,
} from "../lib/account-integrity";

// A healthy post-linking snapshot: one user, two providers, two emails (one primary), data attached.
function healthySnapshot(): AccountSnapshot {
  return {
    users: [{ id: "7" }],
    accounts: [
      { userId: "7", provider: "resend" },
      { userId: "7", provider: "spotify" },
    ],
    userEmails: [
      { userId: "7", email: "fan@example.com", isPrimary: true },
      { userId: "7", email: "Fan@Spotify.com", isPrimary: false },
    ],
    ownedData: [
      { table: "music_connections", userId: "7" },
      { table: "listener_follows", userId: "7" },
      { table: "saved_items", userId: "7" },
    ],
  };
}

const expectation: IntegrityExpectation = {
  userId: "7",
  providers: ["resend", "spotify"],
  emails: ["fan@example.com", "fan@spotify.com"],
};

test("a healthy linked account passes every no-reset invariant", () => {
  const result = checkAccountIntegrity(healthySnapshot(), expectation);
  assert.deepEqual(result, { ok: true, violations: [] });
});

test("a forked second users row is caught", () => {
  const snapshot = healthySnapshot();
  snapshot.users.push({ id: "9" });
  const result = checkAccountIntegrity(snapshot, expectation);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("exactly one users row")));
});

test("a re-keyed/orphaned owned-data row is caught", () => {
  const snapshot = healthySnapshot();
  snapshot.ownedData.push({ table: "listener_discovery_preferences", userId: "9" });
  const result = checkAccountIntegrity(snapshot, expectation);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("re-keyed/orphaned")));
});

test("a missing linked provider is caught", () => {
  const snapshot = healthySnapshot();
  snapshot.accounts = snapshot.accounts.filter((a) => a.provider !== "spotify");
  const result = checkAccountIntegrity(snapshot, expectation);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes('provider "spotify" is not linked')));
});

test("the secondary (Spotify-sourced) email must be associated with the same account", () => {
  const snapshot = healthySnapshot();
  snapshot.userEmails = snapshot.userEmails.filter((e) => !e.email.toLowerCase().includes("spotify"));
  const result = checkAccountIntegrity(snapshot, expectation);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("fan@spotify.com")));
});

test("more than one primary email is caught", () => {
  const snapshot = healthySnapshot();
  snapshot.userEmails[1].isPrimary = true;
  const result = checkAccountIntegrity(snapshot, expectation);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("exactly one primary email")));
});

test("a duplicate lower(email) across accounts is caught (one email = one account)", () => {
  const snapshot = healthySnapshot();
  // Same email appearing twice — must never resolve to more than one account.
  snapshot.userEmails.push({ userId: "7", email: "FAN@example.com", isPrimary: false });
  const result = checkAccountIntegrity(snapshot, expectation);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.includes("duplicate lower(email)")));
});
