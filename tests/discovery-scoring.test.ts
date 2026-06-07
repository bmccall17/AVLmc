import assert from "node:assert/strict";
import test from "node:test";
import { scoreDiscoveryEvents, type DiscoveryReason } from "../lib/discovery";
import type { SpotifyMatchCorrection } from "../lib/discovery-memory";
import type { EventRecord } from "../lib/events";
import type { MusicConnection, MusicProfileItem } from "../lib/music";

const connectedSpotify = {
  connectedAt: "2026-06-01T00:00:00.000Z",
  disconnectedAt: null,
  lastSyncedAt: "2026-06-01T00:00:00.000Z",
  provider: "spotify",
  scopes: [],
  tasteOptOutAt: null,
} satisfies MusicConnection;

const elizaProfileItem = {
  artistNames: [],
  externalUrl: "https://open.spotify.com/artist/eliza",
  id: "profile-eliza",
  imageUrl: null,
  itemType: "top_artist",
  name: "ELIZA",
  provider: "spotify",
  providerItemId: "spotify-eliza",
  rank: 1,
  syncedAt: "2026-06-01T00:00:00.000Z",
  timeRange: "medium_term",
} satisfies MusicProfileItem;

const francesElizaEvent = {
  artistName: "Frances Eliza",
  avlgoEventId: "frances-eliza-avlgo",
  createdAt: "2026-06-01T00:00:00.000Z",
  eventDate: "2026-06-27",
  eventTime: "6:00 PM",
  eventTitle: "Frances Eliza",
  eventUrl: "https://www.avlgo.com/events/frances-eliza",
  id: "frances-eliza-event",
  imageUrl: null,
  source: "AVLgo live feed: TEST",
  startsAt: "2026-06-27T22:00:00.000Z",
  tags: ["Live Music", "Folk Storytelling"],
  updatedAt: "2026-06-01T00:00:00.000Z",
  venueName: "The One Stop at Asheville Music Hall",
} satisfies EventRecord;

test("Spotify artist matches expose exact ELIZA versus Frances Eliza metadata", () => {
  const score = scoreFrancesEliza();
  const spotifyReason = getSpotifyReason(score.reasons);

  assert.equal(score.spotifyMatched, true);
  assert.ok(score.bestMatchScore > score.bestBetsScore);
  assert.equal(spotifyReason.label, "Spotify artist match");
  assert.equal(spotifyReason.detail.sourceName, "ELIZA");
  assert.equal(spotifyReason.detail.matchedTerm, "ELIZA");
  assert.equal(spotifyReason.detail.normalizedTerm, "eliza");
  assert.equal(spotifyReason.detail.field, "artist");
  assert.equal(spotifyReason.detail.matchedText, "Frances Eliza");
});

test("rejected Spotify artist match is suppressed for that event and term", () => {
  const score = scoreFrancesEliza([
    {
      action: "reject",
      eventId: francesElizaEvent.id,
      matchedTerm: "ELIZA",
      normalizedTerm: "eliza",
      replacementImageUrl: null,
      replacementName: null,
      replacementProviderItemId: null,
      replacementUrl: null,
    },
  ]);

  assert.equal(score.spotifyMatched, false);
  assert.equal(score.bestMatchScore, score.bestBetsScore);
  assert.equal(score.reasons.some((reason) => reason.kind === "spotify_artist"), false);
});

test("replacement Spotify artist match keeps the original logic but displays the correction", () => {
  const score = scoreFrancesEliza([
    {
      action: "replace",
      eventId: francesElizaEvent.id,
      matchedTerm: "ELIZA",
      normalizedTerm: "eliza",
      replacementImageUrl: null,
      replacementName: "Frances Eliza",
      replacementProviderItemId: "spotify-frances-eliza",
      replacementUrl: "https://open.spotify.com/artist/frances-eliza",
    },
  ]);
  const spotifyReason = getSpotifyReason(score.reasons);

  assert.equal(score.spotifyMatched, true);
  assert.equal(spotifyReason.label, "corrected Spotify artist");
  assert.equal(spotifyReason.detail.source, "correction");
  assert.equal(spotifyReason.detail.sourceName, "ELIZA");
  assert.equal(spotifyReason.detail.matchedTerm, "Frances Eliza");
  assert.equal(spotifyReason.detail.normalizedTerm, "eliza");
});

function scoreFrancesEliza(spotifyMatchCorrections: SpotifyMatchCorrection[] = []) {
  return scoreDiscoveryEvents({
    connections: [connectedSpotify],
    counts: {},
    events: [francesElizaEvent],
    now: new Date("2026-06-07T12:00:00.000Z"),
    profileItems: [elizaProfileItem],
    spotifyMatchCorrections,
  })[francesElizaEvent.id];
}

function getSpotifyReason(reasons: DiscoveryReason[]) {
  const reason = reasons.find((candidate) => candidate.kind === "spotify_artist");

  assert.ok(reason);
  return reason;
}
