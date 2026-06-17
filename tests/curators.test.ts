import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCuratorTopList,
  cleanBio,
  cleanDisplayName,
  isValidHandle,
  normalizeHandle,
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
