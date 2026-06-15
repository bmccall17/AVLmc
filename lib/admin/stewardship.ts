import "server-only";
import { query } from "@/lib/db";
import { getDateWindow } from "@/lib/events";
import { listResources, type AdminResource } from "@/lib/admin/resources";

/**
 * Content & data stewardship (PRD 08 / C3, Outcome 6).
 *
 * Record-level operational views of the content ecosystem — events, venues, artists, tags, and
 * external sources — each with origin (provenance), completeness, currency (freshness), and
 * connections to the wider product, plus the curated partner/resource directory and the derived
 * "should be connected but isn't" gaps. All reads stay inside the rolling window and degrade
 * gracefully (a missing optional table yields empty rather than failing the page).
 */

export type FreshnessState = "current" | "aging" | "stale";

export type StewardEvent = {
  id: string;
  title: string;
  venueName: string;
  artistName: string;
  eventDate: string;
  source: string;
  avlgoEventId: string;
  eventUrl: string;
  updatedAt: string;
  daysSinceUpdate: number;
  freshness: FreshnessState;
  issues: string[];
  completeness: number;
  contributions: number;
  reactions: number;
  intents: number;
  interactions: number;
};

export type StewardVenue = {
  venueName: string;
  eventCount: number;
  upcomingCount: number;
  hasCommunity: boolean;
  hasPartnerLink: boolean;
  gaps: string[];
};

export type StewardArtist = {
  name: string;
  eventCount: number;
  hasCommunityContext: boolean;
};

export type StewardTag = {
  tag: string;
  eventCount: number;
  isGeneric: boolean;
};

export type StewardSource = {
  source: string;
  eventCount: number;
  lastIngest: string | null;
  freshness: FreshnessState;
};

export type StewardshipGaps = {
  venuesNoPartner: number;
  venuesNoCommunity: number;
  artistsNoCommunity: number;
  genericTags: number;
  staleEvents: number;
  resourcesNotPublic: number;
};

export type StewardshipData = {
  generatedAt: string;
  events: StewardEvent[];
  venues: StewardVenue[];
  artists: StewardArtist[];
  tags: StewardTag[];
  sources: StewardSource[];
  resources: AdminResource[];
  gaps: StewardshipGaps;
};

const GENERIC_TAGS = new Set([
  "live music",
  "music",
  "event",
  "events",
  "concert",
  "show",
  "live",
  "entertainment",
]);

export async function loadStewardship(): Promise<StewardshipData> {
  const [events, venuesRaw, artists, tags, sources, resources] = await Promise.all([
    loadEvents(),
    loadVenues(),
    loadArtists(),
    loadTags(),
    loadSources(),
    listResources(true),
  ]);

  // Link venues to the partner/resource directory.
  const linkedVenues = new Set(
    resources
      .filter((resource) => resource.status !== "archived" && resource.linkedVenueName)
      .map((resource) => (resource.linkedVenueName as string).toLowerCase())
  );

  const venues: StewardVenue[] = venuesRaw.map((venue) => {
    const hasPartnerLink = linkedVenues.has(venue.venueName.toLowerCase());
    const gaps: string[] = [];
    if (!venue.hasCommunity) gaps.push("No community");
    if (!hasPartnerLink) gaps.push("No partner link");
    return { ...venue, hasPartnerLink, gaps };
  });

  const gaps: StewardshipGaps = {
    venuesNoPartner: venues.filter((venue) => !venue.hasPartnerLink).length,
    venuesNoCommunity: venues.filter((venue) => !venue.hasCommunity).length,
    artistsNoCommunity: artists.filter((artist) => !artist.hasCommunityContext).length,
    genericTags: tags.filter((tag) => tag.isGeneric).length,
    staleEvents: events.filter((event) => event.freshness === "stale").length,
    resourcesNotPublic: resources.filter(
      (resource) => resource.status === "active" && !resource.surfacedPublicly
    ).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    events,
    venues,
    artists,
    tags,
    sources,
    resources,
    gaps,
  };
}

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

