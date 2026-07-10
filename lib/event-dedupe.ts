export type CanonicalEventRecord = {
  id: string;
  avlgoEventId: string;
  eventTitle: string;
  venueName: string;
  eventDate: string;
  eventTime: string | null;
  startsAt: string | null;
  eventUrl: string;
  imageUrl: string | null;
  source: string;
  tags: string[];
  updatedAt: string;
};

export type EventDuplicateAuditItem = {
  id: string;
  avlgoEventId: string;
  eventTitle: string;
  venueName: string;
  eventDate: string;
  eventTime: string | null;
  startsAt: string | null;
  source: string;
  eventUrl: string;
  imageUrl: string | null;
  tags: string[];
  quality: EventCanonicalQuality;
};

export type EventDuplicateAuditGroup = {
  groupKey: string;
  canonicalId: string;
  hiddenIds: string[];
  winnerReasons: string[];
  canonical: EventDuplicateAuditItem;
  hidden: EventDuplicateAuditItem[];
};

export type EventCanonicalQuality = {
  eventUrlScore: number;
  imageScore: number;
  usefulTagScore: number;
  titleScore: number;
  sourceScore: number;
  exactStartScore: number;
  updatedAtMs: number;
};

type ScoredEvent<EventType extends CanonicalEventRecord> = {
  event: EventType;
  groupKey: string;
  quality: EventCanonicalQuality;
  startMinuteLabel: string;
  startMinuteOfDay: number | null;
};

type CanonicalEventGroup<EventType extends CanonicalEventRecord> = {
  groupKey: string;
  canonical: ScoredEvent<EventType>;
  hidden: Array<ScoredEvent<EventType>>;
  winnerReasons: string[];
};

export const FUZZY_START_WINDOW_MINUTES = 90;

const LOCAL_TIME_ZONE = "America/New_York";
const GENERIC_TITLE_SUFFIXES = new Set(["band", "show", "event", "concert"]);
const GENERIC_TAGS = new Set(["live music", "music", "event", "events", "nightlife"]);
const ARTICLE_WORDS = new Set(["a", "an", "the"]);

// Each group lists venue strings that name the same physical room across
// upstream feeds (room name vs building name vs promoter label). The first
// entry is the canonical label; matching happens on normalizeVenueKey output,
// so punctuation/article/plural variants of any alias also resolve. Keep this
// table explicit — no fuzzy matching — to avoid over-merging venues that
// merely share a word.
const VENUE_ALIAS_GROUPS: string[][] = [
  ["Hellbender by The Orange Peel", "Hellbender", "The Orange Peel", "115 Thompson Street"],
  ["The Grey Eagle", "The Grey Eagle Music Hall and Pub"],
  ["Wicked Weed Brewing", "Wicked Weed Brewing's Brewpub"],
  ["The Funkatorium", "Wicked Weed Funkatorium"],
  ["WNC Nature Center", "75 Gashes Creek Rd"],
  ["NC Arboretum", "Baker Event Lawn"],
  ["Center For Spiritual Living Asheville", "Community Commons at CSL Ashevill"],
  ["Grovemont Park", 'Grovemont Park (aka "Grovemont Square")', "Friends of Grovemont Park"],
  ["The Mule", "The Mule at Devil's Foot Beverage"],
  ["One World Brewing", "One World Brewing Downtown"],
  ["Hendersonville Main Street", "South Main Street Hendersonville"],
  ["Pack Square Park", "Bascom Lamar Lunsford Stage"],
  ["AyurPrana Listening Room", "312 Haywood Road"],
];

const VENUE_ALIAS_KEY_MAP = new Map<string, string>(
  VENUE_ALIAS_GROUPS.flatMap((group) => {
    const canonicalKey = normalizeVenueKey(group[0]);
    return group.map((alias): [string, string] => [normalizeVenueKey(alias), canonicalKey]);
  })
);

// Support-act phrasing that feeds append after the headliner. Bare " and ",
// "&", and dashes are deliberately excluded: co-bills ("Band A & Band B") key
// on both acts, and dash suffixes distinguish early/late shows.
const SUPPORT_MARKER_PATTERN =
  /\bw\s*\/|\bfeaturing\b|\bfeat\.?\b|\bft\.?\b|\bwith\s+(?:special\s+)?guests?\b|\bwith\s+support\b|\bplus\s+special\s+guests?\b|\s\+\s/i;

export function getCanonicalEvents<EventType extends CanonicalEventRecord>(
  events: EventType[]
): EventType[] {
  return groupCanonicalEvents(events).map((group) => group.canonical.event);
}

