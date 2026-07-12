import { unstable_cache } from "next/cache";
import { query } from "@/lib/db";
import {
  buildEventDuplicateAudit,
  getCanonicalEvents,
  type EventDuplicateAuditGroup,
} from "@/lib/event-dedupe";
import {
  createEventReadCache,
  filterNotYetStarted,
  type TaggedCacheFactory,
} from "@/lib/event-read-cache";
import { ingestImageToBlob, deleteImageBlob } from "@/lib/blob-storage";
import {
  emptyImageIngestStats,
  isBlobImageUrl,
  isExpiringImageUrl,
  resolveStoredImageUrl,
  type ImageIngestStats,
} from "@/lib/image-resilience";

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

type RawEventResult = {
  events: Array<RawSeedEvent | RawAvlgoEvent>;
  shouldPersist: boolean;
};

export type EventSyncWithDuplicateAudit = {
  events: EventRecord[];
  duplicateAudit: EventDuplicateAuditGroup[];
  incomingDuplicateAudit: EventDuplicateAuditGroup[];
  storedDuplicateAudit: EventDuplicateAuditGroup[];
  imageStats: ImageIngestStats;
};

export type EventSyncResult = {
  events: EventRecord[];
  imageStats: ImageIngestStats;
};

type EventRow = {
  id: string;
  avlgo_event_id: string;
  artist_name: string;
  event_title: string;
  venue_name: string;
  event_date: Date | string;
  event_time: string | null;
  starts_at: Date | string | null;
  event_url: string;
  image_url: string | null;
  source: string;
  tags: string[];
  created_at: Date | string;
  updated_at: Date | string;
};

const AVLGO_EXPORT_URL = "https://www.avlgo.com/api/export/json";
const LIVE_MUSIC_TAG = "Live Music";
const EVENT_UPSERT_BATCH_SIZE = 100;
const AVLGO_FEED_TIMEOUT_MS = 8_000;
const IMAGE_INGEST_CONCURRENCY = 6;

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

// Cached read path (PRD 51 / ADR 002 §1): the DB reads are day-keyed `unstable_cache` entries
// under the `events` tag — the AVLgo cron revalidates the tag after a successful upsert, and the
// daily `revalidate` is only a backstop. The rows are cached pre-dedupe from local midnight so
// one shared entry serves every viewer; the per-view "already started" filter and canonical
// dedupe replay in-memory, keeping output identical to the uncached query.
const eventReadCache = createEventReadCache<EventRecord, EventRecord>({
  cacheFactory: unstable_cache as TaggedCacheFactory,
  listUpcomingByDay: (dayKey: string) =>
    listUpcomingEventsFromDatabase(dayFromKey(dayKey), { dedupe: false }),
  getById: (id: string) => getEventByIdFromDatabase(id),
});

// Render paths never scrape (PRD 50 / ADR 002 §2): an empty read serves the static seed
// fallback and an unknown id is simply not-found. Ingest is the cron's job only — otherwise
// `/event/<bogus-id>` in a loop is a single-actor scrape/normalize/ingest cost lever.
export async function getUpcomingEvents(now = new Date()): Promise<EventRecord[]> {
  const dayKey = formatYmd(atLocalMidnight(now));
  const storedCandidates = await eventReadCache.readUpcomingByDay(dayKey);
  const storedEvents = getCanonicalEvents(filterNotYetStarted(storedCandidates, now)).sort(
    compareByDateTime
  );

  if (storedEvents.length > 0) {
    return storedEvents;
  }

  return getSeedFallbackEvents(now);
}

export async function getEventById(id: string): Promise<EventRecord | null> {
  return eventReadCache.readById(id);
}

function dayFromKey(dayKey: string) {
  return new Date(`${dayKey}T00:00:00`);
}

export function getSeedFallbackEvents(now = new Date()): EventRecord[] {
  return normalizeEvents(seedEvents, now);
}

export async function syncUpcomingEvents(now = new Date()): Promise<EventRecord[]> {
  const { events } = await syncUpcomingEventsDetailed(now);
  return events;
}

