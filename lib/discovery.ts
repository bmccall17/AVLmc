import type { CommunityCounts } from "@/lib/community";
import type {
  DiscoveryPreferenceSignal,
  SpotifyMatchCorrection,
} from "@/lib/discovery-memory";
import type { EventRecord } from "@/lib/events";
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
  eventId: string;
  reasons: DiscoveryReason[];
  spotifyMatched: boolean;
};

export type DiscoveryScoresByEvent = Record<string, DiscoveryScore>;

type ScoreDiscoveryEventsInput = {
  connections?: MusicConnection[];
  counts: Record<string, CommunityCounts | undefined>;
  events: EventRecord[];
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

const MAX_REASONS = 3;
const MAX_SPOTIFY_SCORE = 80;

export function scoreDiscoveryEvents({
  connections = [],
  counts,
  events,
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
      const reasons = compactReasons([
        ...personalScore.reasons,
        ...publicScore.reasons,
        ...profileScore.reasons,
      ]);

      return [
        event.id,
        {
          bestBetsScore: publicScore.score + personalScore.score,
          bestMatchScore: publicScore.score + profileScore.score + personalScore.score,
          eventId: event.id,
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
    reasons,
    score: timingScore + communityScore,
  };
}

function scorePersonalSignals(event: EventRecord, signals: DiscoveryPreferenceSignal[]) {
  let positiveScore = 0;
  let negativeScore = 0;

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
    }
  }

  const score = Math.max(-80, Math.min(70, positiveScore - negativeScore));
  const reasons: DiscoveryReason[] = [];

  if (positiveScore >= 24) {
    reasons.push(simpleReason("matches your recent picks"));
  } else if (positiveScore >= 10) {
    reasons.push(simpleReason("learned from your clicks"));
  }

  return { reasons, score };
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

function isGenericTerm(value: string) {
  return ["live", "music", "band", "show", "concert", "local"].includes(value);
}
