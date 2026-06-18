import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_FAILURES,
  resolveAuthFailure,
  type AuthFailureCode,
} from "../lib/auth-failures";

const NAMED_CODES: AuthFailureCode[] = [
  "spotify_limited_beta",
  "access_denied",
  "duplicate_account",
  "redirect_loop",
  "stale_session",
  "browser_fallback",
];

test("every named failure has a title, message, and exactly one primary action", () => {
  for (const code of NAMED_CODES) {
    const entry = AUTH_FAILURES[code];
    assert.equal(entry.code, code);
    assert.ok(entry.title.length > 0, `${code} has a title`);
    assert.ok(entry.message.length > 0, `${code} has a message`);
    assert.ok(entry.action && entry.action.label.length > 0, `${code} has one primary action`);
  }
});

test("resolveAuthFailure maps Auth.js error params to the right entry", () => {
  assert.equal(resolveAuthFailure("AccessDenied").code, "access_denied");
  assert.equal(resolveAuthFailure("OAuthAccountNotLinked").code, "duplicate_account");
  assert.equal(resolveAuthFailure("SessionRequired").code, "stale_session");
  assert.equal(resolveAuthFailure("OAuthCallbackError").code, "spotify_limited_beta");
});

test("resolveAuthFailure accepts our own taxonomy codes (case-insensitive)", () => {
  assert.equal(resolveAuthFailure("spotify_limited_beta").code, "spotify_limited_beta");
  assert.equal(resolveAuthFailure("SPOTIFY_LIMITED_BETA_ACCESS").code, "spotify_limited_beta");
  assert.equal(resolveAuthFailure("browser_fallback").code, "browser_fallback");
  assert.equal(resolveAuthFailure("redirect_loop").code, "redirect_loop");
});

test("unknown / missing input degrades to the honest `unknown` entry, never a dead-end", () => {
  assert.equal(resolveAuthFailure(null).code, "unknown");
  assert.equal(resolveAuthFailure(undefined).code, "unknown");
  assert.equal(resolveAuthFailure("").code, "unknown");
  assert.equal(resolveAuthFailure("something-weird").code, "unknown");
  assert.ok(AUTH_FAILURES.unknown.action.label.length > 0);
});

test("the duplicate-account path routes to authenticated linking, never a silent merge", () => {
  const entry = AUTH_FAILURES.duplicate_account;
  assert.equal(entry.severity, "conflict");
  assert.equal(entry.action.kind, "sign_in_then_link");
  // No "merge anyway" shortcut anywhere on the entry.
  const labels = [entry.action.label, entry.secondaryAction?.label ?? ""].join(" ").toLowerCase();
  assert.ok(!labels.includes("merge"), "no merge action is offered");
});

test("severities distinguish limitation vs. error vs. conflict", () => {
  assert.equal(AUTH_FAILURES.spotify_limited_beta.severity, "limitation");
  assert.equal(AUTH_FAILURES.access_denied.severity, "error");
  assert.equal(AUTH_FAILURES.duplicate_account.severity, "conflict");
});
