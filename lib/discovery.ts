import type { CommunityCounts } from "@/lib/community";
import type {
  DiscoveryPreferenceSignal,
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

type ScoreDiscoveryEventsInput = {
  connections?: MusicConnection[];
  counts: Record<string, CommunityCounts | undefined>;
  events: EventRecord[];
  listenerPreferences?: unknown;
  now?: Date;
  preferenceSignals?: DiscoveryPreferenceSignal[];
  profileItems?: MusicProfileItem[];
  spotifyMatchCorrections?: SpotifyMatchCorrection[];
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

export function scoreDiscoveryEvents({
  connections = [],
  counts,
  events,
  listenerPreferences,
  now = new Date(),
  preferenceSignals = [],
  profileItems = [],
  spotifyMatchCorrections = [],
}: ScoreDiscoveryEventsInput): DiscoveryScoresByEvent {
  const spotifyEnabled = connections.some(
    (connection) =>
      connection.provider === "spotify" &&
      !connection.disconnectedAt &&
      !connection.tasteOptOutAt
  );
  const profileTerms = spotifyEnabled ? buildProfileTerms(profileItems) : [];
  const preferences = normalizeListenerPreferences(listenerPreferences);

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
      const componentBases = getPreferenceComponentBases({
        counts: eventCounts,
        event,
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
        ...personalScore.reasons,
        ...publicScore.reasons,
        ...profileScore.reasons,
        ...getPreferenceReasons(bestMatchTuning),
      ]);

      return [
        event.id,
        {
          bestBetsScore: publicScore.score + personalScore.score + bestBetsTuning.adjustment,
          bestMatchScore:
            publicScore.score + profileScore.score + personalScore.score + bestMatchTuning.adjustment,
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

function getPreferenceComponentBases({
  counts,
  event,
  personalScore,
  profileScore,
  publicScore,
}: {
  counts: CommunityCounts | undefined;
  event: EventRecord;
  personalScore: ReturnType<typeof scorePersonalSignals>;
  profileScore: ReturnType<typeof scoreSpotifyMatch>;
  publicScore: ReturnType<typeof scorePublicSignals>;
}): PreferenceComponentBases {
  return {
    artistAffinity: profileScore.score,
    dateAvailability: publicScore.components.dateAvailability,
    freePaidPreference: eventContainsAny(event, ["free", "no cover", "suggested donation"]) ? 12 : 0,
    genreMatch: scoreGenreMatch(event),
    learnedBehavior: personalScore.learnedBehaviorScore,
    localRelevance: publicScore.components.localRelevance,
    novelty: scoreNovelty(counts, profileScore.score, personalScore.score),
    outdoorIndoorPreference: eventContainsAny(event, ["outdoor", "outside", "patio", "indoor", "listening room"])
      ? 12
      : 0,
    socialHeat: publicScore.components.socialHeat,
    venuePreference: personalScore.venuePreferenceScore,
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

function scoreGenreMatch(event: EventRecord) {
  const usefulTagCount = event.tags.filter((tag) => !isGenericTerm(normalizeText(tag))).length;
  const genreTerms = [
    "americana",
    "bluegrass",
    "country",
    "dance",
    "dj",
    "folk",
    "funk",
    "hip hop",
    "indie",
    "jazz",
    "metal",
    "punk",
    "r b",
    "rock",
    "soul",
  ];
  const genreTermScore = genreTerms.some((term) => getEventHaystack(event).includes(term)) ? 8 : 0;

  return Math.min(24, usefulTagCount * 6 + genreTermScore);
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

function normalizeText(value: string) {
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
  return ["live", "music", "band", "show", "concert", "local"].includes(value);
}
