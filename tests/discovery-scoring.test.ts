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

test("artist affinity dial can remove the Spotify boost without changing public Best Bets", () => {
  const defaultScore = scoreFrancesEliza();
  const tunedScore = scoreFrancesEliza([], {
    weights: {
      artistAffinity: 0,
    },
  });

  assert.equal(tunedScore.bestBetsScore, defaultScore.bestBetsScore);
  assert.equal(tunedScore.bestMatchScore, tunedScore.bestBetsScore);
  assert.equal(tunedScore.components.artistAffinity.adjustment, -45);
});

test("custom boost lifts matching events for guest/local preferences", () => {
  const defaultScore = scoreFrancesEliza();
  const tunedScore = scoreFrancesEliza([], {
    customSignals: [
      {
        direction: "boost",
        id: "venue-boost",
        kind: "venue",
        label: "The One Stop",
        weight: 40,
      },
    ],
  });

  assert.ok(tunedScore.bestMatchScore > defaultScore.bestMatchScore);
  assert.equal(tunedScore.components.customSignals.adjustment, 30);
  assert.equal(
    tunedScore.reasons.some((reason) => reason.kind === "simple" && reason.label === "matches your tuned preferences"),
    true
  );
});

test("custom lower downranks matching events", () => {
  const defaultScore = scoreFrancesEliza();
  const tunedScore = scoreFrancesEliza([], {
    customSignals: [
      {
        direction: "lower",
        id: "folk-lower",
        kind: "tag",
        label: "Folk Storytelling",
        weight: 30,
      },
    ],
  });

  assert.ok(tunedScore.bestMatchScore < defaultScore.bestMatchScore);
  assert.equal(tunedScore.components.customSignals.adjustment, -24);
});

test("paused Spotify taste suppresses Spotify matching while keeping explicit tuning available", () => {
  const score = scoreDiscoveryEvents({
    connections: [{ ...connectedSpotify, tasteOptOutAt: "2026-06-02T00:00:00.000Z" }],
    counts: {},
    events: [francesElizaEvent],
    listenerPreferences: {
      customSignals: [
        {
          direction: "boost",
          id: "artist-boost",
          kind: "artist",
          label: "Frances Eliza",
          weight: 25,
        },
      ],
    },
    now: new Date("2026-06-07T12:00:00.000Z"),
    profileItems: [elizaProfileItem],
  })[francesElizaEvent.id];

  assert.equal(score.spotifyMatched, false);
  assert.equal(score.components.artistAffinity.base, 0);
  assert.equal(score.components.customSignals.adjustment, 25);
});

test("social heat dial changes ranked score from public activity components", () => {
  const defaultScore = scoreFrancesEliza();
  const tunedScore = scoreFrancesEliza([], {
    weights: {
      socialHeat: 200,
    },
  });

  assert.ok(tunedScore.bestMatchScore > defaultScore.bestMatchScore);
  assert.equal(tunedScore.components.socialHeat.adjustment, tunedScore.components.socialHeat.base);
});

function scoreFrancesEliza(spotifyMatchCorrections: SpotifyMatchCorrection[] = [], preferences: object = {}) {
  return scoreDiscoveryEvents({
    connections: [connectedSpotify],
    counts: {
      [francesElizaEvent.id]: {
        fire: 1,
        going: 1,
        goingSources: {
          avlmc: 1,
          spotify: 0,
          ticket_click: 0,
        },
        notes: 0,
        songs: 0,
        voices: 0,
      },
    },
    events: [francesElizaEvent],
    listenerPreferences: preferences,
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
