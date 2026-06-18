import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SETTABLE_SPOTIFY_ACCESS_STATUSES,
  isAdminSettableSpotifyAccessStatus,
  isOpenSpotifyAccessStatus,
  isTerminalSpotifyAccessStatus,
  normalizeSpotifyEmail,
  looksLikeEmail,
  SpotifyAccessRequestValidationError,
  validateSpotifyEmail,
} from "../lib/spotify-access-requests-core";

test("normalizeSpotifyEmail trims + lowercases (matches stored form)", () => {
  assert.equal(normalizeSpotifyEmail("  Brett@Example.COM "), "brett@example.com");
  assert.equal(normalizeSpotifyEmail(null), "");
  assert.equal(normalizeSpotifyEmail(undefined), "");
});

test("looksLikeEmail accepts a plausible address and rejects junk", () => {
  assert.equal(looksLikeEmail("you@example.com"), true);
  assert.equal(looksLikeEmail("nope"), false);
  assert.equal(looksLikeEmail("a@b"), false);
  assert.equal(looksLikeEmail("a b@c.com"), false);
});

test("validateSpotifyEmail returns the normalized email for a valid input", () => {
  assert.equal(validateSpotifyEmail("  Fan@Spotify.com "), "fan@spotify.com");
});

test("validateSpotifyEmail throws a validation error on empty/malformed input", () => {
  assert.throws(() => validateSpotifyEmail(""), SpotifyAccessRequestValidationError);
  assert.throws(() => validateSpotifyEmail("   "), SpotifyAccessRequestValidationError);
  assert.throws(() => validateSpotifyEmail("not-an-email"), SpotifyAccessRequestValidationError);
});

test("open statuses are pending + slot_added (the one-open-request set)", () => {
  assert.equal(isOpenSpotifyAccessStatus("pending"), true);
  assert.equal(isOpenSpotifyAccessStatus("slot_added"), true);
  assert.equal(isOpenSpotifyAccessStatus("approved"), false);
  assert.equal(isOpenSpotifyAccessStatus("rejected"), false);
});

test("terminal statuses are approved + rejected (they stamp resolved_at)", () => {
  assert.equal(isTerminalSpotifyAccessStatus("approved"), true);
  assert.equal(isTerminalSpotifyAccessStatus("rejected"), true);
  assert.equal(isTerminalSpotifyAccessStatus("pending"), false);
  assert.equal(isTerminalSpotifyAccessStatus("slot_added"), false);
});

test("admin may set slot_added/approved/rejected but never (re)set pending", () => {
  for (const status of ADMIN_SETTABLE_SPOTIFY_ACCESS_STATUSES) {
    assert.equal(isAdminSettableSpotifyAccessStatus(status), true);
  }
  assert.equal(isAdminSettableSpotifyAccessStatus("pending"), false);
  assert.equal(isAdminSettableSpotifyAccessStatus("bogus"), false);
});
