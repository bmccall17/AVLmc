import { query } from "@/lib/db";
import { getDateWindow, getAvlgoFeedSource, isUsingCustomAvlgoFeed } from "@/lib/events";
import {
  buildEventDuplicateAudit,
  type EventDuplicateAuditGroup,
} from "@/lib/event-dedupe";
import { getAuthFeatureFlags } from "@/lib/auth-flags";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AdminEventStats = {
  totalEvents: number;
  eventsBySource: Array<{ source: string; count: number }>;
  dateRange: { start: string; end: string };
  upcomingCount: number;
  pastCount: number;
};

export type AdminFieldCompleteness = {
  total: number;
  missingImage: number;
  missingTime: number;
  weakUrl: number;
  emptyTags: number;
  genericTagsOnly: number;
};

export type AdminVenueStat = {
  venueName: string;
  eventCount: number;
  hasUpcoming: boolean;
  hasCommunity: boolean;
};

export type AdminContributionStats = {
  total: number;
  songs: number;
  notes: number;
  voices: number;
  visible: number;
  hidden: number;
  pending: number;
};

export type AdminReactionStats = {
  totalGoing: number;
  totalFire: number;
  goingBySource: Record<string, number>;
};

export type AdminUserStats = {
  totalUsers: number;
  usersWithMusicConnection: number;
  usersWithProfileItems: number;
};

export type AdminMusicConnectionStats = {
  total: number;
  active: number;
  disconnected: number;
  byProvider: Array<{ provider: string; count: number }>;
};

export type AdminMetadataStats = {
  totalArtists: number;
  totalTags: number;
};

export type AdminWeakEvent = {
  id: string;
  eventTitle: string;
  venueName: string;
  eventDate: string;
  issues: string[];
};

export type AdminInteractionStats = {
  total: number;
  byAction: Array<{ action: string; count: number }>;
};

export type AdminSystemStatus = {
  avlgoFeedUrl: string;
  isCustomFeed: boolean;
  spotifyEnabled: boolean;
  authEnabled: boolean;
  databaseConnected: boolean;
};

export type AdminDashboardData = {
  eventStats: AdminEventStats;
  fieldCompleteness: AdminFieldCompleteness;
  venues: AdminVenueStat[];
  contributionStats: AdminContributionStats;
  reactionStats: AdminReactionStats;
  userStats: AdminUserStats;
  musicConnectionStats: AdminMusicConnectionStats;
  metadataStats: AdminMetadataStats;
  duplicateGroups: EventDuplicateAuditGroup[];
  weakEvents: AdminWeakEvent[];
  interactionStats: AdminInteractionStats;
  systemStatus: AdminSystemStatus;
};

/* ------------------------------------------------------------------ */
/*  Main loader                                                        */
/* ------------------------------------------------------------------ */

export async function loadAdminDashboardData(): Promise<AdminDashboardData> {
  const [
    eventStats,
    fieldCompleteness,
    venues,
    contributionStats,
    reactionStats,
    userStats,
    musicConnectionStats,
    metadataStats,
    duplicateGroups,
    weakEvents,
    interactionStats,
  ] = await Promise.all([
    getEventStats(),
    getFieldCompleteness(),
    getVenueStats(),
    getContributionStats(),
    getReactionStats(),
    getUserStats(),
    getMusicConnectionStats(),
    getMetadataStats(),
    getDuplicateEventGroups(),
    getWeakMetadataEvents(),
    getInteractionStats(),
  ]);

  return {
    eventStats,
    fieldCompleteness,
    venues,
    contributionStats,
    reactionStats,
    userStats,
    musicConnectionStats,
    metadataStats,
    duplicateGroups,
    weakEvents,
    interactionStats,
    systemStatus: getSystemStatus(),
  };
}

/* ------------------------------------------------------------------ */
/*  Event statistics                                                   */
/* ------------------------------------------------------------------ */

async function getEventStats(): Promise<AdminEventStats> {
  const { start, end } = getDateWindow();
  const now = new Date();

  const result = await query<{
    total: string;
    upcoming: string;
    past: string;
  }>(
    `
      select
        count(*)::int as total,
        count(*) filter (where event_date >= $1::date)::int as upcoming,
        count(*) filter (where event_date < $1::date)::int as past
      from public.events
      where event_date >= $2::date and event_date <= $3::date
    `,
    [formatYmd(now), formatYmd(start), formatYmd(end)]
  );

  const sourceResult = await query<{ source: string; count: string }>(
    `
      select source, count(*)::int as count
      from public.events
      where event_date >= $1::date and event_date <= $2::date
      group by source
      order by count desc
    `,
    [formatYmd(start), formatYmd(end)]
  );

  return {
    totalEvents: toNum(result.rows[0]?.total),
    eventsBySource: sourceResult.rows.map((row) => ({
      source: row.source,
      count: toNum(row.count),
    })),
    dateRange: { start: formatYmd(start), end: formatYmd(end) },
    upcomingCount: toNum(result.rows[0]?.upcoming),
    pastCount: toNum(result.rows[0]?.past),
  };
}

