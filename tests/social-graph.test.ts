import assert from "node:assert/strict";
import test from "node:test";
import { canViewActivity, isSelfFollow } from "../lib/social-graph-core";

test("isSelfFollow rejects following yourself, ignores surrounding whitespace", () => {
  assert.equal(isSelfFollow("7", "7"), true);
  assert.equal(isSelfFollow(" 7 ", "7"), true);
  assert.equal(isSelfFollow("7", "8"), false);
});

test("canViewActivity requires BOTH an active edge AND the followee's sharing opt-in", () => {
  // The whole point of the gate: neither side alone is enough.
  assert.equal(canViewActivity({ hasActiveEdge: true, followeeSharesActivity: true }), true);
  assert.equal(canViewActivity({ hasActiveEdge: true, followeeSharesActivity: false }), false);
  assert.equal(canViewActivity({ hasActiveEdge: false, followeeSharesActivity: true }), false);
  assert.equal(canViewActivity({ hasActiveEdge: false, followeeSharesActivity: false }), false);
});

test("canViewActivity always lets a viewer see their own activity", () => {
  // Self is visible regardless of edge/sharing state.
  assert.equal(
    canViewActivity({ hasActiveEdge: false, followeeSharesActivity: false, isSelf: true }),
    true
  );
});

test("turning sharing off removes a previously-visible followee", () => {
  // A follows B with B sharing on → visible; B turns sharing off → no longer visible.
  assert.equal(canViewActivity({ hasActiveEdge: true, followeeSharesActivity: true }), true);
  assert.equal(canViewActivity({ hasActiveEdge: true, followeeSharesActivity: false }), false);
});

test("unfollowing removes visibility even when the followee still shares", () => {
  assert.equal(canViewActivity({ hasActiveEdge: true, followeeSharesActivity: true }), true);
  assert.equal(canViewActivity({ hasActiveEdge: false, followeeSharesActivity: true }), false);
});
