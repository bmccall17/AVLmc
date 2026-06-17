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

/**
 * Normalized "boost" terms by dimension (PRD 21 / C4 correctability). A listener who boosts an
 * artist/venue/genre via the existing custom-signal channel is correcting any implicit cooling on
 * that dimension — the correction wins, so cooling is suppressed for matching values.
 */
type ProtectedDimensions = {
  artist: string[];
  venue: string[];
  tag: string[];
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
// Global per-event cap on total implicit influence (PRD 21 / C4): the sum of all per-dimension
// cooling that can lower a single event's rank, held below the explicit `remove` envelope (56) so the
// "explicit > implicit" invariant holds even when every dimension cools at once.
const IMPLICIT_TOTAL_COOL_CAP = 28;
const IMPLICIT_REASON_MIN = 5;

// Guaranteed exploration floor (PRD 21 / C4). Replaces the old binary novelty bonus: under-the-radar
// shows get a real, default-active boost that personalization can't silently strip, and a minimum
// share of any ranked top-N is reserved for them. Both are tunable via the existing `novelty` dial.
const EXPLORATION_FLOOR_BASE = 14;
const EXPLORATION_SOCIAL_CEILING = 5;
const EXPLORATION_FLOOR_SHARE = 0.2;

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
  // Build the recency-decayed, per-dimension positive taste model once per pass (PRD 19 / C2); each
  // event is matched against it below rather than re-summing every signal per event.
  const tasteModel = buildTasteModel(preferenceSignals, now);
  // Listener boost corrections that override implicit cooling (PRD 21 / C4); built once per pass.
  const protectedDimensions = buildProtectedDimensions(preferences.customSignals);

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
      const personalScore = scorePersonalSignals(event, preferenceSignals, tasteModel);
      const implicit = scoreImplicitSignals(event, implicitSkipSignals, now, protectedDimensions);
      // Per-dimension behavioral contribution to the directly-summed score (PRD 19 / C2). Positive
      // venue/genre taste rides both sorts; positive artist taste is a Best Match dimension (like the
      // Spotify match). Implicit skip cooling and the explicit remove penalty lower both sorts —
      // skips never bury an event, only cool the matching dimension. The matching component bases
      // below mirror these values so the existing dials tune (and can fully cancel) each one.
      const implicitCool = Math.min(
        IMPLICIT_TOTAL_COOL_CAP,
        implicit.artistCool + implicit.venueCool + implicit.genreCool
      );
      const tasteBestBets =
        personalScore.venueAffinity + personalScore.genreAffinity - personalScore.removePenalty - implicitCool;
      const tasteBestMatch =
        personalScore.artistAffinity +
        personalScore.venueAffinity +
        personalScore.genreAffinity -
        personalScore.removePenalty -
        implicitCool;
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
          // saved venue applies to both sorts; a saved artist rides artistAffinity (Best Match). The
          // exploration floor (novelty base) is added directly too (PRD 21 / C4) so under-the-radar
          // shows keep a real, dial-tunable boost personalization can't silently strip.
          bestBetsScore:
            publicScore.score +
            tasteBestBets +
            favoriteScore.venue +
            componentBases.novelty +
            bestBetsTuning.adjustment,
          bestMatchScore:
            publicScore.score +
            profileScore.score +
            tasteBestMatch +
            favoriteScore.venue +
            favoriteScore.artist +
            componentBases.novelty +
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

// --- Time-decayed, per-dimension taste model (PRD 19 / C2) --------------------------------------
//
// Replaces the flat "recent 240 equally-weighted signals" learned term with per-dimension affinities
// (artist / venue / genre) that are recency-decayed — a steep short-term half-life (intent) blended
// with a gentle long-term one (durable taste) — and confidence-weighted (more evidence → more
// weight, with diminishing returns). Each affinity routes into its existing component base + the
// direct score via the `net = base · (weight/100)` pattern, so it inherits the shipped dials and
// stays explainable. The implicit skip cooling from C1 (`scoreImplicitSignals`) feeds the same bases.

const TASTE_SHORT_HALF_LIFE_DAYS = 10;
const TASTE_LONG_HALF_LIFE_DAYS = 120;
const TASTE_SHORT_BLEND = 0.6;
const TASTE_LONG_BLEND = 0.4;
const TASTE_CONFIDENCE_K = 2;
const TASTE_SATURATION_SCALE = 40;
const TASTE_ARTIST_CEILING = 40;
const TASTE_VENUE_CEILING = 28;
const TASTE_GENRE_CEILING = 22;
const TASTE_REASON_MIN = 8;
const REMOVE_PENALTY_CAP = 80;

type DimensionAccumulator = { weight: number; count: number };

type ListenerTasteModel = {
  artist: Map<string, DimensionAccumulator>;
  venue: Map<string, DimensionAccumulator>;
  genre: Map<CanonicalGenre, DimensionAccumulator>;
};

type EventTaste = { artistAffinity: number; venueAffinity: number; genreAffinity: number };

/**
 * Aggregate a listener's positive behavioral signals into recency-decayed per-dimension accumulators
 * (PRD 19 / C2). Computed once per scoring pass, then matched per event. Each action contributes its
 * existing positive weight × blended recency; removes/implicit negatives are handled elsewhere so
 * explicit removal stays dominant.
 */
function buildTasteModel(signals: DiscoveryPreferenceSignal[], now: Date): ListenerTasteModel {
  const model: ListenerTasteModel = { artist: new Map(), venue: new Map(), genre: new Map() };

  for (const signal of signals) {
    const actionWeight = getPositiveActionWeight(signal.action);
    if (actionWeight <= 0) {
      continue;
    }
    const contribution = actionWeight * blendedRecency(signal.createdAt, now);
    if (contribution <= 0) {
      continue;
    }

    const artist = normalizeText(signal.artistName);
    if (artist) {
      addToAccumulator(model.artist, artist, contribution);
    }
    const venue = normalizeText(signal.venueName);
    if (venue) {
      addToAccumulator(model.venue, venue, contribution);
    }
    for (const genre of resolveGenres([signal.eventTitle, signal.artistName, ...signal.tags])) {
      addToAccumulator(model.genre, genre, contribution);
    }
  }

  return model;
}

function addToAccumulator<K>(map: Map<K, DimensionAccumulator>, key: K, contribution: number) {
  const existing = map.get(key);
  if (existing) {
    existing.weight += contribution;
    existing.count += 1;
  } else {
    map.set(key, { weight: contribution, count: 1 });
  }
}

/** Blend a steep short-term decay (recent intent) with a gentle long-term decay (durable taste). */
function blendedRecency(createdAt: string, now: Date) {
  const ageDays = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  const shortDecay = Math.pow(0.5, ageDays / TASTE_SHORT_HALF_LIFE_DAYS);
  const longDecay = Math.pow(0.5, ageDays / TASTE_LONG_HALF_LIFE_DAYS);
  return TASTE_SHORT_BLEND * shortDecay + TASTE_LONG_BLEND * longDecay;
}

/**
 * Saturating, confidence-weighted affinity from an accumulator (PRD 19 / C2): more recency-weighted
 * evidence raises the affinity with diminishing returns toward the dimension ceiling, while a low
 * observation count holds a single signal's effect down (confidence).
 */
function affinityStrength(accumulator: DimensionAccumulator | undefined, ceiling: number) {
  if (!accumulator || accumulator.weight <= 0) {
    return 0;
  }
  const saturated = 1 - Math.exp(-accumulator.weight / TASTE_SATURATION_SCALE);
  const confidence = accumulator.count / (accumulator.count + TASTE_CONFIDENCE_K);
  return ceiling * saturated * confidence;
}

/** Match an event's artist/venue/genres against the taste maps (best partial match wins). */
function scoreTasteForEvent(event: EventRecord, model: ListenerTasteModel): EventTaste {
  const artistAffinity = bestDimensionAffinity(event.artistName, model.artist, TASTE_ARTIST_CEILING);
  const venueAffinity = bestDimensionAffinity(event.venueName, model.venue, TASTE_VENUE_CEILING);

  let genreAffinity = 0;
  for (const eventGenre of resolveGenres([event.eventTitle, event.artistName, ...event.tags])) {
    genreAffinity = Math.max(genreAffinity, affinityStrength(model.genre.get(eventGenre), TASTE_GENRE_CEILING));
  }

  return { artistAffinity, venueAffinity, genreAffinity };
}

function bestDimensionAffinity(value: string, map: Map<string, DimensionAccumulator>, ceiling: number) {
  let best = 0;
  for (const [key, accumulator] of map) {
    const matchStrength = fieldMatchStrength(value, key);
    if (matchStrength === 0) {
      continue;
    }
    best = Math.max(best, affinityStrength(accumulator, ceiling) * matchStrength);
  }
  return best;
}

/**
 * Per-event behavioral contribution (PRD 19 / C2): positive per-dimension taste from the model plus
 * the explicit `remove` penalty (kept undecayed and per-event so explicit removal stays a strong,
 * dominant negative). Implicit skip cooling is applied separately in `scoreImplicitSignals` (C1).
 */
function scorePersonalSignals(
  event: EventRecord,
  signals: DiscoveryPreferenceSignal[],
  model: ListenerTasteModel
) {
  const taste = scoreTasteForEvent(event, model);

  let removePenalty = 0;
  for (const signal of signals) {
    if (signal.action !== "remove") {
      continue;
    }
    const similarity = scoreSignalSimilarity(event, signal);
    if (similarity > 0) {
      removePenalty += Math.min(56, similarity * 8);
    }
  }
  removePenalty = Math.min(REMOVE_PENALTY_CAP, removePenalty);

  const learnedBehaviorScore =
    taste.artistAffinity + taste.venueAffinity + taste.genreAffinity - removePenalty;

  return {
    artistAffinity: taste.artistAffinity,
    venueAffinity: taste.venueAffinity,
    genreAffinity: taste.genreAffinity,
    removePenalty,
    learnedBehaviorScore,
    reasons: getTasteReasons(taste),
  };
}

/** Truthful, private-safe positive reasons naming the dominant taste dimension. No raw history. */
function getTasteReasons(taste: EventTaste): DiscoveryReason[] {
  const strongest = Math.max(taste.artistAffinity, taste.venueAffinity, taste.genreAffinity);
  if (strongest < TASTE_REASON_MIN) {
    return [];
  }
  if (strongest === taste.artistAffinity) {
    return [simpleReason("matches artists you return to")];
  }
  if (strongest === taste.venueAffinity) {
    return [simpleReason("matches venues you favor")];
  }
  return [simpleReason("matches your taste in this genre")];
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
  now: Date,
  protectedDimensions: ProtectedDimensions
): ImplicitCool {
  let artistCool = 0;
  let venueCool = 0;
  let genreCool = 0;

  for (const signal of signals) {
    // Explicit positive engagement, or a listener correction (boost) on this dimension, overrides
    // implicit cooling (PRD 21 / C4 — explicit > implicit); a single skip below the threshold is a
    // no-op.
    if (signal.engaged || signal.impressions < IMPLICIT_SKIP_THRESHOLD) {
      continue;
    }
    if (isProtectedDimension(signal, protectedDimensions)) {
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

/** A boost correction on the matching dimension suppresses implicit cooling (PRD 21 / C4). */
function isProtectedDimension(signal: ImplicitSkipSignal, protectedDimensions: ProtectedDimensions) {
  const terms =
    signal.dimension === "artist"
      ? protectedDimensions.artist
      : signal.dimension === "venue"
        ? protectedDimensions.venue
        : protectedDimensions.tag;
  return terms.some((term) => fieldMatchStrength(signal.value, term) > 0);
}

/**
 * Collect the listener's "boost" custom-signal terms by dimension (PRD 21 / C4). These are the
 * corrections that override implicit cooling — reusing the existing custom-signal channel rather
 * than a new store.
 */
function buildProtectedDimensions(signals: ListenerCustomSignal[]): ProtectedDimensions {
  const protectedDimensions: ProtectedDimensions = { artist: [], venue: [], tag: [] };
  for (const signal of signals) {
    if (signal.direction !== "boost") {
      continue;
    }
    const term = normalizeText(signal.label);
    if (!term) {
      continue;
    }
    if (signal.kind === "artist") {
      protectedDimensions.artist.push(term);
    } else if (signal.kind === "venue") {
      protectedDimensions.venue.push(term);
    } else if (signal.kind === "tag") {
      protectedDimensions.tag.push(term);
    }
  }
  return protectedDimensions;
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
    // Each per-dimension base mirrors the value also added to the direct score, so the existing dial
    // both tunes and (at weight 0) fully cancels that dimension's contribution. Positive taste comes
    // from the C2 model; implicit skip cooling (C1) subtracts from the same base for trace attribution.
    artistAffinity: profileScore.score + favoriteArtistScore + personalScore.artistAffinity - implicit.artistCool,
    dateAvailability: publicScore.components.dateAvailability,
    freePaidPreference: eventContainsAny(event, ["free", "no cover", "suggested donation"]) ? 12 : 0,
    genreMatch: genreMatchBase + personalScore.genreAffinity - implicit.genreCool,
    learnedBehavior: personalScore.learnedBehaviorScore - implicit.totalCool,
    localRelevance: publicScore.components.localRelevance,
    novelty: scoreNovelty(counts, profileScore.score, personalScore.learnedBehaviorScore),
    outdoorIndoorPreference: eventContainsAny(event, ["outdoor", "outside", "patio", "indoor", "listening room"])
      ? 12
      : 0,
    socialHeat: publicScore.components.socialHeat,
    // Saved-venue boost + positive venue taste ride venuePreference, capped within the component
    // ceiling (PRD 14 bounding); implicit venue cooling subtracts after so it can push below zero.
    venuePreference:
      Math.min(VENUE_PREFERENCE_CEILING, favoriteVenueScore + personalScore.venueAffinity) -
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

/**
 * Exploration floor (PRD 21 / C4). An under-the-radar show — little community heat, no strong taste
 * or Spotify signal — earns a real boost that fades smoothly as social heat rises (rather than the
 * old all-or-nothing +12). This base is added directly to the ranked score *and* tuned by the
 * `novelty` dial, so personalization can never silently bury quiet/local discovery, and turning the
 * dial up grows the floor.
 */
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

  if (socialTotal >= EXPLORATION_SOCIAL_CEILING || profileScore > 0 || personalScore > 16) {
    return 0;
  }

  const quietness = 1 - socialTotal / EXPLORATION_SOCIAL_CEILING;
  return Math.round(EXPLORATION_FLOOR_BASE * quietness);
}

/**
 * Guarantee a minimum exploration share of a ranked top-N (PRD 21 / C4). Given events already sorted
 * best-first with a `novel` flag, promote the highest-ranked novel shows into the top-N until at
 * least `ceil(share · topN)` of it is novel — reserving slots so a strongly-personalized listener
 * still sees quiet/local discovery. Pure and order-stable otherwise; returns a new array.
 */
export function enforceExplorationFloor<T extends { novel: boolean }>(
  ranked: T[],
  topN: number,
  share: number = EXPLORATION_FLOOR_SHARE
): T[] {
  const n = Math.min(topN, ranked.length);
  if (n === 0) {
    return ranked.slice();
  }

  const required = Math.ceil(share * n);
  const novelInTop = ranked.slice(0, n).filter((item) => item.novel).length;
  const deficit = required - novelInTop;
  if (deficit <= 0) {
    return ranked.slice();
  }

  // Best novel candidates sitting below the cut, in rank order.
  const promote = new Set(ranked.slice(n).filter((item) => item.novel).slice(0, deficit));
  if (promote.size === 0) {
    return ranked.slice();
  }

  // Demote the lowest-ranked non-novel shows currently in the top-N to free exactly that many slots.
  const demote = new Set<T>();
  for (let i = n - 1; i >= 0 && demote.size < promote.size; i -= 1) {
    if (!ranked[i].novel) {
      demote.add(ranked[i]);
    }
  }

  // Rebuild: the kept top-N (original minus demoted, plus promoted) keeps its relative order; the
  // demoted shows fall just below, then everything else — all otherwise rank-stable.
  const newTop = ranked.filter((item, index) => (index < n && !demote.has(item)) || promote.has(item));
  const below = ranked.filter((item, index) => !((index < n && !demote.has(item)) || promote.has(item)));
  return [...newTop, ...below];
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