export async function syncUpcomingEventsDetailed(now = new Date()): Promise<EventSyncResult> {
  const { events: rawEvents, shouldPersist } = await getRawEvents(now);
  const normalized = normalizeEvents(rawEvents, now);

  if (shouldPersist && normalized.length > 0) {
    const imageStats = await ingestImagesForEvents(normalized);
    await upsertEvents(normalized);
    return { events: await listUpcomingEventsFromDatabase(now), imageStats };
  }

  return { events: normalized, imageStats: emptyImageIngestStats() };
}

export async function syncUpcomingEventsWithDuplicateAudit(
  now = new Date()
): Promise<EventSyncWithDuplicateAudit> {
  const { events: rawEvents, shouldPersist } = await getRawEvents(now);
  const normalizedCandidates = normalizeEventCandidates(rawEvents, now);
  const incomingDuplicateAudit = buildEventDuplicateAudit(normalizedCandidates);
  const normalized = getCanonicalEvents(normalizedCandidates).sort(compareByDateTime);

  if (shouldPersist && normalized.length > 0) {
    const imageStats = await ingestImagesForEvents(normalized);
    await upsertEvents(normalized);

    const storedCandidates = await listUpcomingEventsFromDatabase(now, { dedupe: false });
    const storedDuplicateAudit = buildEventDuplicateAudit(storedCandidates);

    return {
      events: getCanonicalEvents(storedCandidates).sort(compareByDateTime),
      duplicateAudit: mergeDuplicateAuditGroups(storedDuplicateAudit, incomingDuplicateAudit),
      incomingDuplicateAudit,
      storedDuplicateAudit,
      imageStats,
    };
  }

  return {
    events: normalized,
    duplicateAudit: incomingDuplicateAudit,
    incomingDuplicateAudit,
    storedDuplicateAudit: [],
    imageStats: emptyImageIngestStats(),
  };
}

export function getEmptyUpcomingEventsForPreview(): EventRecord[] {
  return [];
}

export async function cleanupOldEventImages(daysOld = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const result = await query(
    `
      SELECT id, image_url
      FROM public.events
      WHERE event_date < $1
        AND image_url LIKE '%public.blob.vercel-storage.com%'
    `,
    [cutoffStr]
  );

  const deletedIds: string[] = [];

  // Delete blobs in parallel, but DB updates sequentially or in a batch.
  // We'll just do them sequentially to be safe and simple.
  for (const row of result.rows) {
    if (row.image_url) {
      await deleteImageBlob(row.image_url);
      await query(
        `
          UPDATE public.events
          SET image_url = NULL
          WHERE id = $1
        `,
        [row.id]
      );
      deletedIds.push(row.id);
    }
  }

  return { deletedCount: deletedIds.length, deletedIds };
}

export function getAvlgoFeedSource(now = new Date()) {
  return getConfiguredAvlgoApiUrl() ?? buildAvlgoLiveFeedUrl(now);
}

export function isUsingCustomAvlgoFeed() {
  return Boolean(getConfiguredAvlgoApiUrl());
}

