import type { CommunityCounts } from "@/lib/community";
import type {
  DiscoveryPreferenceSignal,
  ImplicitSignalRow,
  SpotifyMatchCorrection,
} from "@/lib/discovery-memory";
import type { EventRecord } from "@/lib/events";
import {
  LISTENER_PREFERENCE_CONTROLS,
  normalizeListenerPreferences,
  type ListenerCustomSignal,
  type ListenerDiscoveryPreferences,
  type ListenerPreferenceKey,
} from "./listener-preferences";
import type { MusicConnection, MusicProfileItem } from "@/lib/music";
import {
  bestRelationStrength,
  GENRE_LABELS,
  isGenericGenreTerm,
  resolveGenres,
  type CanonicalGenre,
} from "./genre-taxonomy";

export type DiscoveryReason =
  | {
      kind: "spotify_artist";
      label: string;
      detail: {
        field: string;
        matchedText: string;
        matchedTerm: string;
        normalizedTerm: string;
        score: number;
        source: string;
        sourceName: string;
        sourceProviderItemId: string | null;
      };
    }
  | {
      kind: "simple";
      label: string;
    };

export type DiscoveryScore = {
  bestBetsScore: number;
  bestMatchScore: number;
  components: DiscoveryScoreComponents;
  eventId: string;
  preferenceAdjustment: number;
  reasons: DiscoveryReason[];
  spotifyMatched: boolean;
};

export type DiscoveryScoresByEvent = Record<string, DiscoveryScore>;

export type DiscoveryScoreComponent = {
  adjustment: number;
  base: number;
  label: string;
  total: number;
  weight: number;
};

export type DiscoveryScoreComponents = Record<ListenerPreferenceKey, DiscoveryScoreComponent> & {
  customSignals: DiscoveryScoreComponent;
  learnedBehavior: DiscoveryScoreComponent;
};

/** A saved venue/artist favorite (PRD 14 / C3). `itemKey` is the normalized name from C1. */
export type SavedFavorite = {
  itemType: "venue" | "artist";
  itemKey: string;
};

type ScoreDiscoveryEventsInput = {
  connections?: MusicConnection[];
  counts: Record<string, CommunityCounts | undefined>;
  events: EventRecord[];
  implicitSignals?: ImplicitSignalRow[];
  listenerPreferences?: unknown;
  now?: Date;
  preferenceSignals?: DiscoveryPreferenceSignal[];
  profileItems?: MusicProfileItem[];
  savedFavorites?: SavedFavorite[];
  spotifyMatchCorrections?: SpotifyMatchCorrection[];
};

/** A normalized, de-duplicated implicit skip signal ready for per-event matching (PRD 18 / C1). */
type ImplicitSkipSignal = {
  dimension: ImplicitSignalRow["dimension"];
  value: string;
  impressions: number;
  lastImpressionAt: string;
  engaged: boolean;
};

/** Per-dimension cooling derived from non-converting impressions (PRD 18 / C1). */
type ImplicitCool = {
  artistCool: number;
  venueCool: number;
  genreCool: number;
  totalCool: number;
  reasons: DiscoveryReason[];
};

type ProfileTerm = {
  name: string;
  normalized: string;
  providerItemId: string | null;
  source: string;
  weight: number;
};

type SpotifyEventField = {
  label: string;
  value: string;
};

type PreferenceComponentBases = Record<ListenerPreferenceKey, number> & {
  learnedBehavior: number;
};

type PreferenceTuningResult = {
  adjustment: number;
  components: DiscoveryScoreComponents;
  customSignalScore: number;
};

const MAX_REASONS = 3;
const MAX_SPOTIFY_SCORE = 80;

// Implicit (impression-derived) skip cooling (PRD 18 / C1). Deliberately conservative: a dimension
// must clear a repetition threshold before it cools at all, the contribution is recency-decayed, and
// it is capped well below the explicit `remove` magnitude (min(56, …)) to keep explicit > implicit.
const IMPLICIT_SKIP_THRESHOLD = 4;
const IMPLICIT_SKIP_HALF_LIFE_DAYS = 30;
const IMPLICIT_DIM_COOL_CAP = 12;
const IMPLICIT_TOTAL_COOL_CAP = 24;
const IMPLICIT_REASON_MIN = 5;

