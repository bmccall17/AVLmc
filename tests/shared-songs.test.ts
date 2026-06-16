import assert from "node:assert/strict";
import test from "node:test";
import {
  computeViewerOverlap,
  mapArtistTopTracksToSeeds,
  spotifyEmbedUrl,
  toPublicSharedSong,
  type SharedSong,
} from "../lib/shared-songs-core";

function track(id: string, name: string, artist: string) {
  return {
    providerItemId: id,
    name,
    artistNames: [artist],
    externalUrl: `https://open.spotify.com/track/${id}`,
    imageUrl: `https://i.scdn.co/${id}.jpg`,
    previewUrl: null,
  };
}

test("mapArtistTopTracksToSeeds dedupes by track id and caps at 10", () => {
  const tracks = [
    track("a", "Song A", "Nyla"),
    track("a", "Song A dupe", "Nyla"),
    ...Array.from({ length: 12 }, (_, i) => track(`t${i}`, `Track ${i}`, "Nyla")),
  ];

  const seeds = mapArtistTopTracksToSeeds(tracks);

  assert.equal(seeds.length, 10);
  const ids = seeds.map((seed) => seed.providerTrackId);
  assert.equal(new Set(ids).size, ids.length, "no duplicate track ids");
  assert.equal(ids[0], "a", "keeps first occurrence of a duplicate");
});

test("mapArtistTopTracksToSeeds skips tracks with no id or name", () => {
  const seeds = mapArtistTopTracksToSeeds([
    { ...track("", "No Id", "Nyla") },
    { ...track("b", "", "Nyla") },
    track("c", "Good", "Nyla"),
  ]);

  assert.deepEqual(
    seeds.map((seed) => seed.providerTrackId),
    ["c"]
  );
});

test("computeViewerOverlap matches by track id", () => {
  const songs = [
    { providerTrackId: "x", name: "Echoes", artistNames: ["Nyla"] },
    { providerTrackId: "y", name: "Drift", artistNames: ["Nyla"] },
  ];
  const viewer = [{ providerItemId: "y", name: "Drift", artistNames: ["Nyla"] }];

  const overlap = computeViewerOverlap(songs, viewer);

  assert.ok(overlap.has("y"));
  assert.ok(!overlap.has("x"));
});

test("computeViewerOverlap falls back to normalized name + artist", () => {
  const songs = [{ providerTrackId: "x", name: "Echoes", artistNames: ["Nyla"] }];
  // Different Spotify id (e.g. a different release) but same song.
  const viewer = [{ providerItemId: "different-id", name: "  echoes ", artistNames: ["NYLA"] }];

  const overlap = computeViewerOverlap(songs, viewer);

  assert.ok(overlap.has("x"), "matched on normalized name+artist despite a different id");
});

test("computeViewerOverlap returns empty when there is no viewer taste", () => {
  const songs = [{ providerTrackId: "x", name: "Echoes", artistNames: ["Nyla"] }];
  assert.equal(computeViewerOverlap(songs, []).size, 0);
});

test("toPublicSharedSong drops status, adds embed url and the love badge", () => {
  const song: SharedSong = {
    id: "row-1",
    eventId: "evt-1",
    provider: "spotify",
    providerTrackId: "x",
    name: "Echoes",
    artistNames: ["Nyla"],
    externalUrl: "https://open.spotify.com/track/x",
    imageUrl: null,
    previewUrl: null,
    shareCount: 3,
    status: "visible",
  };

  const publicSong = toPublicSharedSong(song, new Set(["x"]));

  assert.equal(publicSong.embedUrl, spotifyEmbedUrl("x"));
  assert.equal(publicSong.youAlreadyLove, true);
  assert.ok(!("status" in publicSong), "status is never exposed publicly");
  assert.ok(!("seededByUserId" in publicSong), "seeder identity is never present");
});

test("spotifyEmbedUrl encodes the track id", () => {
  assert.equal(spotifyEmbedUrl("abc123"), "https://open.spotify.com/embed/track/abc123");
});
