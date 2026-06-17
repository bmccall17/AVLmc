import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCuratorTopList,
  canChangeHandle,
  canSelfManageCurator,
  isCuratorActivated,
  cleanApplicationNote,
  HANDLE_CHANGE_MIN_INTERVAL_MS,
  cleanAvatarUrl,
  cleanBio,
  cleanDisplayName,
  isSelfServeOpen,
  isValidHandle,
  normalizeHandle,
  CURATOR_SELF_SERVE_GATE,
  type CuratorPickInput,
} from "../lib/curators-core";

test("isValidHandle accepts URL-safe handles and rejects unsafe ones", () => {
  assert.equal(isValidHandle("maya"), true);
  assert.equal(isValidHandle("dj-nyla_99"), true);
  assert.equal(isValidHandle("MAYA"), true, "uppercase is normalized before validation");
  // Rejected: too short, path traversal, spaces, leading/trailing punctuation.
  assert.equal(isValidHandle("ab"), false);
  assert.equal(isValidHandle("../etc"), false);
  assert.equal(isValidHandle("has space"), false);
  assert.equal(isValidHandle("-leading"), false);
  assert.equal(isValidHandle("trailing-"), false);
});

test("normalizeHandle lowercases and trims", () => {
  assert.equal(normalizeHandle("  Maya  "), "maya");
});

test("cleanDisplayName falls back to the handle when blank", () => {
  assert.equal(cleanDisplayName("  ", "maya"), "maya");
  assert.equal(cleanDisplayName("Maya R.", "maya"), "Maya R.");
});

test("cleanBio returns null for blank and bounds length", () => {
  assert.equal(cleanBio("   "), null);
  assert.equal(cleanBio("hello"), "hello");
  assert.equal((cleanBio("x".repeat(1000)) ?? "").length, 600);
});

test("isSelfServeOpen is open only while strictly under BOTH limits (PRD 29 gate)", () => {
  const gate = { maxCurators: 25, maxUsers: 250 };
  // Well under both → instant promotion.
  assert.equal(isSelfServeOpen(0, 0, gate), true);
  assert.equal(isSelfServeOpen(24, 249, gate), true);
  // Hitting either limit closes the gate (>= is "crossed") → admin review.
  assert.equal(isSelfServeOpen(25, 249, gate), false, "at the curator limit, gate closes");
  assert.equal(isSelfServeOpen(24, 250, gate), false, "at the user limit, gate closes");
  assert.equal(isSelfServeOpen(100, 1000, gate), false);
  // Crossing one limit alone is enough to close it.
  assert.equal(isSelfServeOpen(26, 10, gate), false);
  assert.equal(isSelfServeOpen(1, 300, gate), false);
});

test("isSelfServeOpen uses the tunable default gate when none is passed", () => {
  assert.equal(isSelfServeOpen(0, 0), true);
  assert.equal(
    isSelfServeOpen(CURATOR_SELF_SERVE_GATE.maxCurators, 0),
    false,
    "default gate closes at its curator limit"
  );
  assert.equal(isSelfServeOpen(0, CURATOR_SELF_SERVE_GATE.maxUsers), false);
});

test("cleanApplicationNote returns null for blank and bounds length (mirrors cleanBio)", () => {
  assert.equal(cleanApplicationNote(null), null);
  assert.equal(cleanApplicationNote("   "), null);
  assert.equal(cleanApplicationNote("  I run a local indie blog.  "), "I run a local indie blog.");
  assert.equal((cleanApplicationNote("x".repeat(1000)) ?? "").length, 600);
});

test("cleanAvatarUrl keeps only bounded https URLs and rejects unsafe schemes", () => {
  assert.equal(cleanAvatarUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
  assert.equal(cleanAvatarUrl("  https://example.com/x.jpg  "), "https://example.com/x.jpg");
  assert.equal(cleanAvatarUrl(""), null);
  assert.equal(cleanAvatarUrl(null), null);
  assert.equal(cleanAvatarUrl("http://example.com/x.png"), null, "http is rejected");
  assert.equal(cleanAvatarUrl("javascript:alert(1)"), null);
  assert.equal(cleanAvatarUrl("data:image/png;base64,AAAA"), null);
  assert.equal(cleanAvatarUrl("not a url"), null);
});

test("canSelfManageCurator allows only an active row (admin moderation overrides)", () => {
  assert.equal(canSelfManageCurator("active"), true);
  assert.equal(canSelfManageCurator("hidden"), false, "an admin-hidden curator can't self-manage");
  assert.equal(canSelfManageCurator("pending"), false);
  assert.equal(canSelfManageCurator("rejected"), false);
});

test("isCuratorActivated is true only with at least one visible pick (PRD 32)", () => {
  assert.equal(isCuratorActivated(0), false);
  assert.equal(isCuratorActivated(1), true);
  assert.equal(isCuratorActivated(5), true);
});

test("canChangeHandle rate-limits handle changes to once per window (PRD 33)", () => {
  const now = new Date("2026-06-17T12:00:00.000Z");
  // Never changed → allowed.
  assert.equal(canChangeHandle(null, now), true);
  assert.equal(canChangeHandle("not-a-date", now), true);
  // Just changed → blocked.
  assert.equal(canChangeHandle(now, now), false);
  assert.equal(
    canChangeHandle(new Date(now.getTime() - HANDLE_CHANGE_MIN_INTERVAL_MS + 1000), now),
    false,
    "within the window, blocked"
  );
  // Past the window → allowed.
  assert.equal(
    canChangeHandle(new Date(now.getTime() - HANDLE_CHANGE_MIN_INTERVAL_MS - 1000), now),
    true
  );
});

test("buildCuratorTopList ranks most-picked artists/venues/genres, skips blanks", () => {
  const picks: CuratorPickInput[] = [
    { eventId: "1", eventTitle: "A", artistName: "Nyla", venueName: "Grey Eagle", tags: ["indie", "rock"], note: null },
    { eventId: "2", eventTitle: "B", artistName: "Nyla", venueName: "Orange Peel", tags: ["indie"], note: null },
    { eventId: "3", eventTitle: "C", artistName: "", venueName: null, tags: [], note: null },
  ];

  const top = buildCuratorTopList(picks);
  const artist = top.find((entry) => entry.kind === "artist");
  const genre = top.filter((entry) => entry.kind === "genre");

  assert.equal(artist?.label, "Nyla");
  assert.equal(artist?.count, 2);
  // "indie" appears twice, "rock" once → indie ranks first.
  assert.equal(genre[0].label, "indie");
  assert.equal(genre[0].count, 2);
  // Blank artist/venue contributed nothing.
  assert.ok(!top.some((entry) => entry.label === ""));
});