async function loadEvents(): Promise<StewardEvent[]> {
  const { start, end } = getDateWindow();
  let rows: EventRow[] = [];
  try {
    const result = await query<EventRow>(
      `
        select
          id, event_title, venue_name, artist_name, event_date, source,
          avlgo_event_id, event_url, image_url, event_time, starts_at, tags, updated_at
        from public.events
        where event_date >= $1::date and event_date <= $2::date
        order by event_date asc
        limit 500
      `,
      [ymd(start), ymd(end)]
    );
    rows = result.rows;
  } catch {
    return [];
  }

  const [contributions, reactions, intents, interactions] = await Promise.all([
    countByEvent("contributions", "and c.status = 'visible'"),
    countByEvent("reactions"),
    countByEvent("event_intents"),
    countByEvent("event_interaction_events"),
  ]);

  return rows.map((row) => {
    const issues = detectIssues(row);
    const updatedAt = toIso(row.updated_at);
    const daysSinceUpdate = daysSince(row.updated_at);
    return {
      id: row.id,
      title: row.event_title,
      venueName: row.venue_name,
      artistName: row.artist_name,
      eventDate: dbDate(row.event_date),
      source: row.source,
      avlgoEventId: row.avlgo_event_id,
      eventUrl: row.event_url,
      updatedAt,
      daysSinceUpdate,
      freshness: freshnessFromDays(daysSinceUpdate),
      issues,
      completeness: Math.round(((4 - issues.length) / 4) * 100),
      contributions: contributions.get(row.id) ?? 0,
      reactions: reactions.get(row.id) ?? 0,
      intents: intents.get(row.id) ?? 0,
      interactions: interactions.get(row.id) ?? 0,
    };
  });
}

/**
 * Grouped per-event counts bounded to the rolling window via a join to events. `table` is one of a
 * fixed allowlist of literals — never caller input — so there is no injection surface.
 */
async function countByEvent(
  table: "contributions" | "reactions" | "event_intents" | "event_interaction_events",
  extra = ""
): Promise<Map<string, number>> {
  const { start, end } = getDateWindow();
  const sql = `
    select c.event_id as event_id, count(*)::int as count
    from public.${table} c
    join public.events e on e.id = c.event_id
    where e.event_date >= $1::date and e.event_date <= $2::date ${extra}
    group by c.event_id
  `;
  try {
    const result = await query<{ event_id: string; count: number }>(sql, [ymd(start), ymd(end)]);
    const map = new Map<string, number>();
    for (const row of result.rows) map.set(row.event_id, Number(row.count));
    return map;
  } catch {
    return new Map();
  }
}