async function getRawEvents(now: Date): Promise<RawEventResult> {
  const apiUrl = getAvlgoFeedSource(now);

  try {
    const response = await fetch(apiUrl, {
      next: { revalidate: 3600 },
      // A hung AVLgo feed must abort into the seed fallback, not pin a sync invocation open.
      signal: AbortSignal.timeout(AVLGO_FEED_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { events: seedEvents, shouldPersist: false };
    }

    const payload = await response.json();
    if (Array.isArray(payload)) {
      return { events: payload as RawAvlgoEvent[], shouldPersist: true };
    }
    if (Array.isArray(payload.events)) {
      return { events: payload.events as RawAvlgoEvent[], shouldPersist: true };
    }
    if (Array.isArray(payload.data)) {
      return { events: payload.data as RawAvlgoEvent[], shouldPersist: true };
    }
  } catch {
    return { events: seedEvents, shouldPersist: false };
  }

  return { events: seedEvents, shouldPersist: false };
}

function getConfiguredAvlgoApiUrl() {
  const value = process.env.AVLGO_API_URL?.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const isBareAvlgoSite =
      (url.hostname === "avlgo.com" || url.hostname === "www.avlgo.com") &&
      (url.pathname === "" || url.pathname === "/");

    return isBareAvlgoSite ? null : value;
  } catch {
    return null;
  }
}

function normalizeEvents(rawEvents: Array<RawSeedEvent | RawAvlgoEvent>, now: Date) {
  const normalized = normalizeEventCandidates(rawEvents, now);

  return getCanonicalEvents(normalized).sort(compareByDateTime);
}

function normalizeEventCandidates(rawEvents: Array<RawSeedEvent | RawAvlgoEvent>, now: Date) {
  return rawEvents
    .map((event) => normalizeEvent(event, now))
    .filter((event): event is EventRecord => Boolean(event))
    .filter(isMusicEvent)
    .filter((event) => isInsideRollingWindow(event, now))
    .filter((event) => isNotPastEvent(event, now));
}

async function listUpcomingEventsFromDatabase(now: Date, options?: { dedupe?: boolean }) {
  const { start, end } = getDateWindow(now);
  const result = await query<EventRow>(
    `
      select ${eventColumns}
      from public.events
      where event_date >= $1
        and event_date <= $2
        and (starts_at is null or starts_at >= $3)
      order by coalesce(starts_at, (event_date::timestamp + time '23:59:00')) asc
    `,
    [formatYmd(start), formatYmd(end), now.toISOString()]
  );

  const events = result.rows.map(mapEventRow);
  return options?.dedupe === false
    ? events
    : getCanonicalEvents(events).sort(compareByDateTime);
}

async function getEventByIdFromDatabase(id: string) {
  const result = await query<EventRow>(
    `
      select ${eventColumns}
      from public.events
      where id = $1
      limit 1
    `,
    [id]
  );

  return result.rows[0] ? mapEventRow(result.rows[0]) : null;
}

async function ingestImagesForEvents(events: EventRecord[]): Promise<ImageIngestStats> {
  const stats = emptyImageIngestStats();
  const expiring = events.filter((event) => isExpiringImageUrl(event.imageUrl));
  if (expiring.length === 0) {
    return stats;
  }

  const storedUrlsById = await getStoredImageUrls(expiring.map((event) => event.id));

  // Chunked so a big sync fans out at most IMAGE_INGEST_CONCURRENCY simultaneous remote
  // fetches/uploads instead of one burst per expiring image (PRD 50 / ADR 003 §3).
  for (let i = 0; i < expiring.length; i += IMAGE_INGEST_CONCURRENCY) {
    await Promise.allSettled(
      expiring.slice(i, i + IMAGE_INGEST_CONCURRENCY).map(async (event) => {
        const stored = storedUrlsById.get(event.id) ?? null;

        // Already durably ingested on a previous sync — keep the blob, skip the upload.
        if (isBlobImageUrl(stored)) {
          event.imageUrl = stored;
          stats.reused += 1;
          return;
        }

        const blobUrl = await ingestImageToBlob(event.imageUrl as string, event.id);
        if (blobUrl) {
          event.imageUrl = blobUrl;
          stats.ingested += 1;
          return;
        }

        stats.failed += 1;
        event.imageUrl = resolveStoredImageUrl(stored, event.imageUrl);
        if (!event.imageUrl) {
          stats.deadSkipped += 1;
        }
      })
    );
  }

  return stats;
}

async function getStoredImageUrls(eventIds: string[]): Promise<Map<string, string | null>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  const result = await query<{ id: string; image_url: string | null }>(
    `
      select id, image_url
      from public.events
      where id = any($1)
    `,
    [eventIds]
  );

  return new Map(result.rows.map((row) => [row.id, row.image_url]));
}

export type ImageBackfillResult = {
  scanned: number;
  repaired: number;
  cleared: number;
};

/**
 * One-time repair for rows persisted before the resilience rules existed: re-ingests any stored
 * expiring-CDN URL that still resolves, and clears the rest to NULL so the placeholder renders
 * intentionally instead of a broken image.
 */