export function buildEventDuplicateAudit<EventType extends CanonicalEventRecord>(
  events: EventType[]
): EventDuplicateAuditGroup[] {
  return groupCanonicalEvents(events)
    .filter((group) => group.hidden.length > 0)
    .map((group) => ({
      groupKey: group.groupKey,
      canonicalId: group.canonical.event.id,
      hiddenIds: group.hidden.map((candidate) => candidate.event.id),
      winnerReasons: group.winnerReasons,
      canonical: toAuditItem(group.canonical),
      hidden: group.hidden.map(toAuditItem),
    }));
}

function groupCanonicalEvents<EventType extends CanonicalEventRecord>(
  events: EventType[]
): Array<CanonicalEventGroup<EventType>> {
  const groups = new Map<string, Array<ScoredEvent<EventType>>>();

  for (const event of events) {
    const baseKey = getCanonicalEventBaseKey(event);
    const candidates = groups.get(baseKey) ?? [];
    const startMinuteLabel = getLocalStartMinute(event);
    candidates.push({
      event,
      groupKey: baseKey,
      quality: scoreEventQuality(event),
      startMinuteLabel,
      startMinuteOfDay: minuteLabelToMinuteOfDay(startMinuteLabel),
    });
    groups.set(baseKey, candidates);
  }

  return Array.from(groups.entries()).flatMap(([baseKey, candidates]) =>
    clusterByStartTime(candidates).map((cluster) => {
      const sorted = [...cluster].sort(compareScoredEvents);
      const [canonical, ...hidden] = sorted;

      if (!canonical) {
        throw new Error("Cannot pick a canonical event from an empty group.");
      }

      const groupKey = buildClusterKey(baseKey, cluster);
      for (const candidate of cluster) {
        candidate.groupKey = groupKey;
      }

      const winnerReasons = describeWinner(canonical, hidden);
      if (clusterSpansStartTimes(cluster)) {
        winnerReasons.push(
          `merged: start times within ${FUZZY_START_WINDOW_MINUTES} minutes across sources`
        );
      }

      return { groupKey, canonical, hidden, winnerReasons };
    })
  );
}

function getCanonicalEventBaseKey(event: CanonicalEventRecord) {
  return [
    event.eventDate,
    canonicalVenueKey(event.venueName),
    normalizeTitleCore(event.eventTitle),
  ].join("|");
}

// Chain-clusters a (date, venue, title-core) group by local start time. A timed
// event joins the current cluster only while it stays within
// FUZZY_START_WINDOW_MINUTES of the cluster's earliest member (the anchor), so
// 7:00 + 8:00 merge but 7:00 + 8:15 + 9:30 never collapse into one. TBA events
// join the group's timed cluster only when exactly one exists; otherwise they
// stay together as their own cluster rather than guessing.
function clusterByStartTime<EventType extends CanonicalEventRecord>(
  candidates: Array<ScoredEvent<EventType>>
): Array<Array<ScoredEvent<EventType>>> {
  const timed = candidates
    .filter((candidate) => candidate.startMinuteOfDay !== null)
    .sort(
      (a, b) =>
        (a.startMinuteOfDay ?? 0) - (b.startMinuteOfDay ?? 0) ||
        a.event.id.localeCompare(b.event.id)
    );
  const untimed = candidates.filter((candidate) => candidate.startMinuteOfDay === null);

  const clusters: Array<Array<ScoredEvent<EventType>>> = [];
  let anchorMinute: number | null = null;

  for (const candidate of timed) {
    const minute = candidate.startMinuteOfDay as number;
    if (anchorMinute === null || minute - anchorMinute > FUZZY_START_WINDOW_MINUTES) {
      clusters.push([candidate]);
      anchorMinute = minute;
    } else {
      clusters[clusters.length - 1].push(candidate);
    }
  }

  if (untimed.length > 0) {
    if (clusters.length === 1) {
      clusters[0].push(...untimed);
    } else {
      clusters.push(untimed);
    }
  }

  return clusters;
}

function buildClusterKey<EventType extends CanonicalEventRecord>(
  baseKey: string,
  cluster: Array<ScoredEvent<EventType>>
) {
  const [eventDate, venue, titleCore] = baseKey.split("|");
  const anchorLabel = cluster[0]?.startMinuteLabel ?? "tba";
  return [eventDate, anchorLabel, venue, titleCore].join("|");
}

function clusterSpansStartTimes<EventType extends CanonicalEventRecord>(
  cluster: Array<ScoredEvent<EventType>>
) {
  return new Set(cluster.map((candidate) => candidate.startMinuteLabel)).size > 1;
}