export function scoreDiscoveryEvents({
  connections = [],
  counts,
  events,
  implicitSignals = [],
  listenerPreferences,
  now = new Date(),
  preferenceSignals = [],
  profileItems = [],
  savedFavorites = [],
  spotifyMatchCorrections = [],
}: ScoreDiscoveryEventsInput): DiscoveryScoresByEvent {
  const spotifyEnabled = connections.some(
    (connection) =>
      connection.provider === "spotify" &&
      !connection.disconnectedAt &&
      !connection.tasteOptOutAt
  );
  const profileTerms = spotifyEnabled ? buildProfileTerms(profileItems) : [];
  const spotifyGenreAffinity = spotifyEnabled ? buildSpotifyGenreAffinity(profileItems) : [];
  const preferences = normalizeListenerPreferences(listenerPreferences);
  // Aggregate the impression-derived skip signals once per scoring pass (PRD 18 / C1), normalized so
  // matching is consistent with the rest of the scorer. Reused for every event below.
  const implicitSkipSignals = buildImplicitSkipSignals(implicitSignals);

  // Dedupe favorites against equivalent ad-hoc boost custom signals so a saved venue/artist and
  // an explicit boost for the same name don't double-count across components (PRD 14 bounding).
  const boostCustomTerms = new Set(
    preferences.customSignals
      .filter((signal) => signal.direction === "boost" && (signal.kind === "venue" || signal.kind === "artist"))
      .map((signal) => `${signal.kind}:${normalizeText(signal.label)}`)
  );
  const savedVenues = savedFavorites.filter(
    (favorite) => favorite.itemType === "venue" && !boostCustomTerms.has(`venue:${favorite.itemKey}`)
  );
  const savedArtists = savedFavorites.filter(
    (favorite) => favorite.itemType === "artist" && !boostCustomTerms.has(`artist:${favorite.itemKey}`)
  );

  return Object.fromEntries(
    events.map((event) => {
      const eventCounts = counts[event.id];
      const publicScore = scorePublicSignals(event, eventCounts, now);
      const profileScore = scoreSpotifyMatch(
        event,
        profileTerms,
        spotifyMatchCorrections.filter((correction) => correction.eventId === event.id)
      );
      const personalScore = scorePersonalSignals(event, preferenceSignals);
      const implicit = scoreImplicitSignals(event, implicitSkipSignals, now);
      // Folding the cool into the directly-summed personal contribution is what actually lowers the
      // event's rank at default dials; the per-dimension bases below carry the cooling for the trace.
      const personalContribution = personalScore.score - implicit.totalCool;
      const genreResult = scoreGenreMatch(event);
      // Layer the connected listener's Spotify genre affinity on top of the public taxonomy match
      // (PRD 16 / C5), bounded within the genreMatch ceiling so weighting stays calibrated.
      const spotifyGenreScore = scoreSpotifyGenreMatch(genreResult.genres, spotifyGenreAffinity);
      const genreMatchBase = Math.min(GENRE_MATCH_CEILING, genreResult.score + spotifyGenreScore);
      const favoriteScore = scoreFavorites(event, savedVenues, savedArtists);
      const componentBases = getPreferenceComponentBases({
        counts: eventCounts,
        event,
        favoriteArtistScore: favoriteScore.artist,
        favoriteVenueScore: favoriteScore.venue,
        genreMatchBase,
        implicit,
        personalScore,
        profileScore,
        publicScore,
      });
      const bestBetsTuning = scorePreferenceTuning(event, preferences, componentBases, {
        includeArtistAffinity: false,
      });
      const bestMatchTuning = scorePreferenceTuning(event, preferences, componentBases, {
        includeArtistAffinity: true,
      });
      const reasons = compactReasons([
        ...getFavoriteReasons(favoriteScore),
        ...personalScore.reasons,
        ...implicit.reasons,
        ...publicScore.reasons,
        ...profileScore.reasons,
        ...getSpotifyGenreReasons(spotifyGenreScore),
        ...getPreferenceReasons(bestMatchTuning),
        // Genre is supplementary: it surfaces for everyone (esp. anonymous) but yields the
        // limited reason budget to stronger personalized signals when space is tight.
        ...getGenreReasons(genreResult.genres),
      ]);

      return [
        event.id,
        {
          // Favorites contribute a direct baseline term (like the Spotify artist match), with the
          // venuePreference / artistAffinity weights dialing it 0x–2x via the component delta. A
          // saved venue applies to both sorts; a saved artist rides artistAffinity (Best Match).
          bestBetsScore:
            publicScore.score + personalContribution + favoriteScore.venue + bestBetsTuning.adjustment,
          bestMatchScore:
            publicScore.score +
            profileScore.score +
            personalContribution +
            favoriteScore.venue +
            favoriteScore.artist +
            bestMatchTuning.adjustment,
          components: bestMatchTuning.components,
          eventId: event.id,
          preferenceAdjustment: bestMatchTuning.adjustment,
          reasons,
          spotifyMatched: profileScore.score > 0,
        },
      ];
    })
  );
}