/* ------------------------------------------------------------------ */
/*  Field completeness                                                 */
/* ------------------------------------------------------------------ */

async function getFieldCompleteness(): Promise<AdminFieldCompleteness> {
  const { start, end } = getDateWindow();

  const result = await query<{
    total: string;
    missing_image: string;
    missing_time: string;
    weak_url: string;
    empty_tags: string;
  }>(
    `
      select
        count(*)::int as total,
        count(*) filter (where image_url is null or image_url = '')::int as missing_image,
        count(*) filter (where event_time is null and starts_at is null)::int as missing_time,
        count(*) filter (
          where event_url ~ '^https?://[^/]+/?$'
            or event_url ~ '/events/?$'
            or event_url ~ '/calendar/?$'
        )::int as weak_url,
        count(*) filter (where tags = '{}')::int as empty_tags
      from public.events
      where event_date >= $1::date and event_date <= $2::date
    `,
    [formatYmd(start), formatYmd(end)]
  );

  const row = result.rows[0];

  return {
    total: toNum(row?.total),
    missingImage: toNum(row?.missing_image),
    missingTime: toNum(row?.missing_time),
    weakUrl: toNum(row?.weak_url),
    emptyTags: toNum(row?.empty_tags),
    genericTagsOnly: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Venue stats                                                        */
/* ------------------------------------------------------------------ */

async function getVenueStats(): Promise<AdminVenueStat[]> {
  const now = new Date();
  const { start, end } = getDateWindow();

  const result = await query<{
    venue_name: string;
    event_count: string;
    has_upcoming: boolean;
  }>(
    `
      select
        venue_name,
        count(*)::int as event_count,
        bool_or(event_date >= $3::date) as has_upcoming
      from public.events
      where event_date >= $1::date and event_date <= $2::date
      group by venue_name
      order by count(*) desc
    `,
    [formatYmd(start), formatYmd(end), formatYmd(now)]
  );

  const venueNames = result.rows.map((row) => row.venue_name);

  let communityVenues = new Set<string>();
  if (venueNames.length > 0) {
    try {
      const communityResult = await query<{ venue_name: string }>(
        `
          select distinct e.venue_name
          from public.contributions c
          join public.events e on e.id = c.event_id
          where e.venue_name = any($1::text[])
            and c.status = 'visible'
        `,
        [venueNames]
      );
      communityVenues = new Set(communityResult.rows.map((r) => r.venue_name));
    } catch {
      /* contributions table may not exist yet */
    }
  }

  return result.rows.map((row) => ({
    venueName: row.venue_name,
    eventCount: toNum(row.event_count),
    hasUpcoming: row.has_upcoming,
    hasCommunity: communityVenues.has(row.venue_name),
  }));
}

/* ------------------------------------------------------------------ */
/*  Contribution stats                                                 */
/* ------------------------------------------------------------------ */

async function getContributionStats(): Promise<AdminContributionStats> {
  try {
    const result = await query<{
      total: string;
      songs: string;
      notes: string;
      voices: string;
      visible: string;
      hidden: string;
      pending: string;
    }>(
      `
        select
          count(*)::int as total,
          count(*) filter (where type = 'song')::int as songs,
          count(*) filter (where type = 'comment')::int as notes,
          count(*) filter (where type = 'voice')::int as voices,
          count(*) filter (where status = 'visible')::int as visible,
          count(*) filter (where status = 'hidden')::int as hidden,
          count(*) filter (where status = 'pending')::int as pending
        from public.contributions
      `
    );

    const row = result.rows[0];
    return {
      total: toNum(row?.total),
      songs: toNum(row?.songs),
      notes: toNum(row?.notes),
      voices: toNum(row?.voices),
      visible: toNum(row?.visible),
      hidden: toNum(row?.hidden),
      pending: toNum(row?.pending),
    };
  } catch {
    return { total: 0, songs: 0, notes: 0, voices: 0, visible: 0, hidden: 0, pending: 0 };
  }
}

/* ------------------------------------------------------------------ */
/*  Reaction / intent stats                                            */
/* ------------------------------------------------------------------ */

async function getReactionStats(): Promise<AdminReactionStats> {
  let totalGoing = 0;
  let totalFire = 0;
  const goingBySource: Record<string, number> = {};

  try {
    const intentResult = await query<{
      total: string;
      avlmc: string;
      spotify: string;
      ticket_click: string;
    }>(
      `
        select
          count(*)::int as total,
          count(*) filter (where source = 'avlmc')::int as avlmc,
          count(*) filter (where source = 'spotify')::int as spotify,
          count(*) filter (where source = 'ticket_click')::int as ticket_click
        from public.event_intents
      `
    );

    const row = intentResult.rows[0];
    totalGoing = toNum(row?.total);
    goingBySource.avlmc = toNum(row?.avlmc);
    goingBySource.spotify = toNum(row?.spotify);
    goingBySource.ticket_click = toNum(row?.ticket_click);
  } catch {
    try {
      const legacyResult = await query<{ going: string; fire: string }>(
        `
          select
            count(*) filter (where type = 'going')::int as going,
            count(*) filter (where type = 'fire')::int as fire
          from public.reactions
        `
      );
      totalGoing = toNum(legacyResult.rows[0]?.going);
      totalFire = toNum(legacyResult.rows[0]?.fire);
    } catch {
      /* tables may not exist */
    }
  }

  try {
    const fireResult = await query<{ fire: string }>(
      `
        select count(*) filter (where type = 'fire')::int as fire
        from public.reactions
      `
    );
    totalFire = toNum(fireResult.rows[0]?.fire);
  } catch {
    /* reactions table may not exist */
  }

  return { totalGoing, totalFire, goingBySource };
}

/* ------------------------------------------------------------------ */
/*  User stats                                                         */
/* ------------------------------------------------------------------ */

async function getUserStats(): Promise<AdminUserStats> {
  try {
    const result = await query<{
      total: string;
      with_music: string;
      with_profile: string;
    }>(
      `
        select
          (select count(*)::int from public.users) as total,
          (select count(distinct user_id)::int from public.music_connections where disconnected_at is null) as with_music,
          (select count(distinct user_id)::int from public.music_profile_items) as with_profile
      `
    );

    const row = result.rows[0];
    return {
      totalUsers: toNum(row?.total),
      usersWithMusicConnection: toNum(row?.with_music),
      usersWithProfileItems: toNum(row?.with_profile),
    };
  } catch {
    return { totalUsers: 0, usersWithMusicConnection: 0, usersWithProfileItems: 0 };
  }
}

/* ------------------------------------------------------------------ */
/*  Music connection stats                                             */
/* ------------------------------------------------------------------ */

async function getMusicConnectionStats(): Promise<AdminMusicConnectionStats> {
  try {
    const result = await query<{
      total: string;
      active: string;
      disconnected: string;
    }>(
      `
        select
          count(*)::int as total,
          count(*) filter (where disconnected_at is null)::int as active,
          count(*) filter (where disconnected_at is not null)::int as disconnected
        from public.music_connections
      `
    );

    const providerResult = await query<{ provider: string; count: string }>(
      `
        select provider, count(*)::int as count
        from public.music_connections
        where disconnected_at is null
        group by provider
      `
    );

    const row = result.rows[0];
    return {
      total: toNum(row?.total),
      active: toNum(row?.active),
      disconnected: toNum(row?.disconnected),
      byProvider: providerResult.rows.map((r) => ({
        provider: r.provider,
        count: toNum(r.count),
      })),
    };
  } catch {
    return { total: 0, active: 0, disconnected: 0, byProvider: [] };
  }
}

/* ------------------------------------------------------------------ */
/*  Metadata stats                                                     */
/* ------------------------------------------------------------------ */

async function getMetadataStats(): Promise<AdminMetadataStats> {
  const { start, end } = getDateWindow();

  try {
    const result = await query<{
      artists: string;
      tags: string;
    }>(
      `
        select
          (select count(distinct artist_name)::int from public.events where event_date >= $1::date and event_date <= $2::date) as artists,
          (select count(distinct unnest(tags))::int from public.events where event_date >= $1::date and event_date <= $2::date) as tags
      `,
      [formatYmd(start), formatYmd(end)]
    );

    const row = result.rows[0];
    return {
      totalArtists: toNum(row?.artists),
      totalTags: toNum(row?.tags),
    };
  } catch {
    return { totalArtists: 0, totalTags: 0 };
  }
}

/* ------------------------------------------------------------------ */
/*  Duplicate detection                                                */
/* ------------------------------------------------------------------ */

async function getDuplicateEventGroups(): Promise<EventDuplicateAuditGroup[]> {
  const { start, end } = getDateWindow();

  try {
    const result = await query<{
      id: string;
      avlgo_event_id: string;
      event_title: string;
      venue_name: string;
      event_date: Date | string;
      event_time: string | null;
      starts_at: Date | string | null;
      event_url: string;
      image_url: string | null;
      source: string;
      tags: string[];
      updated_at: Date | string;
    }>(
      `
        select
          id, avlgo_event_id, event_title, venue_name, event_date,
          event_time, starts_at, event_url, image_url, source, tags, updated_at
        from public.events
        where event_date >= $1::date and event_date <= $2::date
        order by event_date asc
      `,
      [formatYmd(start), formatYmd(end)]
    );

    const events = result.rows.map((row) => ({
      id: row.id,
      avlgoEventId: row.avlgo_event_id,
      eventTitle: row.event_title,
      venueName: row.venue_name,
      eventDate: formatDbDate(row.event_date),
      eventTime: row.event_time,
      startsAt: row.starts_at ? toIso(row.starts_at) : null,
      eventUrl: row.event_url,
      imageUrl: row.image_url,
      source: row.source,
      tags: row.tags,
      updatedAt: toIso(row.updated_at),
    }));

    return buildEventDuplicateAudit(events);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Weak metadata events                                               */
/* ------------------------------------------------------------------ */

async function getWeakMetadataEvents(): Promise<AdminWeakEvent[]> {
  const { start, end } = getDateWindow();

  try {
    const result = await query<{
      id: string;
      event_title: string;
      venue_name: string;
      event_date: Date | string;
      image_url: string | null;
      event_time: string | null;
      starts_at: Date | string | null;
      event_url: string;
      tags: string[];
    }>(
      `
        select id, event_title, venue_name, event_date, image_url,
               event_time, starts_at, event_url, tags
        from public.events
        where event_date >= $1::date and event_date <= $2::date
          and (
            image_url is null
            or image_url = ''
            or (event_time is null and starts_at is null)
            or tags = '{}'
            or event_url ~ '^https?://[^/]+/?$'
            or event_url ~ '/events/?$'
          )
        order by event_date asc
        limit 100
      `,
      [formatYmd(start), formatYmd(end)]
    );

    return result.rows.map((row) => ({
      id: row.id,
      eventTitle: row.event_title,
      venueName: row.venue_name,
      eventDate: formatDbDate(row.event_date),
      issues: detectIssues(row),
    }));
  } catch {
    return [];
  }
}

function detectIssues(row: {
  image_url: string | null;
  event_time: string | null;
  starts_at: Date | string | null;
  event_url: string;
  tags: string[];
}): string[] {
  const issues: string[] = [];

  if (!row.image_url) {
    issues.push("Missing image");
  }

  if (!row.event_time && !row.starts_at) {
    issues.push("Missing time");
  }

  if (!row.tags || row.tags.length === 0) {
    issues.push("No tags");
  }

  const url = row.event_url.toLowerCase();
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
/*  Interaction stats                                                  */
/* ------------------------------------------------------------------ */

async function getInteractionStats(): Promise<AdminInteractionStats> {
  try {
    const result = await query<{ action: string; count: string }>(
      `
        select action, count(*)::int as count
        from public.event_interaction_events
        group by action
        order by count desc
      `
    );

    const total = result.rows.reduce((sum, row) => sum + toNum(row.count), 0);

    return {
      total,
      byAction: result.rows.map((row) => ({
        action: row.action,
        count: toNum(row.count),
      })),
    };
  } catch {
    return { total: 0, byAction: [] };
  }
}

/* ------------------------------------------------------------------ */
/*  System status                                                      */
/* ------------------------------------------------------------------ */

function getSystemStatus(): AdminSystemStatus {
  const flags = getAuthFeatureFlags();

  return {
    avlgoFeedUrl: getAvlgoFeedSource(),
    isCustomFeed: isUsingCustomAvlgoFeed(),
    spotifyEnabled: flags.spotify,
    authEnabled: flags.auth,
    databaseConnected: Boolean(process.env.DATABASE_URL),
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toNum(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function formatYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDbDate(value: Date | string): string {
  if (value instanceof Date) {
    return formatYmd(value);
  }
  return String(value).slice(0, 10);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