function minuteLabelToMinuteOfDay(label: string) {
  const match = label.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function scoreEventQuality(event: CanonicalEventRecord): EventCanonicalQuality {
  return {
    eventUrlScore: scoreEventUrl(event.eventUrl),
    imageScore: scoreImageUrl(event.imageUrl),
    usefulTagScore: scoreUsefulTags(event.tags),
    titleScore: scoreTitle(event.eventTitle),
    sourceScore: scoreSource(event.source),
    exactStartScore: hasExactStart(event) ? 6 : 0,
    updatedAtMs: parseTimestamp(event.updatedAt),
  };
}

function compareScoredEvents<EventType extends CanonicalEventRecord>(
  a: ScoredEvent<EventType>,
  b: ScoredEvent<EventType>
) {
  const checks = [
    compareDesc(a.quality.eventUrlScore, b.quality.eventUrlScore),
    compareDesc(a.quality.imageScore, b.quality.imageScore),
    compareDesc(a.quality.usefulTagScore, b.quality.usefulTagScore),
    compareDesc(a.quality.titleScore, b.quality.titleScore),
    compareDesc(a.quality.sourceScore, b.quality.sourceScore),
    compareDesc(a.quality.exactStartScore, b.quality.exactStartScore),
    compareDesc(a.quality.updatedAtMs, b.quality.updatedAtMs),
    a.event.id.localeCompare(b.event.id),
  ];

  return checks.find((value) => value !== 0) ?? 0;
}

function compareDesc(a: number, b: number) {
  return b - a;
}

function describeWinner<EventType extends CanonicalEventRecord>(
  canonical: ScoredEvent<EventType>,
  hidden: Array<ScoredEvent<EventType>>
) {
  if (hidden.length === 0) {
    return [];
  }

  const reasons: string[] = [];
  const maxHidden = {
    eventUrlScore: Math.max(...hidden.map((candidate) => candidate.quality.eventUrlScore)),
    imageScore: Math.max(...hidden.map((candidate) => candidate.quality.imageScore)),
    usefulTagScore: Math.max(...hidden.map((candidate) => candidate.quality.usefulTagScore)),
    titleScore: Math.max(...hidden.map((candidate) => candidate.quality.titleScore)),
    sourceScore: Math.max(...hidden.map((candidate) => candidate.quality.sourceScore)),
    exactStartScore: Math.max(...hidden.map((candidate) => candidate.quality.exactStartScore)),
    updatedAtMs: Math.max(...hidden.map((candidate) => candidate.quality.updatedAtMs)),
  };

  if (canonical.quality.eventUrlScore > maxHidden.eventUrlScore) {
    reasons.push("canonical has a stronger direct event URL");
  }
  if (canonical.quality.imageScore > maxHidden.imageScore) {
    reasons.push("canonical has a stronger image");
  }
  if (canonical.quality.usefulTagScore > maxHidden.usefulTagScore) {
    reasons.push("canonical has richer non-generic tags");
  }
  if (canonical.quality.titleScore > maxHidden.titleScore) {
    reasons.push("canonical has a cleaner title");
  }
  if (canonical.quality.sourceScore > maxHidden.sourceScore) {
    reasons.push("canonical has a stronger source");
  }
  if (canonical.quality.exactStartScore > maxHidden.exactStartScore) {
    reasons.push("canonical has an exact start time");
  }
  if (canonical.quality.updatedAtMs > maxHidden.updatedAtMs) {
    reasons.push("canonical was updated more recently");
  }

  return reasons.length > 0 ? reasons : ["canonical won by stable id tiebreaker"];
}

function toAuditItem<EventType extends CanonicalEventRecord>(
  candidate: ScoredEvent<EventType>
): EventDuplicateAuditItem {
  return {
    id: candidate.event.id,
    avlgoEventId: candidate.event.avlgoEventId,
    eventTitle: candidate.event.eventTitle,
    venueName: candidate.event.venueName,
    eventDate: candidate.event.eventDate,
    eventTime: candidate.event.eventTime,
    startsAt: candidate.event.startsAt,
    source: candidate.event.source,
    eventUrl: candidate.event.eventUrl,
    imageUrl: candidate.event.imageUrl,
    tags: candidate.event.tags,
    quality: candidate.quality,
  };
}

function normalizeVenueKey(value: string) {
  return normalizeWords(value, { removeArticles: true }).join(" ");
}

function canonicalVenueKey(value: string) {
  const key = normalizeVenueKey(value);
  return VENUE_ALIAS_KEY_MAP.get(key) ?? key;
}

// Reduces a raw title to its headliner segment so lineup phrasing appended by
// some feeds ("w/Fruit Bats", "with special guests …") doesn't split the
// grouping key. Runs on the raw string because normalizeWords erases the
// punctuation markers ("w/", "+") this relies on.
function extractHeadliner(value: string) {
  let title = value.replace(/^\s*an\s+evening\s+with\s+/i, "");

  const presentsMatch = title.match(/\bpresents:?\s+(.+)$/i);
  if (presentsMatch) {
    title = presentsMatch[1];
  }

  const markerMatch = title.match(SUPPORT_MARKER_PATTERN);
  const headliner = markerMatch ? title.slice(0, markerMatch.index) : title;
  return headliner.trim() ? headliner : title;
}

function normalizeTitleCore(value: string) {
  const tokens = normalizeWords(extractHeadliner(value), { removeArticles: true });

  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const previous = tokens[tokens.length - 2];

    if (last === "music" && previous === "live") {
      tokens.pop();
      tokens.pop();
      continue;
    }

    if (GENERIC_TITLE_SUFFIXES.has(last)) {
      tokens.pop();
      continue;
    }

    break;
  }

  return tokens.join(" ");
}