function scorePublicSignals(event: EventRecord, counts: CommunityCounts | undefined, now: Date) {
  const hoursUntil = getHoursUntil(event, now);
  const timingScore =
    hoursUntil <= 12 ? 30 :
    hoursUntil <= 36 ? 24 :
    hoursUntil <= 72 ? 18 :
    hoursUntil <= 168 ? 10 :
    4;
  const going = counts?.going ?? 0;
  const fire = counts?.fire ?? 0;
  const notes = counts?.notes ?? 0;
  const songs = counts?.songs ?? 0;
  const voices = counts?.voices ?? 0;
  const communityScore = Math.min(42, fire * 7 + going * 5 + notes * 4 + songs * 3 + voices * 3);
  const localContextScore = Math.min(
    18,
    notes * 4 + songs * 3 + voices * 3 + (eventContainsAny(event, ["asheville", "local", "828"]) ? 6 : 0)
  );
  const reasons: DiscoveryReason[] = [];

  if (hoursUntil <= 48) {
    reasons.push(simpleReason("happening soon"));
  }
  if (fire > 0 || going > 1) {
    reasons.push(simpleReason("high community signal"));
  }
  if (notes > 0 || songs > 0 || voices > 0) {
    reasons.push(simpleReason("local context"));
  }
  if (reasons.length === 0 && event.tags.length > 0) {
    reasons.push(simpleReason("tag match"));
  }

  return {
    components: {
      dateAvailability: timingScore,
      localRelevance: localContextScore,
      socialHeat: communityScore,
    },
    reasons,
    score: timingScore + communityScore,
  };
}

function scorePersonalSignals(event: EventRecord, signals: DiscoveryPreferenceSignal[]) {
  let positiveScore = 0;
  let negativeScore = 0;
  let venuePreferenceScore = 0;

  for (const signal of signals) {
    const similarity = scoreSignalSimilarity(event, signal);

    if (similarity === 0) {
      continue;
    }

    if (signal.action === "remove") {
      negativeScore += Math.min(56, similarity * 8);
      continue;
    }

    const actionWeight = getPositiveActionWeight(signal.action);
    if (actionWeight > 0) {
      positiveScore += Math.min(actionWeight, similarity * actionWeight * 0.12);
      if (isSameNormalizedValue(event.venueName, signal.venueName)) {
        venuePreferenceScore += Math.min(18, actionWeight * 0.22);
      }
    }
  }

  const score = Math.max(-80, Math.min(70, positiveScore - negativeScore));
  const reasons: DiscoveryReason[] = [];

  if (positiveScore >= 24) {
    reasons.push(simpleReason("matches your recent picks"));
  } else if (positiveScore >= 10) {
    reasons.push(simpleReason("learned from your clicks"));
  }

  return {
    learnedBehaviorScore: score,
    reasons,
    score,
    venuePreferenceScore: Math.min(36, venuePreferenceScore),
  };
}

/**
 * Normalize and merge raw impression-derived rows into per-(dimension, value) skip signals
 * (PRD 18 / C1). SQL grouped by raw value; this re-keys on `normalizeText` so punctuation/casing
 * variants collapse the same way the rest of the scorer matches. Generic genre terms and any value
 * that has had explicit positive engagement are dropped so they can never cool.
 */
