import assert from "node:assert/strict";
import test from "node:test";
import {
  SpotifyReconnectRequiredError,
  isSpotifyReconnectRequiredError,
  isUnrecoverableRefreshResponse,
} from "../lib/spotify-reconnect";

/**
 * Spotify refresh-token durability: classifying a failed token refresh as unrecoverable (the refresh
 * token is dead — Spotify's 6-month lifetime, revocation, or a rotated secret → must re-authorize)
 * vs. a transient/other failure worth retrying. Runs via tsx from the repo root (like
 * tests/spotify-gate.test.ts). This is the guard against a stale connection surfacing as a dead-end
 * "Could not refresh" instead of a clean Reconnect Spotify prompt.
 */

test("invalid_grant on a 400 is unrecoverable (needs reconnect)", () => {
  assert.equal(isUnrecoverableRefreshResponse(400, '{"error":"invalid_grant"}'), true);
  assert.equal(
    isUnrecoverableRefreshResponse(400, '{"error":"invalid_grant","error_description":"Refresh token revoked"}'),
    true
  );
});

test("invalid_grant on a 401 is also treated as unrecoverable", () => {
  assert.equal(isUnrecoverableRefreshResponse(401, '{"error":"invalid_grant"}'), true);
});

test("invalid_client (bad app creds) is NOT a per-user reconnect", () => {
  assert.equal(isUnrecoverableRefreshResponse(400, '{"error":"invalid_client"}'), false);
});

test("server/transient failures are recoverable, not reconnect", () => {
  assert.equal(isUnrecoverableRefreshResponse(500, '{"error":"server_error"}'), false);
  assert.equal(isUnrecoverableRefreshResponse(503, "Service Unavailable"), false);
  assert.equal(isUnrecoverableRefreshResponse(429, '{"error":"rate_limited"}'), false);
});

test("malformed/non-JSON bodies are classified by substring, never throw", () => {
  assert.equal(isUnrecoverableRefreshResponse(400, "error=invalid_grant&foo=bar"), true);
  assert.equal(isUnrecoverableRefreshResponse(400, "totally not json"), false);
  assert.equal(isUnrecoverableRefreshResponse(400, ""), false);
});

test("SpotifyReconnectRequiredError carries the code/status and is detectable across module copies", () => {
  const error = new SpotifyReconnectRequiredError();
  assert.equal(error.code, "spotify_reconnect_required");
  assert.equal(error.status, 409);
  assert.equal(isSpotifyReconnectRequiredError(error), true);
  // Duck-typed detection (survives serialization / separate class identity).
  assert.equal(isSpotifyReconnectRequiredError({ code: "spotify_reconnect_required" }), true);
  assert.equal(isSpotifyReconnectRequiredError(new Error("nope")), false);
});