function normalizeWords(value: string, options: { removeArticles: boolean }) {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => (options.removeArticles ? !ARTICLE_WORDS.has(token) : true))
    .map(normalizePluralToken);
}

function normalizePluralToken(token: string) {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }

  return token;
}

function getLocalStartMinute(event: CanonicalEventRecord) {
  const fromStartsAt = event.startsAt ? localMinuteFromIso(event.startsAt) : null;
  return fromStartsAt ?? parseEventTimeToMinute(event.eventTime) ?? "tba";
}

function localMinuteFromIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: LOCAL_TIME_ZONE,
  }).formatToParts(parsed);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const hour = byType.get("hour") === "24" ? "00" : byType.get("hour");
  const minute = byType.get("minute");

  return hour && minute ? `${hour}:${minute}` : null;
}

function parseEventTimeToMinute(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!parsed) {
    return null;
  }

  let hour = Number(parsed[1]);
  const minute = parsed[2] ?? "00";
  const period = parsed[3]?.toUpperCase();

  if (period === "PM" && hour < 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || Number(minute) > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function scoreEventUrl(value: string) {
  try {
    const url = new URL(value, "https://www.avlgo.com");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();

    if (!path || path === "/" || path === "/events" || path === "/calendar") {
      return 0;
    }

    return 30;
  } catch {
    return value.trim() ? 10 : 0;
  }
}

function scoreImageUrl(value: string | null) {
  if (!value) {
    return 0;
  }

  const lower = value.toLowerCase();
  if (lower.includes("default") || lower.includes("placeholder")) {
    return 0;
  }

  if (isLocalFallbackImage(lower)) {
    return 0;
  }

  return 20;
}

function isLocalFallbackImage(value: string) {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.hostname.endsWith("avlgo.com") && segments.length === 1;
  } catch {
    return false;
  }
}

function scoreUsefulTags(tags: string[]) {
  const usefulTags = new Set(
    tags
      .map((tag) => normalizeWords(tag, { removeArticles: true }).join(" "))
      .filter((tag) => tag && !GENERIC_TAGS.has(tag))
  );

  return Math.min(usefulTags.size * 3, 12);
}

function scoreTitle(value: string) {
  const rawTokens = normalizeWords(value, { removeArticles: true });
  const coreTokens = normalizeTitleCore(value).split(/\s+/).filter(Boolean);

  if (coreTokens.length === 0) {
    return 0;
  }

  return rawTokens.length === coreTokens.length ? 6 : 4;
}

function scoreSource(source: string) {
  const normalized = source.toUpperCase();

  if (normalized.includes("EXPLORE_ASHEVILLE") || normalized.includes("EVENTBRITE")) {
    return 6;
  }
  if (normalized.includes("MOUNTAIN_X")) {
    return 5;
  }
  if (normalized.includes("LIVE_MUSIC_AVL")) {
    return 4;
  }
  if (normalized.includes("AVLGO")) {
    return 3;
  }

  return 1;
}

function hasExactStart(event: CanonicalEventRecord) {
  if (event.startsAt && localMinuteFromIso(event.startsAt)) {
    return true;
  }

  return Boolean(parseEventTimeToMinute(event.eventTime));
}

function parseTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