function buildImplicitSkipSignals(rows: ImplicitSignalRow[]): ImplicitSkipSignal[] {
  const merged = new Map<string, ImplicitSkipSignal>();

  for (const row of rows) {
    const value = normalizeText(row.value);
    if (!value) {
      continue;
    }
    if (row.dimension === "tag" && isGenericTerm(value)) {
      continue;
    }

    const key = `${row.dimension}:${value}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        dimension: row.dimension,
        value,
        impressions: row.impressions,
        lastImpressionAt: row.lastImpressionAt,
        engaged: row.engaged,
      });
      continue;
    }

    existing.impressions += row.impressions;
    existing.engaged = existing.engaged || row.engaged;
    if (new Date(row.lastImpressionAt).getTime() > new Date(existing.lastImpressionAt).getTime()) {
      existing.lastImpressionAt = row.lastImpressionAt;
    }
  }

  return Array.from(merged.values());
}

/**
 * Turn repeated, non-converting impressions into a gentle per-dimension cool (PRD 18 / C1, Outcome 1).
 * A dimension cools only after it clears the repetition threshold with zero positive engagement; the
 * magnitude is recency-decayed and capped per-dimension and in total, strictly below the explicit
 * `remove` magnitude so explicit signals always dominate. Cooling never hides an event — it only
 * lowers matching artist/venue/genre bases, leaving the novelty floor to protect discovery.
 */
function scoreImplicitSignals(
  event: EventRecord,
  signals: ImplicitSkipSignal[],
  now: Date
): ImplicitCool {
  let artistCool = 0;
  let venueCool = 0;
  let genreCool = 0;

  for (const signal of signals) {
    // Explicit positive engagement for this dimension overrides implicit cooling, and a single skip
    // (below the repetition threshold) does nothing.
    if (signal.engaged || signal.impressions < IMPLICIT_SKIP_THRESHOLD) {
      continue;
    }

    const matchStrength = matchImplicitDimension(event, signal);
    if (matchStrength === 0) {
      continue;
    }

    const cool = implicitCoolMagnitude(signal, now) * matchStrength;
    // Take the strongest matching signal per dimension rather than summing, so multiple matching
    // tags (or near-duplicate values) can't compound into over-cooling.
    if (signal.dimension === "artist") {
      artistCool = Math.max(artistCool, cool);
    } else if (signal.dimension === "venue") {
      venueCool = Math.max(venueCool, cool);
    } else {
      genreCool = Math.max(genreCool, cool);
    }
  }

  artistCool = Math.min(IMPLICIT_DIM_COOL_CAP, artistCool);
  venueCool = Math.min(IMPLICIT_DIM_COOL_CAP, venueCool);
  genreCool = Math.min(IMPLICIT_DIM_COOL_CAP, genreCool);
  const totalCool = Math.min(IMPLICIT_TOTAL_COOL_CAP, artistCool + venueCool + genreCool);

  return {
    artistCool,
    venueCool,
    genreCool,
    totalCool,
    reasons: getImplicitReasons(artistCool, venueCool, genreCool),
  };
}

/** Match an event field against a (normalized) implicit skip value, reusing the shared primitive. */
function matchImplicitDimension(event: EventRecord, signal: ImplicitSkipSignal) {
  if (signal.dimension === "artist") {
    return fieldMatchStrength(event.artistName, signal.value);
  }
  if (signal.dimension === "venue") {
    return fieldMatchStrength(event.venueName, signal.value);
  }

  let best = 0;
  for (const tag of event.tags) {
    if (!isGenericTerm(normalizeText(tag))) {
      best = Math.max(best, fieldMatchStrength(tag, signal.value));
    }
  }
  return best;
}

/** Recency-decayed cool for one dimension; grows slowly past the threshold, capped per-dimension. */
function implicitCoolMagnitude(signal: ImplicitSkipSignal, now: Date) {
  const over = signal.impressions - IMPLICIT_SKIP_THRESHOLD;
  const raw = Math.min(IMPLICIT_DIM_COOL_CAP, 6 + over * 2);
  const ageDays = Math.max(0, (now.getTime() - new Date(signal.lastImpressionAt).getTime()) / 86_400_000);
  const decay = Math.pow(0.5, ageDays / IMPLICIT_SKIP_HALF_LIFE_DAYS);
  return raw * decay;
}

/** Truthful, private-safe reason naming the dominant cooled dimension. No raw counts exposed. */
function getImplicitReasons(artistCool: number, venueCool: number, genreCool: number): DiscoveryReason[] {
  const strongest = Math.max(artistCool, venueCool, genreCool);
  if (strongest < IMPLICIT_REASON_MIN) {
    return [];
  }
  if (strongest === artistCool) {
    return [simpleReason("you tend to skip this artist")];
  }
  if (strongest === venueCool) {
    return [simpleReason("you tend to skip this venue")];
  }
  return [simpleReason("you tend to skip shows like this")];
}

function getPreferenceComponentBases({
  counts,
  event,
  favoriteArtistScore,
  favoriteVenueScore,
  genreMatchBase,
  implicit,
  personalScore,
  profileScore,
  publicScore,
}: {
  counts: CommunityCounts | undefined;
  event: EventRecord;
  favoriteArtistScore: number;
  favoriteVenueScore: number;
  genreMatchBase: number;
  implicit: ImplicitCool;
  personalScore: ReturnType<typeof scorePersonalSignals>;
  profileScore: ReturnType<typeof scoreSpotifyMatch>;
  publicScore: ReturnType<typeof scorePublicSignals>;
}): PreferenceComponentBases {
  return {
    // Implicit skip cooling is subtracted from the matching per-dimension base so it is attributable
    // per-dimension in Listener Trace and tunable via the existing dials (PRD 18 / C1). The headline
    // rank effect comes from `personalContribution`; at default dials these bases don't double-count.
    artistAffinity: profileScore.score + favoriteArtistScore - implicit.artistCool,
    dateAvailability: publicScore.components.dateAvailability,
    freePaidPreference: eventContainsAny(event, ["free", "no cover", "suggested donation"]) ? 12 : 0,
    genreMatch: genreMatchBase - implicit.genreCool,
    learnedBehavior: personalScore.learnedBehaviorScore - implicit.totalCool,
    localRelevance: publicScore.components.localRelevance,
    novelty: scoreNovelty(counts, profileScore.score, personalScore.score),
    outdoorIndoorPreference: eventContainsAny(event, ["outdoor", "outside", "patio", "indoor", "listening room"])
      ? 12
      : 0,
    socialHeat: publicScore.components.socialHeat,
    // Saved-venue boost rides venuePreference, capped with the existing learned-behavior cap so it
    // can't exceed the component ceiling (PRD 14 bounding); implicit venue cooling subtracts after.
    venuePreference:
      Math.min(VENUE_PREFERENCE_CEILING, personalScore.venuePreferenceScore + favoriteVenueScore) -
      implicit.venueCool,
  };
}

function scorePreferenceTuning(
  event: EventRecord,
  preferences: ListenerDiscoveryPreferences,
  bases: PreferenceComponentBases,
  options: { includeArtistAffinity: boolean }
): PreferenceTuningResult {
  let adjustment = 0;
  const components = {} as DiscoveryScoreComponents;

  for (const control of LISTENER_PREFERENCE_CONTROLS) {
    const base = !options.includeArtistAffinity && control.key === "artistAffinity" ? 0 : bases[control.key];
    const weight = preferences.weights[control.key];
    const componentAdjustment = base * ((weight - 100) / 100);

    adjustment += componentAdjustment;
    components[control.key] = {
      adjustment: roundScore(componentAdjustment),
      base: roundScore(base),
      label: control.label,
      total: roundScore(base + componentAdjustment),
      weight,
    };
  }

  const customSignalScore = scoreCustomSignals(event, preferences.customSignals);
  adjustment += customSignalScore;
  components.customSignals = {
    adjustment: roundScore(customSignalScore),
    base: 0,
    label: "Custom signals",
    total: roundScore(customSignalScore),
    weight: 100,
  };
  components.learnedBehavior = {
    adjustment: 0,
    base: roundScore(bases.learnedBehavior),
    label: "Learned behavior",
    total: roundScore(bases.learnedBehavior),
    weight: 100,
  };

  return {
    adjustment: roundScore(adjustment),
    components,
    customSignalScore: roundScore(customSignalScore),
  };
}

/** Truthful reasons when a saved venue/artist drove a boost (PRD 14). No private values exposed. */
function getFavoriteReasons(favoriteScore: { artist: number; venue: number }): DiscoveryReason[] {
  const reasons: DiscoveryReason[] = [];
  if (favoriteScore.venue > 0) {
    reasons.push(simpleReason("saved venue"));
  }
  if (favoriteScore.artist > 0) {
    reasons.push(simpleReason("saved artist"));
  }
  return reasons;
}

/**
 * Privacy-safe reason for a Spotify genre-affinity boost (PRD 16). Names no private genre value —
 * the listener's genre list never leaves the server.
 */
function getSpotifyGenreReasons(spotifyGenreScore: number): DiscoveryReason[] {
  return spotifyGenreScore > 0 ? [simpleReason("matches your top genres")] : [];
}

/** Compact, truthful genre reason naming up to two matched canonical genres (public data only). */
function getGenreReasons(genres: CanonicalGenre[]): DiscoveryReason[] {
  if (genres.length === 0) {
    return [];
  }

  const named = genres.slice(0, 2).map((genre) => GENRE_LABELS[genre]);
  return [simpleReason(`genre match: ${named.join(" / ")}`)];
}

function getPreferenceReasons(tuning: PreferenceTuningResult): DiscoveryReason[] {
  if (tuning.customSignalScore >= 8) {
    return [simpleReason("matches your tuned preferences")];
  }
  if (tuning.customSignalScore <= -8) {
    return [simpleReason("lowered by your tuned preferences")];
  }
  if (tuning.adjustment >= 18) {
    return [simpleReason("boosted by your listener dials")];
  }
  if (tuning.adjustment <= -18) {
    return [simpleReason("dialed down for you")];
  }

  return [];
}

/**
 * Resolve an event's genre profile (canonical genres) and score how genre-identifiable it is,
 * via the taxonomy (PRD 15 / C4). Catches alias-tagged events the old flat list missed (e.g.
 * "rnb" → soul, "singer-songwriter" → folk). The output range/ceiling is preserved so the
 * downstream `genreMatch` weighting stays calibrated.
 */
function scoreGenreMatch(event: EventRecord): { score: number; genres: CanonicalGenre[] } {
  const usefulTagCount = event.tags.filter((tag) => !isGenericTerm(normalizeText(tag))).length;
  const genres = resolveGenres([event.eventTitle, event.artistName, ...event.tags]);
  const genreScore = genres.length > 0 ? 8 : 0;

  return {
    genres,
    score: Math.min(24, usefulTagCount * 6 + genreScore),
  };
}

const VENUE_PREFERENCE_CEILING = 36;
const ARTIST_FAVORITE_CEILING = 30;
const GENRE_MATCH_CEILING = 36;
const SPOTIFY_GENRE_CEILING = 16;

/**
 * Derive a connected listener's canonical genre affinity (PRD 16 / C5) by resolving the genres on
 * their Spotify top-artist rows through the C4 taxonomy. Returns unique canonical genres; empty
 * when genres are absent (e.g. not yet re-synced) so matching degrades to taxonomy-only.
 */
function buildSpotifyGenreAffinity(profileItems: MusicProfileItem[]): CanonicalGenre[] {
  const rawGenres = profileItems
    .filter((item) => item.itemType === "top_artist")
    .flatMap((item) => item.genres);

  return resolveGenres(rawGenres);
}

/**
 * Score how well an event's canonical genres align with a connected listener's Spotify genre
 * affinity, using taxonomy relationship strength for near matches. Bounded so it layers on the
 * public genre match without inflating the genreMatch component beyond its ceiling.
 */
function scoreSpotifyGenreMatch(eventGenres: CanonicalGenre[], affinity: CanonicalGenre[]): number {
  if (eventGenres.length === 0 || affinity.length === 0) {
    return 0;
  }

  let strength = 0;
  for (const genre of eventGenres) {
    strength = Math.max(strength, bestRelationStrength(genre, affinity));
  }

  return Math.round(strength * SPOTIFY_GENRE_CEILING);
}

/**
 * Score a listener's saved venues/artists against this event (PRD 14 / C3). A saved venue that
 * matches the event venue feeds the `venuePreference` base; a saved artist that matches the event
 * artist feeds `artistAffinity`. Reuses `fieldMatchStrength` (same normalization as saving) and
 * caps each contribution within the existing component ceilings so favorites can't dominate.
 */
function scoreFavorites(
  event: EventRecord,
  savedVenues: SavedFavorite[],
  savedArtists: SavedFavorite[]
): { artist: number; venue: number } {
  let venue = 0;
  for (const favorite of savedVenues) {
    venue += fieldMatchStrength(event.venueName, favorite.itemKey);
  }

  let artist = 0;
  for (const favorite of savedArtists) {
    artist += fieldMatchStrength(event.artistName, favorite.itemKey);
  }

  return {
    artist: Math.min(ARTIST_FAVORITE_CEILING, artist * ARTIST_FAVORITE_CEILING),
    venue: Math.min(VENUE_PREFERENCE_CEILING, venue * VENUE_PREFERENCE_CEILING),
  };
}

function scoreNovelty(
  counts: CommunityCounts | undefined,
  profileScore: number,
  personalScore: number
) {
  const socialTotal =
    (counts?.fire ?? 0) +
    (counts?.going ?? 0) +
    (counts?.notes ?? 0) +
    (counts?.songs ?? 0) +
    (counts?.voices ?? 0);

  if (socialTotal > 2 || profileScore > 0 || personalScore > 10) {
    return 0;
  }

  return 12;
}

function scoreCustomSignals(event: EventRecord, signals: ListenerCustomSignal[]) {
  return signals.reduce((total, signal) => {
    const matchStrength = getCustomSignalMatchStrength(event, signal);

    if (matchStrength === 0) {
      return total;
    }

    const contribution = signal.weight * matchStrength;
    return total + (signal.direction === "boost" ? contribution : -contribution);
  }, 0);
}

function getCustomSignalMatchStrength(event: EventRecord, signal: ListenerCustomSignal) {
  const term = normalizeText(signal.label);

  if (!term) {
    return 0;
  }

  if (signal.kind === "artist") {
    return fieldMatchStrength(event.artistName, term);
  }
  if (signal.kind === "venue") {
    return fieldMatchStrength(event.venueName, term);
  }
  if (signal.kind === "tag") {
    return event.tags.some((tag) => fieldMatchStrength(tag, term) > 0) ? 0.8 : 0;
  }

  return getEventHaystack(event).includes(term) ? 0.6 : 0;
}

function fieldMatchStrength(value: string, normalizedTerm: string) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return 0;
  }
  if (normalizedValue === normalizedTerm) {
    return 1;
  }
  if (normalizedValue.includes(normalizedTerm) || normalizedTerm.includes(normalizedValue)) {
    return 0.75;
  }

  return 0;
}

function scoreSignalSimilarity(event: EventRecord, signal: DiscoveryPreferenceSignal) {
  let score = 0;
  const eventArtist = normalizeText(event.artistName);
  const signalArtist = normalizeText(signal.artistName);
  const eventVenue = normalizeText(event.venueName);
  const signalVenue = normalizeText(signal.venueName);
  const eventTitle = normalizeText(event.eventTitle);
  const signalTitle = normalizeText(signal.eventTitle);

  if (signal.eventId === event.id) {
    score += 10;
  }
  if (eventArtist && signalArtist && eventArtist === signalArtist) {
    score += 8;
  }
  if (eventTitle && signalTitle && eventTitle === signalTitle) {
    score += 6;
  }
  if (eventVenue && signalVenue && eventVenue === signalVenue) {
    score += 4;
  }

  const eventTags = new Set(event.tags.map(normalizeText).filter(Boolean));
  for (const tag of signal.tags.map(normalizeText)) {
    if (tag && eventTags.has(tag) && !isGenericTerm(tag)) {
      score += 2;
    }
  }

  return Math.min(score, 12);
}

function getPositiveActionWeight(action: DiscoveryPreferenceSignal["action"]) {
  if (action === "planning") {
    return 34;
  }
  if (action === "fire") {
    return 28;
  }
  if (action === "song_contribution") {
    return 26;
  }
  if (action === "note_contribution") {
    return 20;
  }
  if (action === "avlgo_click") {
    return 16;
  }
  if (action === "detail_open") {
    return 8;
  }
  return 0;
}

function scoreSpotifyMatch(
  event: EventRecord,
  terms: ProfileTerm[],
  corrections: SpotifyMatchCorrection[]
) {
  if (terms.length === 0) {
    return { reasons: [], score: 0 };
  }

  const fields: SpotifyEventField[] = [
    { label: "artist", value: event.artistName },
    { label: "title", value: event.eventTitle },
    ...event.tags.map((tag) => ({ label: "tag", value: tag })),
    { label: "venue", value: event.venueName },
  ];
  let score = 0;
  const reasons: DiscoveryReason[] = [];

  for (const term of terms) {
    const correction = corrections.find((candidate) => candidate.normalizedTerm === term.normalized);

    if (correction?.action === "reject") {
      continue;
    }

    const match = findSpotifyFieldMatch(fields, term.normalized);

    if (!match) {
      continue;
    }

    const contribution = Math.max(0, Math.min(term.weight, MAX_SPOTIFY_SCORE - score));

    if (contribution === 0) {
      break;
    }

    score += contribution;
    reasons.push({
      kind: "spotify_artist",
      label: correction?.action === "replace" ? "corrected Spotify artist" : "Spotify artist match",
      detail: {
        field: match.field,
        matchedText: match.text,
        matchedTerm: correction?.replacementName ?? term.name,
        normalizedTerm: term.normalized,
        score: contribution,
        source: correction?.action === "replace" ? "correction" : term.source,
        sourceName: term.name,
        sourceProviderItemId: term.providerItemId,
      },
    });

    if (score >= MAX_SPOTIFY_SCORE) {
      break;
    }
  }

  return { reasons: reasons.slice(0, 1), score };
}

function buildProfileTerms(profileItems: MusicProfileItem[]) {
  const weighted = new Map<string, ProfileTerm>();

  for (const item of profileItems) {
    if (item.provider !== "spotify") {
      continue;
    }

    if (item.itemType === "top_artist") {
      addTerm(weighted, item.name, Math.max(18, 46 - item.rank), item);
    }

    if (item.itemType === "top_track") {
      addTerm(weighted, item.name, Math.max(5, 14 - Math.floor(item.rank / 3)), item);
      for (const artistName of item.artistNames) {
        addTerm(weighted, artistName, Math.max(12, 30 - Math.floor(item.rank / 2)), item);
      }
    }
  }

  return Array.from(weighted.values());
}

function addTerm(terms: Map<string, ProfileTerm>, value: string, weight: number, item: MusicProfileItem) {
  const normalized = normalizeText(value).replace(/^the /, "");
  const existing = terms.get(normalized);

  if (normalized.length < 4 || isGenericTerm(normalized)) {
    return;
  }

  if (!existing || weight > existing.weight) {
    terms.set(normalized, {
      name: value,
      normalized,
      providerItemId: item.itemType === "top_artist" ? item.providerItemId : null,
      source: item.itemType,
      weight,
    });
  }
}

function compactReasons(reasons: DiscoveryReason[]) {
  const seen = new Set<string>();
  const compacted: DiscoveryReason[] = [];

  for (const reason of reasons) {
    const key = reason.kind === "spotify_artist" ? `${reason.kind}:${reason.detail.normalizedTerm}` : reason.label;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    compacted.push(reason);
  }

  return compacted.slice(0, MAX_REASONS);
}

function findSpotifyFieldMatch(fields: SpotifyEventField[], term: string) {
  for (const field of fields) {
    const normalizedValue = normalizeText(field.value);

    if (!normalizedValue) {
      continue;
    }

    if (normalizedValue === term || normalizedValue.includes(term)) {
      return {
        field: field.label,
        text: field.value,
      };
    }
  }

  return null;
}

function simpleReason(label: string): DiscoveryReason {
  return { kind: "simple", label };
}

function getHoursUntil(event: EventRecord, now: Date) {
  const start = event.startsAt
    ? new Date(event.startsAt)
    : new Date(`${event.eventDate}T23:59:00`);

  return Math.max(0, (start.getTime() - now.getTime()) / (1000 * 60 * 60));
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameNormalizedValue(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function eventContainsAny(event: EventRecord, terms: string[]) {
  const haystack = getEventHaystack(event);
  return terms.some((term) => haystack.includes(normalizeText(term)));
}

function getEventHaystack(event: EventRecord) {
  return normalizeText(
    [
      event.eventTitle,
      event.artistName,
      event.venueName,
      event.eventDate,
      event.eventTime ?? "",
      ...event.tags,
    ].join(" ")
  );
}

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

function isGenericTerm(value: string) {
  return isGenericGenreTerm(value);
}
