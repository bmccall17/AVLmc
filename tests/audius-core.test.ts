import assert from "node:assert/strict";
import test from "node:test";
import {
  audiusPermalinkUrl,
  audiusStreamPath,
  isConfidentAudiusMatch,
  isSafeAudiusStreamUrl,
  isSafeAudiusTrackId,
  pickBestAudiusTrack,
  scoreArtistNameMatch,
  type AudiusTrackCandidate,
} from "../lib/audius-core";

function candidate(over: Partial<AudiusTrackCandidate>): AudiusTrackCandidate {
  return {
    id: "7eP5n",
    title: "A Song",
    artistName: "Hiss Golden Messenger",
    artistHandle: "hgm",
    permalink: "/hgm/a-song",
    playCount: 100,
    favoriteCount: 10,
    isStreamable: true,
    durationSec: 200,
    artworkUrl: null,
    ...over,
  };
}

test("scoreArtistNameMatch folds case/diacritics/punctuation to an exact match", () => {
  const result = scoreArtistNameMatch("Hiss Golden Messenger", "hiss  golden-messenger");
  assert.equal(result.confidence, "exact");
  assert.equal(result.score, 1);
});

test("scoreArtistNameMatch marks full query-word coverage as strong", () => {
  // Every query word ("hiss golden messenger") appears in the candidate.
  const result = scoreArtistNameMatch("Hiss Golden Messenger", "Hiss Golden Messenger (Live)");
  assert.equal(result.confidence, "strong");
  assert.ok(result.score > 0 && result.score < 1);
});

test("scoreArtistNameMatch marks partial overlap as weak and no overlap as none", () => {
  assert.equal(scoreArtistNameMatch("Hiss Golden Messenger", "Golden Retrievers").confidence, "weak");
  assert.equal(scoreArtistNameMatch("Hiss Golden Messenger", "The Beatles").confidence, "none");
});

test("pickBestAudiusTrack prefers exact over strong over weak", () => {
  const best = pickBestAudiusTrack("Hiss Golden Messenger", [
    candidate({ id: "weak1", artistName: "Golden Hour", playCount: 999999 }),
    candidate({ id: "strong1", artistName: "Hiss Golden Messenger Trio" }),
    candidate({ id: "exact1", artistName: "Hiss Golden Messenger" }),
  ]);
  assert.ok(best);
  assert.equal(best?.track.id, "exact1");
  assert.equal(best?.confidence, "exact");
});

test("pickBestAudiusTrack breaks confidence+score ties by popularity", () => {
  const best = pickBestAudiusTrack("Hiss Golden Messenger", [
    candidate({ id: "quiet", playCount: 10, favoriteCount: 1 }),
    candidate({ id: "loud", playCount: 5000, favoriteCount: 40 }),
  ]);
  assert.equal(best?.track.id, "loud");
});

test("pickBestAudiusTrack skips non-streamable tracks", () => {
  const best = pickBestAudiusTrack("Hiss Golden Messenger", [
    candidate({ id: "dead", isStreamable: false, playCount: 999999 }),
    candidate({ id: "live", playCount: 5 }),
  ]);
  assert.equal(best?.track.id, "live");
});

test("pickBestAudiusTrack returns null when nothing shares a word (fallback state)", () => {
  const best = pickBestAudiusTrack("Hiss Golden Messenger", [
    candidate({ id: "x", artistName: "Daft Punk" }),
    candidate({ id: "y", artistName: "Radiohead" }),
  ]);
  assert.equal(best, null);
});

test("isConfidentAudiusMatch trusts exact/strong only", () => {
  assert.ok(isConfidentAudiusMatch({ track: candidate({}), confidence: "exact", score: 1 }));
  assert.ok(isConfidentAudiusMatch({ track: candidate({}), confidence: "strong", score: 0.7 }));
  assert.equal(isConfidentAudiusMatch({ track: candidate({}), confidence: "weak", score: 0.3 }), false);
  assert.equal(isConfidentAudiusMatch(null), false);
});

test("isSafeAudiusTrackId only accepts short base62 ids", () => {
  assert.ok(isSafeAudiusTrackId("7eP5n"));
  assert.equal(isSafeAudiusTrackId("has/slash"), false);
  assert.equal(isSafeAudiusTrackId(""), false);
  assert.equal(isSafeAudiusTrackId("a".repeat(40)), false);
});

test("isSafeAudiusStreamUrl pins https + the /v1/tracks/<id>/stream shape", () => {
  assert.ok(isSafeAudiusStreamUrl("https://dn1.example.com/v1/tracks/7eP5n/stream?app_name=x"));
  // wrong scheme
  assert.equal(isSafeAudiusStreamUrl("http://dn1.example.com/v1/tracks/7eP5n/stream"), false);
  // wrong path
  assert.equal(isSafeAudiusStreamUrl("https://dn1.example.com/v1/users/7eP5n/stream"), false);
  // path escape / bad id
  assert.equal(isSafeAudiusStreamUrl("https://dn1.example.com/v1/tracks/..%2f..%2fx/stream"), false);
  assert.equal(isSafeAudiusStreamUrl(null), false);
  assert.equal(isSafeAudiusStreamUrl("not a url"), false);
});

test("audiusStreamPath encodes the id into the canonical path", () => {
  assert.equal(audiusStreamPath("7eP5n"), "/v1/tracks/7eP5n/stream");
});

test("audiusPermalinkUrl resolves only to audius.co, rejecting off-origin tampering", () => {
  assert.equal(audiusPermalinkUrl("/hgm/a-song"), "https://audius.co/hgm/a-song");
  assert.equal(audiusPermalinkUrl("//evil.com/x"), null);
  assert.equal(audiusPermalinkUrl("https://evil.com/x"), null);
  assert.equal(audiusPermalinkUrl(null), null);
});
