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

// --- Favorites strengthen recommendations (PRD 14 / C3) ----------------------------------------

const VENUE_KEY = "the one stop at asheville music hall"; // normalizeText(francesElizaEvent.venueName)
const ARTIST_KEY = "frances eliza"; // normalizeText(francesElizaEvent.artistName)

function scoreWithFavorites(
  savedFavorites: { itemType: "venue" | "artist"; itemKey: string }[],
  preferences: object = {}
) {
  return scoreDiscoveryEvents({
    counts: {},
    events: [francesElizaEvent],
    listenerPreferences: preferences,
    now: new Date("2026-06-07T12:00:00.000Z"),
    savedFavorites,
  })[francesElizaEvent.id];
}

function hasReason(reasons: DiscoveryReason[], label: string) {
  return reasons.some((reason) => reason.kind === "simple" && reason.label === label);
}

test("saving a venue raises a matching event via venuePreference", () => {
  const base = scoreWithFavorites([]);
  const withVenue = scoreWithFavorites([{ itemType: "venue", itemKey: VENUE_KEY }]);

  assert.ok(withVenue.bestBetsScore > base.bestBetsScore);
  assert.ok(withVenue.components.venuePreference.base > 0);
  assert.ok(hasReason(withVenue.reasons, "saved venue"));
});

test("saving an artist raises a matching event via artistAffinity (Best Match)", () => {
  const base = scoreWithFavorites([]);
  const withArtist = scoreWithFavorites([{ itemType: "artist", itemKey: ARTIST_KEY }]);

  assert.ok(withArtist.bestMatchScore > base.bestMatchScore);
  assert.ok(withArtist.components.artistAffinity.base > 0);
  assert.ok(hasReason(withArtist.reasons, "saved artist"));
});

test("the venuePreference weight tunes the saved-venue boost", () => {
  const withVenue = scoreWithFavorites([{ itemType: "venue", itemKey: VENUE_KEY }]);
  const muted = scoreWithFavorites([{ itemType: "venue", itemKey: VENUE_KEY }], {
    weights: { venuePreference: 0 },
  });

  // The saved-venue base is unchanged, but dialing the weight down removes its positive influence.
  assert.equal(withVenue.components.venuePreference.base, muted.components.venuePreference.base);
  assert.ok(withVenue.bestBetsScore > muted.bestBetsScore);
  assert.equal(muted.components.venuePreference.adjustment <= 0, true);
});

test("a favorite plus an equivalent boost custom signal do not double-count", () => {
  const customOnly = scoreWithFavorites([], {
    customSignals: [{ direction: "boost", id: "v", kind: "venue", label: VENUE_KEY, weight: 40 }],
  });
  const both = scoreWithFavorites([{ itemType: "venue", itemKey: VENUE_KEY }], {
    customSignals: [{ direction: "boost", id: "v", kind: "venue", label: VENUE_KEY, weight: 40 }],
  });

  // The favorite is deduped against the equivalent boost signal, so it adds no venuePreference base.
  assert.equal(both.components.venuePreference.base, customOnly.components.venuePreference.base);
});

test("venuePreference base stays within its ceiling", () => {
  const withVenue = scoreWithFavorites([{ itemType: "venue", itemKey: VENUE_KEY }]);
  assert.ok(withVenue.components.venuePreference.base <= 36);
});
