export type EventRecord = {
  id: string;
  avlgoEventId: string;
  artistName: string;
  eventTitle: string;
  venueName: string;
  eventDate: string;
  eventTime: string | null;
  startsAt: string | null;
  eventUrl: string;
  imageUrl: string | null;
  source: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type RawSeedEvent = {
  avlgoEventId: string;
  artistName: string;
  eventTitle: string;
  venueName: string;
  dayOffset: number;
  eventTime: string | null;
  eventUrl: string;
  imageUrl?: string | null;
  tags: string[];
};

type RawAvlgoEvent = Record<string, unknown>;

const AVLGO_EXPORT_URL = "https://www.avlgo.com/api/export/json";
const LIVE_MUSIC_TAG = "Live Music";

const MUSIC_TAGS = [
  "music",
  "live music",
  "concert",
  "band",
  "dj",
  "singer",
  "songwriter",
  "jam",
  "choir",
  "open mic",
  "festival"
];

const seedEvents: RawSeedEvent[] = [
  {
    avlgoEventId: "electric-feels-indie-rock-electronic-dance-party",
    artistName: "Electric Feels",
    eventTitle: "Electric Feels: Indie Rock & Electronic Dance Party",
    venueName: "The Orange Peel",
    dayOffset: 2,
    eventTime: "8:30 PM",
    eventUrl:
      "https://www.avlgo.com/events/electric-feels-indie-rock-electronic-dance-party-2026-04-24-850de0",
    imageUrl: null,
    tags: ["Dance", "Nightlife", "Live Music", "DJ"]
  },
  {
    avlgoEventId: "golden-hour-thursdays-at-the-mule",
    artistName: "Golden Hour",
    eventTitle: "Golden Hour: Thursdays at The Mule",
    venueName: "The Mule at Devil's Foot Beverage",
    dayOffset: 5,
    eventTime: "8:00 PM",
    eventUrl:
      "https://www.avlgo.com/events/golden-hour-thursdays-at-the-mule-2026-05-14-8e1e14",
    imageUrl: null,
    tags: ["Nightlife", "Cocktail Bar", "Thursday"]
  },
  {
    avlgoEventId: "cosmic-charlie-grey-eagle",
    artistName: "Cosmic Charlie",
    eventTitle: "Cosmic Charlie",
    venueName: "Grey Eagle Music Hall",
    dayOffset: 9,
    eventTime: "6:00 PM",
    eventUrl: "https://www.avlgo.com/events",
    imageUrl: null,
    tags: ["Live Music", "Concert", "Jam Band"]
  },
  {
    avlgoEventId: "firecracker-jazz-band",
    artistName: "Firecracker Jazz Band",
    eventTitle: "Firecracker Jazz Band",
    venueName: "The Crow & Quill",
    dayOffset: 12,
    eventTime: "9:00 PM",
    eventUrl: "https://www.avlgo.com/events",
    imageUrl: null,
    tags: ["Live Music", "Jazz", "Local"]
  },
  {
    avlgoEventId: "past-proof-event",
    artistName: "Past Proof Event",
    eventTitle: "Past Proof Event",
    venueName: "Hidden Test Venue",
    dayOffset: -2,
    eventTime: "7:00 PM",
    eventUrl: "https://www.avlgo.com/events",
    imageUrl: null,
    tags: ["Live Music"]
  }
];

export function getDateWindow(now = new Date()) {
  const start = atLocalMidnight(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 21);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getUpcomingEvents(now = new Date()): Promise<EventRecord[]> {
  const rawEvents = await getRawEvents(now);
  const normalized = rawEvents
    .map((event) => normalizeEvent(event, now))
    .filter((event): event is EventRecord => Boolean(event))
    .filter(isMusicEvent)
    .filter((event) => isInsideRollingWindow(event, now))
    .filter((event) => isNotPastEvent(event, now));

  return dedupeEvents(normalized).sort(compareByDateTime);
}

export async function getEventById(id: string): Promise<EventRecord | null> {
  const events = await getUpcomingEvents();
  return events.find((event) => event.id === id) ?? null;
}

export function getEmptyUpcomingEventsForPreview(): EventRecord[] {
  return [];
}

async function getRawEvents(now: Date): Promise<Array<RawSeedEvent | RawAvlgoEvent>> {
  const apiUrl = process.env.AVLGO_API_URL ?? buildAvlgoLiveFeedUrl(now);

  try {
    const response = await fetch(apiUrl, { next: { revalidate: 3600 } });
    if (!response.ok) {
      return seedEvents;
    }

    const payload = await response.json();
    if (Array.isArray(payload)) {
      return payload as RawAvlgoEvent[];
    }
    if (Array.isArray(payload.events)) {
      return payload.events as RawAvlgoEvent[];
    }
    if (Array.isArray(payload.data)) {
      return payload.data as RawAvlgoEvent[];
    }
  } catch {
    return seedEvents;
  }

  return seedEvents;
}

function buildAvlgoLiveFeedUrl(now: Date) {
  const { start, end } = getDateWindow(now);
  const url = new URL(AVLGO_EXPORT_URL);

  url.searchParams.set("dateFilter", "custom");
  url.searchParams.set("dateStart", formatYmd(start));
  url.searchParams.set("dateEnd", formatYmd(end));
  url.searchParams.set("tagsInclude", LIVE_MUSIC_TAG);
  url.searchParams.set("useDefaultFilters", "true");
  url.searchParams.set("showDailyEvents", "false");

  return url.toString();
}

function normalizeEvent(raw: RawSeedEvent | RawAvlgoEvent, now: Date): EventRecord | null {
  if (isSeedEvent(raw)) {
    const eventDate = dateFromOffset(now, raw.dayOffset);
    const timestamp = new Date().toISOString();

    return {
      id: slugify(raw.avlgoEventId),
      avlgoEventId: raw.avlgoEventId,
      artistName: raw.artistName,
      eventTitle: raw.eventTitle,
      venueName: raw.venueName,
      eventDate,
      eventTime: raw.eventTime,
      startsAt: getSeedStartsAt(eventDate, raw.eventTime),
      eventUrl: raw.eventUrl,
      imageUrl: raw.imageUrl ?? null,
      source: "AVLgo seed feed",
      tags: raw.tags,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  const avlgoEventId = getString(raw, [
    "id",
    "avlgo_event_id",
    "avlgoEventId",
    "sourceId",
    "source_id",
    "external_id",
    "slug"
  ]);
  const eventTitle = getString(raw, ["event_title", "eventTitle", "title", "name"]);
  const artistName = getString(raw, ["artist_name", "artistName", "artist", "performer", "host"]);
  const venueName = getVenueName(raw);
  const eventDate = getEventDate(raw);
  const eventTime =
    getString(raw, ["event_time", "eventTime", "time", "start_time"]) ?? getEventTime(raw);
  const startsAt = getEventStartsAt(raw);
  const eventUrl = normalizeUrl(
    getString(raw, ["event_url", "eventUrl", "url", "source_url", "originalUrl"])
  );
  const imageUrl = normalizeUrl(getString(raw, ["image_url", "imageUrl", "image", "photo", "thumbnail"]));
  const sourceName = getString(raw, ["source"]) ?? "AVLgo live feed";
  const tags = getTags(raw);
  const createdAt = getString(raw, ["created_at", "createdAt"]) ?? new Date().toISOString();
  const updatedAt = getString(raw, ["updated_at", "updatedAt"]) ?? createdAt;

  if (!avlgoEventId || !eventTitle || !venueName || !eventDate || !eventUrl) {
    return null;
  }

  return {
    id: slugify(String(avlgoEventId)),
    avlgoEventId: String(avlgoEventId),
    artistName: artistName ?? eventTitle,
    eventTitle,
    venueName,
    eventDate,
    eventTime,
    startsAt,
    eventUrl,
    imageUrl: imageUrl ?? null,
    source: sourceName === "AVLgo live feed" ? sourceName : `AVLgo live feed: ${sourceName}`,
    tags,
    createdAt,
    updatedAt
  };
}

function isSeedEvent(raw: RawSeedEvent | RawAvlgoEvent): raw is RawSeedEvent {
  return (
    typeof raw.avlgoEventId === "string" &&
    typeof raw.artistName === "string" &&
    typeof raw.eventTitle === "string" &&
    typeof raw.venueName === "string" &&
    typeof raw.dayOffset === "number" &&
    Array.isArray(raw.tags)
  );
}

function isMusicEvent(event: EventRecord) {
  if (event.tags.some((tag) => tag.toLowerCase() === LIVE_MUSIC_TAG.toLowerCase())) {
    return true;
  }

  const haystack = [event.eventTitle, event.artistName, ...event.tags]
    .join(" ")
    .toLowerCase();

  return MUSIC_TAGS.some((tag) => haystack.includes(tag));
}

function isInsideRollingWindow(event: EventRecord, now: Date) {
  const { start, end } = getDateWindow(now);
  const eventDate = new Date(`${event.eventDate}T00:00:00`);
  return eventDate >= start && eventDate <= end;
}

function isNotPastEvent(event: EventRecord, now: Date) {
  if (!event.startsAt) {
    return true;
  }

  return new Date(event.startsAt).getTime() >= now.getTime();
}

function dedupeEvents(events: EventRecord[]) {
  const byAvlgoId = new Map<string, EventRecord>();

  for (const event of events) {
    byAvlgoId.set(event.avlgoEventId, event);
  }

  return Array.from(byAvlgoId.values());
}

function compareByDateTime(a: EventRecord, b: EventRecord) {
  if (a.startsAt && b.startsAt) {
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  }

  const aDate = new Date(`${a.eventDate}T${timeTo24Hour(a.eventTime)}`);
  const bDate = new Date(`${b.eventDate}T${timeTo24Hour(b.eventTime)}`);
  return aDate.getTime() - bDate.getTime();
}

function getSeedStartsAt(eventDate: string, eventTime: string | null) {
  if (!eventTime) {
    return null;
  }

  return new Date(`${eventDate}T${timeTo24Hour(eventTime)}`).toISOString();
}

function dateFromOffset(now: Date, offset: number) {
  const date = atLocalMidnight(now);
  date.setDate(date.getDate() + offset);
  return formatYmd(date);
}

function atLocalMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getString(raw: RawAvlgoEvent, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

function normalizeUrl(value: string | null) {
  if (!value) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return new URL(value, "https://www.avlgo.com").toString();
  }

  return value;
}

function getVenueName(raw: RawAvlgoEvent) {
  const direct = getString(raw, ["venue_name", "venueName", "venue", "location_name", "location"]);
  if (direct) {
    return direct.split(",")[0]?.trim() || direct;
  }

  const location = raw.location;
  if (typeof location === "object" && location) {
    return getString(location as RawAvlgoEvent, ["name", "title", "address"]);
  }

  return null;
}

function getEventDate(raw: RawAvlgoEvent) {
  const dateValue = getString(raw, [
    "event_date",
    "eventDate",
    "date",
    "startDate",
    "starts_at",
    "startsAt",
    "start"
  ]);

  if (!dateValue) {
    return null;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue.slice(0, 10);
  }

  return formatYmdInTimeZone(parsed, "America/New_York");
}

function getEventTime(raw: RawAvlgoEvent) {
  if (raw.timeUnknown === true) {
    return null;
  }

  const dateValue = getString(raw, ["startDate", "starts_at", "startsAt", "start"]);
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  }).format(parsed);
}

function getEventStartsAt(raw: RawAvlgoEvent) {
  if (raw.timeUnknown === true) {
    return null;
  }

  const dateValue = getString(raw, ["startDate", "starts_at", "startsAt", "start"]);
  if (!dateValue) {
    return null;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getTags(raw: RawAvlgoEvent) {
  const value = raw.tags ?? raw.categories ?? raw.category;
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function timeTo24Hour(value: string | null) {
  if (!value) {
    return "23:59:00";
  }

  const parsed = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!parsed) {
    return "23:59:00";
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

  return `${String(hour).padStart(2, "0")}:${minute}:00`;
}

function formatYmd(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatYmdInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(date);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
