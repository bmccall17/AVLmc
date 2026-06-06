import type { CommunityCounts } from "@/lib/community";
import type { EventRecord } from "@/lib/events";
import type { MusicConnection, MusicProfileItem } from "@/lib/music";

export type DiscoveryScore = {
  bestBetsScore: number;
  bestMatchScore: number;
  eventId: string;
  reasons: string[];
  spotifyMatched: boolean;
};

export type DiscoveryScoresByEvent = Record<string, DiscoveryScore>;

type ScoreDiscoveryEventsInput = {
  connections?: MusicConnection[];
  counts: Record<string, CommunityCounts | undefined>;
  events: EventRecord[];
  now?: Date;
  profileItems?: MusicProfileItem[];
};

type ProfileTerm = {
  normalized: string;
  weight: number;
};

const MAX_REASONS = 3;

export function scoreDiscoveryEvents({
  connections = [],
  counts,
  events,
  now = new Date(),
  profileItems = [],
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
      const profileScore = scoreSpotifyMatch(event, profileTerms);
      const reasons = compactReasons([
        ...publicScore.reasons,
        ...(profileScore.score > 0 ? ["Spotify artist match"] : []),
      ]);

      return [
        event.id,
        {
          bestBetsScore: publicScore.score,
          bestMatchScore: publicScore.score + profileScore.score,
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
  const reasons = [];

  if (hoursUntil <= 48) {
    reasons.push("happening soon");
  }
  if (fire > 0 || going > 1) {
    reasons.push("high community signal");
  }
  if (notes > 0 || songs > 0 || voices > 0) {
    reasons.push("local context");
  }
  if (reasons.length === 0 && event.tags.length > 0) {
    reasons.push("tag match");
  }

  return {
    reasons,
    score: timingScore + communityScore,
  };
}

function scoreSpotifyMatch(event: EventRecord, terms: ProfileTerm[]) {
  if (terms.length === 0) {
    return { score: 0 };
  }

  const haystack = normalizeText([
    event.artistName,
    event.eventTitle,
    event.venueName,
    ...event.tags,
  ].join(" "));
  let score = 0;

  for (const term of terms) {
    if (term.normalized.length >= 4 && haystack.includes(term.normalized)) {
      score += term.weight;
    }
  }

  return { score: Math.min(score, 80) };
}

function buildProfileTerms(profileItems: MusicProfileItem[]) {
  const weighted = new Map<string, number>();

  for (const item of profileItems) {
    if (item.provider !== "spotify") {
      continue;
    }

    if (item.itemType === "top_artist") {
      addTerm(weighted, item.name, Math.max(18, 46 - item.rank));
    }

    if (item.itemType === "top_track") {
      addTerm(weighted, item.name, Math.max(5, 14 - Math.floor(item.rank / 3)));
      for (const artistName of item.artistNames) {
        addTerm(weighted, artistName, Math.max(12, 30 - Math.floor(item.rank / 2)));
      }
    }
  }

  return Array.from(weighted, ([normalized, weight]) => ({ normalized, weight }));
}

function addTerm(terms: Map<string, number>, value: string, weight: number) {
  const normalized = normalizeText(value).replace(/^the /, "");

  if (normalized.length < 4 || isGenericTerm(normalized)) {
    return;
  }

  terms.set(normalized, Math.max(terms.get(normalized) ?? 0, weight));
}

function compactReasons(reasons: string[]) {
  return Array.from(new Set(reasons)).slice(0, MAX_REASONS);
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
