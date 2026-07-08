import assert from "node:assert/strict";
import test from "node:test";
import {
  isRateLimited,
  isSeatedTesterStatus,
  isTesterRequestStatus,
  looksLikeEmail,
  normalizeTesterEmail,
  normalizeTesterSource,
  pruneRateWindow,
  recordAttempt,
  resolveUpsertStatus,
  shouldNotifyOwner,
  TESTER_SEAT_BUDGET,
  TESTER_SEAT_WARNING_AT,
  TesterRequestValidationError,
  validateTesterEmail,
  validateTesterNote,
} from "../lib/tester-requests-core";
import {
  renderTesterInviteEmail,
  renderTesterRequestNotification,
} from "../lib/tester-request-emails";

test("normalizeTesterEmail trims + lowercases (BRett@X.com and brett@x.com are one row)", () => {
  assert.equal(normalizeTesterEmail("  BRett@X.com "), "brett@x.com");
  assert.equal(normalizeTesterEmail(null), "");
  assert.equal(normalizeTesterEmail(undefined), "");
});

test("looksLikeEmail accepts a plausible address and rejects junk", () => {
  assert.equal(looksLikeEmail("you@example.com"), true);
  assert.equal(looksLikeEmail("nope"), false);
  assert.equal(looksLikeEmail("a@b"), false);
  assert.equal(looksLikeEmail("a b@c.com"), false);
});

test("validateTesterEmail returns the normalized email; throws on empty/malformed", () => {
  assert.equal(validateTesterEmail("  Fan@Example.com "), "fan@example.com");
  assert.throws(() => validateTesterEmail(""), TesterRequestValidationError);
  assert.throws(() => validateTesterEmail("not-an-email"), TesterRequestValidationError);
});

test("validateTesterNote trims, nulls empties, and caps at 1,000 characters", () => {
  assert.equal(validateTesterNote("  loves bluegrass  "), "loves bluegrass");
  assert.equal(validateTesterNote(""), null);
  assert.equal(validateTesterNote("   "), null);
  assert.equal(validateTesterNote(undefined), null);
  assert.throws(() => validateTesterNote("x".repeat(1001)), TesterRequestValidationError);
});

test("normalizeTesterSource slugs the surface and degrades junk to 'direct'", () => {
  assert.equal(normalizeTesterSource("spotify-access-page"), "spotify-access-page");
  assert.equal(normalizeTesterSource("Sign-In Chooser!"), "sign-in-chooser");
  assert.equal(normalizeTesterSource(""), "direct");
  assert.equal(normalizeTesterSource(null), "direct");
  assert.equal(normalizeTesterSource("<script>"), "script");
});

test("status guards: lifecycle set and the seated (budget-counted) subset", () => {
  for (const status of ["pending", "approved", "declined", "invited"]) {
    assert.equal(isTesterRequestStatus(status), true);
  }
  assert.equal(isTesterRequestStatus("slot_added"), false);
  assert.equal(isSeatedTesterStatus("approved"), true);
  assert.equal(isSeatedTesterStatus("invited"), true);
  assert.equal(isSeatedTesterStatus("pending"), false);
  assert.equal(isSeatedTesterStatus("declined"), false);
});

test("upsert semantics: new applicant is pending; an existing status is never demoted", () => {
  assert.equal(resolveUpsertStatus(null), "pending");
  assert.equal(resolveUpsertStatus("invited"), "invited");
  assert.equal(resolveUpsertStatus("approved"), "approved");
  assert.equal(resolveUpsertStatus("declined"), "declined");
});

test("owner is notified exactly once per genuine new interest (created rows only)", () => {
  assert.equal(shouldNotifyOwner(true), true);
  assert.equal(shouldNotifyOwner(false), false);
});

test("seat budget constants match Spotify Development Mode (5, warn at 4)", () => {
  assert.equal(TESTER_SEAT_BUDGET, 5);
  assert.equal(TESTER_SEAT_WARNING_AT, 4);
});

test("rate window: prunes stale attempts, limits inside the window, records new attempts", () => {
  const windowMs = 10 * 60 * 1000;
  const now = 1_000_000_000;
  const stale = now - windowMs - 1;
  const fresh = now - 1000;

  assert.deepEqual(pruneRateWindow([stale, fresh], now, windowMs), [fresh]);
  assert.equal(isRateLimited([fresh, fresh, fresh], now, 3, windowMs), true);
  assert.equal(isRateLimited([stale, stale, stale], now, 3, windowMs), false);
  assert.deepEqual(recordAttempt([stale, fresh], now, windowMs), [fresh, now]);
});

test("owner notification renders subject/text with email, note, source, and the admin link", () => {
  const rendered = renderTesterRequestNotification({
    email: "fan@example.com",
    note: 'bluegrass & "outlaw" country',
    source: "spotify-access-page",
    pendingCount: 3,
    adminUrl: "https://avlmc.vercel.app/admin/spotify-access",
  });
  assert.equal(rendered.subject, "Spotify seat request: fan@example.com");
  assert.match(rendered.text, /fan@example\.com/);
  assert.match(rendered.text, /3 requests pending/);
  assert.match(rendered.text, /spotify-access-page/);
  assert.match(rendered.text, /admin\/spotify-access/);
  // The note is HTML-escaped in the HTML body (no raw quotes/angle brackets injected).
  assert.match(rendered.html, /&quot;outlaw&quot;/);
  assert.doesNotMatch(rendered.html, /"outlaw"/);
});

test("invite email links the sign-in URL and names the approved email", () => {
  const rendered = renderTesterInviteEmail({
    signInUrl: "https://avlmc.vercel.app/",
    email: "fan@example.com",
  });
  assert.match(rendered.subject, /Spotify seat/);
  assert.match(rendered.text, /https:\/\/avlmc\.vercel\.app\//);
  assert.match(rendered.text, /fan@example\.com/);
  assert.match(rendered.html, /Sign in with Spotify/);
});

test("invite email HTML escapes a hostile email address", () => {
  const rendered = renderTesterInviteEmail({
    signInUrl: "https://avlmc.vercel.app/",
    email: '<img src=x onerror=alert(1)>@x.com',
  });
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.match(rendered.html, /&lt;img/);
});
