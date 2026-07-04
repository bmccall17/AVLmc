import assert from "node:assert/strict";
import test from "node:test";
import {
  artistNamesMatchExactly,
  decideArtistMatch,
  isPublishedArtistMatchStatus,
  isSafeSpotifyArtistId,
  normalizeArtistName,
  pickBestArtistMatch,
  spotifyArtistEmbedUrl,
  type SpotifyArtistCandidate,
} from "../lib/artist-match-core";

function candidate(id: string, name: string): SpotifyArtistCandidate {
  return { id, name, imageUrl: null };
}

test("normalizeArtistName folds case, diacritics, punctuation, and whitespace", () => {
  assert.equal(normalizeArtistName("Watchhouse"), "watchhouse");
  assert.equal(normalizeArtistName("  Watch  House "), "watch house");
  assert.equal(normalizeArtistName("Beyoncé"), "beyonce");
  assert.equal(normalizeArtistName("Sigur Rós"), "sigur ros");
  assert.equal(normalizeArtistName("AC/DC"), "ac dc");
  assert.equal(normalizeArtistName("Simon & Garfunkel"), "simon and garfunkel");
  assert.equal(normalizeArtistName("!!!"), "");
});

test("artistNamesMatchExactly compares normalized keys and rejects empties", () => {
  assert.ok(artistNamesMatchExactly("Beyoncé", "beyonce"));
  assert.ok(artistNamesMatchExactly("Watch House", "watchhouse") === false);
  assert.ok(artistNamesMatchExactly("", "") === false);
});

test("pickBestArtistMatch prefers an exact normalized match over the top hit", () => {
  const candidates = [
    candidate("top", "Watchhouse Tribute"),
    candidate("real", "Watchhouse"),
  ];
  // Case/whitespace-folded exact ("WATCHHOUSE" → "watchhouse") beats Spotify's top hit.
  assert.equal(pickBestArtistMatch(candidates, "WATCHHOUSE")?.id, "real");
});

test("pickBestArtistMatch falls back to the top hit and null when empty", () => {
  const candidates = [candidate("a", "Some Other Band"), candidate("b", "Another")];
  assert.equal(pickBestArtistMatch(candidates, "Nonexistent Act")?.id, "a");
  assert.equal(pickBestArtistMatch([], "Anyone"), null);
});

test("decideArtistMatch: exact → auto, fuzzy → needs_review, none → null", () => {
  const exact = decideArtistMatch([candidate("x", "Spoon")], "spoon");
  assert.equal(exact?.confidence, "exact");
  assert.equal(exact?.status, "auto");

  const fuzzy = decideArtistMatch([candidate("y", "Spoonful Tribute")], "Spoon");
  assert.equal(fuzzy?.confidence, "fuzzy");
  assert.equal(fuzzy?.status, "needs_review");

  assert.equal(decideArtistMatch([], "Spoon"), null);
});

test("isSafeSpotifyArtistId accepts base62 and rejects anything else", () => {
  assert.ok(isSafeSpotifyArtistId("675tsBPpaZtqyiBwEf3ZEP"));
  assert.ok(isSafeSpotifyArtistId("abc/../etc") === false);
  assert.ok(isSafeSpotifyArtistId("has space") === false);
  assert.ok(isSafeSpotifyArtistId("") === false);
  assert.ok(isSafeSpotifyArtistId('"><script>') === false);
});

test("isPublishedArtistMatchStatus only publishes auto/confirmed/replaced", () => {
  assert.ok(isPublishedArtistMatchStatus("auto"));
  assert.ok(isPublishedArtistMatchStatus("confirmed"));
  assert.ok(isPublishedArtistMatchStatus("replaced"));
  assert.ok(isPublishedArtistMatchStatus("needs_review") === false);
  assert.ok(isPublishedArtistMatchStatus("rejected") === false);
});

test("spotifyArtistEmbedUrl builds the canonical embed URL from a validated id", () => {
  assert.equal(
    spotifyArtistEmbedUrl("675tsBPpaZtqyiBwEf3ZEP"),
    "https://open.spotify.com/embed/artist/675tsBPpaZtqyiBwEf3ZEP?utm_source=generator"
  );
});