export async function backfillDeadImageUrls(): Promise<ImageBackfillResult> {
  const result = await query<{ id: string; image_url: string }>(
    `
      select id, image_url
      from public.events
      where image_url like '%fbcdn.net%'
    `
  );

  let repaired = 0;
  let cleared = 0;
  const updatedAt = new Date().toISOString();

  for (const row of result.rows) {
    const blobUrl = await ingestImageToBlob(row.image_url, row.id);
    await query(
      `
        update public.events
        set image_url = $2, updated_at = $3
        where id = $1
      `,
      [row.id, blobUrl, updatedAt]
    );
    if (blobUrl) {
      repaired += 1;
    } else {
      cleared += 1;
    }
  }

  return { scanned: result.rows.length, repaired, cleared };
}

async function upsertEvents(events: EventRecord[]) {
  const updatedAt = new Date().toISOString();

  for (let index = 0; index < events.length; index += EVENT_UPSERT_BATCH_SIZE) {
    await upsertEventBatch(events.slice(index, index + EVENT_UPSERT_BATCH_SIZE), updatedAt);
  }
}

async function upsertEventBatch(events: EventRecord[], updatedAt: string) {
  const values = events
    .map((_, eventIndex) => {
      const offset = eventIndex * 14;
      const placeholders = Array.from({ length: 14 }, (_value, columnIndex) => `$${offset + columnIndex + 1}`);
      return `(${placeholders.join(", ")})`;
    })
    .join(",\n");
  const params = events.flatMap((event) => [
    event.id,
    event.avlgoEventId,
    event.artistName,
    event.eventTitle,
    event.venueName,
    event.eventDate,
    event.eventTime,
    event.startsAt,
    event.eventUrl,
    event.imageUrl,
    event.source,
    event.tags,
    event.createdAt,
    updatedAt,
  ]);

  await query(
    `
      insert into public.events (
        id,
        avlgo_event_id,
        artist_name,
        event_title,
        venue_name,
        event_date,
        event_time,
        starts_at,
        event_url,
        image_url,
        source,
        tags,
        created_at,
        updated_at
      )
      values ${values}
      on conflict (id) do update set
        avlgo_event_id = excluded.avlgo_event_id,
        artist_name = excluded.artist_name,
        event_title = excluded.event_title,
        venue_name = excluded.venue_name,
        event_date = excluded.event_date,
        event_time = excluded.event_time,
        starts_at = excluded.starts_at,
        event_url = excluded.event_url,
        -- Image precedence (PRD 06; mirrors lib/image-resilience resolveStoredImageUrl):
        -- a stored blob URL is durable and only another blob URL may replace it; a stored
        -- expiring-CDN URL is never worth keeping; otherwise an incoming NULL never erases
        -- a working stored image.
        image_url = case
          when events.image_url like '%blob.vercel-storage.com%'
               and coalesce(excluded.image_url, '') not like '%blob.vercel-storage.com%'
            then events.image_url
          when events.image_url like '%fbcdn.net%'
            then excluded.image_url
          else coalesce(excluded.image_url, events.image_url)
        end,
        source = excluded.source,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `,
    params
  );
}

const eventColumns = `
  id,
  avlgo_event_id,
  artist_name,
  event_title,
  venue_name,
  event_date,
  event_time,
  starts_at,
  event_url,
  image_url,
  source,
  tags,
  created_at,
  updated_at
`;

function mapEventRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    avlgoEventId: row.avlgo_event_id,
    artistName: row.artist_name,
    eventTitle: row.event_title,
    venueName: row.venue_name,
    eventDate: formatDbDate(row.event_date),
    eventTime: row.event_time,
    startsAt: row.starts_at ? toIsoString(row.starts_at) : null,
    eventUrl: row.event_url,
    imageUrl: row.image_url,
    source: row.source,
    tags: row.tags,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function formatDbDate(value: Date | string) {
  if (value instanceof Date) {
    return formatYmd(value);
  }
  return value.slice(0, 10);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

function mergeDuplicateAuditGroups(
  primary: EventDuplicateAuditGroup[],
  secondary: EventDuplicateAuditGroup[]
) {
  const byIdentity = new Map<string, EventDuplicateAuditGroup>();

  for (const group of [...primary, ...secondary]) {
    byIdentity.set(
      [group.groupKey, group.canonicalId, ...group.hiddenIds].join("|"),
      group
    );
  }

  return Array.from(byIdentity.values());
}