function detectIssues(row: EventRow): string[] {
  const issues: string[] = [];
  if (!row.image_url) issues.push("Missing image");
  if (!row.event_time && !row.starts_at) issues.push("Missing time");
  if (!row.tags || row.tags.length === 0) issues.push("No tags");
  const url = (row.event_url ?? "").toLowerCase();
  if (
    /^https?:\/\/[^/]+\/?$/.test(url) ||
    url.endsWith("/events") ||
    url.endsWith("/events/") ||
    url.endsWith("/calendar") ||
    url.endsWith("/calendar/")
  ) {
    issues.push("Generic URL");
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/*  Venues / artists / tags / sources                                  */
/* ------------------------------------------------------------------ */

async function loadVenues(): Promise<Omit<StewardVenue, "hasPartnerLink" | "gaps">[]> {
  const now = new Date();
  const { start, end } = getDateWindow();
  let rows: VenueRow[] = [];
  try {
    const result = await query<VenueRow>(
      `
        select
          venue_name,
          count(*)::int as event_count,
          count(*) filter (where event_date >= $3::date)::int as upcoming_count
        from public.events
        where event_date >= $1::date and event_date <= $2::date
        group by venue_name
        order by count(*) desc
      `,
      [ymd(start), ymd(end), ymd(now)]
    );
    rows = result.rows;
  } catch {
    return [];
  }

  let communityVenues = new Set<string>();
  try {
    const result = await query<{ venue_name: string }>(
      `
        select distinct e.venue_name
        from public.contributions c
        join public.events e on e.id = c.event_id
        where e.event_date >= $1::date and e.event_date <= $2::date
          and c.status = 'visible'
      `,
      [ymd(start), ymd(end)]
    );
    communityVenues = new Set(result.rows.map((row) => row.venue_name));
  } catch {
    /* contributions table may be absent */
  }

  return rows.map((row) => ({
    venueName: row.venue_name,
    eventCount: Number(row.event_count),
    upcomingCount: Number(row.upcoming_count),
    hasCommunity: communityVenues.has(row.venue_name),
  }));
}

async function loadArtists(): Promise<StewardArtist[]> {
  const { start, end } = getDateWindow();
  let rows: Array<{ artist_name: string; event_count: number }> = [];
  try {
    const result = await query<{ artist_name: string; event_count: number }>(
      `
        select artist_name, count(*)::int as event_count
        from public.events
        where event_date >= $1::date and event_date <= $2::date
          and artist_name <> ''
        group by artist_name
        order by count(*) desc
        limit 300
      `,
      [ymd(start), ymd(end)]
    );
    rows = result.rows;
  } catch {
    return [];
  }

  let communityArtists = new Set<string>();
  try {
    const result = await query<{ artist_name: string }>(
      `
        select distinct e.artist_name
        from public.contributions c
        join public.events e on e.id = c.event_id
        where e.event_date >= $1::date and e.event_date <= $2::date
          and c.status = 'visible'
      `,
      [ymd(start), ymd(end)]
    );
    communityArtists = new Set(result.rows.map((row) => row.artist_name));
  } catch {
    /* graceful */
  }

  return rows.map((row) => ({
    name: row.artist_name,
    eventCount: Number(row.event_count),
    hasCommunityContext: communityArtists.has(row.artist_name),
  }));
}

async function loadTags(): Promise<StewardTag[]> {
  const { start, end } = getDateWindow();
  try {
    const result = await query<{ tag: string; event_count: number }>(
      `
        select unnest(tags) as tag, count(*)::int as event_count
        from public.events
        where event_date >= $1::date and event_date <= $2::date
        group by unnest(tags)
        order by count(*) desc
      `,
      [ymd(start), ymd(end)]
    );
    return result.rows.map((row) => ({
      tag: row.tag,
      eventCount: Number(row.event_count),
      isGeneric: GENERIC_TAGS.has(row.tag.trim().toLowerCase()),
    }));
  } catch {
    return [];
  }
}

async function loadSources(): Promise<StewardSource[]> {
  const { start, end } = getDateWindow();
  try {
    const result = await query<{ source: string; event_count: number; last_ingest: Date | string | null }>(
      `
        select source, count(*)::int as event_count, max(updated_at) as last_ingest
        from public.events
        where event_date >= $1::date and event_date <= $2::date
        group by source
        order by count(*) desc
      `,
      [ymd(start), ymd(end)]
    );
    return result.rows.map((row) => {
      const days = row.last_ingest ? daysSince(row.last_ingest) : Infinity;
      return {
        source: row.source,
        eventCount: Number(row.event_count),
        lastIngest: row.last_ingest ? toIso(row.last_ingest) : null,
        freshness: freshnessFromDays(days),
      };
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type EventRow = {
  id: string;
  event_title: string;
  venue_name: string;
  artist_name: string;
  event_date: Date | string;
  source: string;
  avlgo_event_id: string;
  event_url: string;
  image_url: string | null;
  event_time: string | null;
  starts_at: Date | string | null;
  tags: string[];
  updated_at: Date | string;
};

type VenueRow = { venue_name: string; event_count: number; upcoming_count: number };

function freshnessFromDays(days: number): FreshnessState {
  if (days < 2) return "current";
  if (days < 7) return "aging";
  return "stale";
}

function daysSince(value: Date | string): number {
  const then = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
}

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dbDate(value: Date | string): string {
  return value instanceof Date ? ymd(value) : String(value).slice(0, 10);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
