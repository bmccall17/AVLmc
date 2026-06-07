import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

export type ContributionType = "song" | "comment" | "voice";
export type ContributionStatus = "visible" | "hidden" | "pending";
export type ReactionType = "going" | "fire";
export type EventIntentSource = "avlmc" | "spotify" | "ticket_click";

export type Contribution = {
  id: string;
  eventId: string;
  eventTitle: string;
  type: ContributionType;
  displayName: string | null;
  bodyText: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songUrl: string | null;
  musicProvider: string | null;
  musicProviderItemId: string | null;
  musicProviderUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  sessionId: string;
  userId: string | null;
  createdAt: string;
  status: ContributionStatus;
};

export type Reaction = {
  id: string;
  eventId: string;
  eventTitle: string;
  type: ReactionType;
  sessionId: string;
  userId: string | null;
  createdAt: string;
};

export type CommunityCounts = {
  songs: number;
  notes: number;
  voices: number;
  going: number;
  fire: number;
  goingSources: Record<EventIntentSource, number>;
};

export type EventCommunity = CommunityCounts & {
  contributions: Contribution[];
};

export type PublicContribution = Omit<Contribution, "sessionId" | "userId">;

export type PublicEventCommunity = CommunityCounts & {
  contributions: PublicContribution[];
};

type ContributionRow = {
  id: string;
  event_id: string;
  event_title: string;
  type: ContributionType;
  display_name: string | null;
  body_text: string | null;
  song_title: string | null;
  song_artist: string | null;
  song_url: string | null;
  music_provider?: string | null;
  music_provider_item_id?: string | null;
  music_provider_url?: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  session_id: string;
  user_id: number | string | null;
  created_at: Date | string;
  status: ContributionStatus;
};

type CountRow = {
  event_id?: string;
  songs: number | string | null;
  notes: number | string | null;
  voices: number | string | null;
  going: number | string | null;
  fire: number | string | null;
  going_avlmc?: number | string | null;
  going_spotify?: number | string | null;
  going_ticket_click?: number | string | null;
};

const INTENT_SOURCES = new Set<EventIntentSource>(["avlmc", "spotify", "ticket_click"]);

const MAX_RECENT_CONTRIBUTIONS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function getCommunityForEvent(eventId: string): Promise<EventCommunity> {
  const [counts, contributions] = await Promise.all([
    getCountsForEvent(eventId),
    listVisibleContributionsForEvent(eventId),
  ]);

  return {
    ...counts,
    contributions,
  };
}

export async function getCommunityCountsForEvent(eventId: string) {
  return getCountsForEvent(eventId);
}

export async function getCommunityCountsByEvent(eventIds: string[]) {
  const uniqueEventIds = Array.from(new Set(eventIds));

  if (uniqueEventIds.length === 0) {
    return {};
  }

  const countsByEvent: Record<string, CommunityCounts> = Object.fromEntries(
    uniqueEventIds.map((eventId) => [eventId, emptyCounts()])
  );

  const contributionCounts = await query<{
    event_id: string;
    songs: number | string;
    notes: number | string;
    voices: number | string;
  }>(
    `
      select
        event_id,
        count(*) filter (where type = 'song')::int as songs,
        count(*) filter (where type = 'comment')::int as notes,
        count(*) filter (where type = 'voice')::int as voices
      from public.contributions
      where status = 'visible'
        and event_id = any($1::text[])
      group by event_id
    `,
    [uniqueEventIds]
  );

  for (const row of contributionCounts.rows) {
    countsByEvent[row.event_id] = {
      ...countsByEvent[row.event_id],
      songs: toNumber(row.songs),
      notes: toNumber(row.notes),
      voices: toNumber(row.voices),
    };
  }

  const reactionCounts = await queryIntentCountsByEvent(uniqueEventIds);

  for (const row of reactionCounts.rows) {
    if (!row.event_id || !countsByEvent[row.event_id]) {
      continue;
    }

    countsByEvent[row.event_id] = {
      ...countsByEvent[row.event_id],
      ...mapReactionCountRow(row),
    };
  }

  const fireCounts = await queryFireCountsByEvent(uniqueEventIds);
  for (const row of fireCounts.rows) {
    if (!countsByEvent[row.event_id]) {
      continue;
    }

    countsByEvent[row.event_id] = {
      ...countsByEvent[row.event_id],
      fire: toNumber(row.fire),
    };
  }

  return countsByEvent;
}

export async function recordEventIntent(input: {
  eventId: string;
  eventTitle: string;
  source: EventIntentSource;
  sessionId: string;
  userId?: string | null;
}) {
  if (!INTENT_SOURCES.has(input.source)) {
    throw new Error("Unsupported intent source.");
  }

  const databaseUserId = toNullableUserId(input.userId);
  const identityKey = databaseUserId ? `user:${databaseUserId}` : `session:${input.sessionId}`;
  const insertSql = `
    insert into public.event_intents (
      id,
      event_id,
      event_title,
      source,
      session_id,
      user_id,
      identity_key
    )
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (event_id, identity_key) do update
      set event_title = excluded.event_title,
        source = excluded.source,
        session_id = excluded.session_id,
        user_id = excluded.user_id,
        updated_at = now()
  `;
  const values = [
    randomUUID(),
    input.eventId,
    input.eventTitle,
    input.source,
    input.sessionId,
    databaseUserId,
    identityKey,
  ];

  try {
    await query(insertSql, values);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    if (input.source === "avlmc") {
      await insertLegacyReaction({
        eventId: input.eventId,
        eventTitle: input.eventTitle,
        sessionId: input.sessionId,
        type: "going",
        userId: input.userId,
      });
    }
  }

  return getCountsForEvent(input.eventId);
}

export async function recordTicketIntent(input: {
  eventId: string;
  eventTitle: string;
  sessionId: string;
  userId?: string | null;
}) {
  return recordEventIntent({ ...input, source: "ticket_click" });
}

async function queryIntentCountsByEvent(eventIds: string[]) {
  try {
    return await query<CountRow>(
      `
        select
          event_id,
          count(*)::int as going,
          count(*) filter (where source = 'avlmc')::int as going_avlmc,
          count(*) filter (where source = 'spotify')::int as going_spotify,
          count(*) filter (where source = 'ticket_click')::int as going_ticket_click,
          0::int as fire
        from public.event_intents
        where event_id = any($1::text[])
        group by event_id
      `,
      [eventIds]
    );
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    return query<CountRow>(
      `
        select
          event_id,
          count(*) filter (where type = 'going')::int as going,
          count(*) filter (where type = 'going')::int as going_avlmc,
          0::int as going_spotify,
          0::int as going_ticket_click,
          count(*) filter (where type = 'fire')::int as fire
        from public.reactions
        where event_id = any($1::text[])
        group by event_id
      `,
      [eventIds]
    );
  }
}

async function queryFireCountsByEvent(eventIds: string[]) {
  return query<{ event_id: string; fire: number | string }>(
    `
      select
        event_id,
        count(*) filter (where type = 'fire')::int as fire
      from public.reactions
      where event_id = any($1::text[])
      group by event_id
    `,
    [eventIds]
  );
}

export async function listContributions(status?: ContributionStatus) {
  const result = await queryContributions(
    `
      select COLUMNS
      from public.contributions
      where ($1::text is null or status = $1)
      order by created_at desc
    `,
    [status ?? null]
  );

  return result.rows.map(mapContributionRow);
}

export async function createContribution(input: {
  eventId: string;
  eventTitle: string;
  type: ContributionType;
  displayName?: string | null;
  bodyText?: string | null;
  songTitle?: string | null;
  songArtist?: string | null;
  songUrl?: string | null;
  musicProvider?: string | null;
  musicProviderItemId?: string | null;
  musicProviderUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
  sessionId: string;
  userId?: string | null;
}) {
  await assertRateLimit(input.sessionId);

  const insertSql = `
    insert into public.contributions (
      id,
      event_id,
      event_title,
      type,
      display_name,
      body_text,
      song_title,
      song_artist,
      song_url,
      music_provider,
      music_provider_item_id,
      music_provider_url,
      audio_url,
      duration_seconds,
      session_id,
      user_id,
      status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'visible')
    returning ${contributionColumns}
  `;
  const legacyInsertSql = `
    insert into public.contributions (
        id,
        event_id,
        event_title,
        type,
        display_name,
        body_text,
        song_title,
        song_artist,
        song_url,
        audio_url,
        duration_seconds,
        session_id,
        user_id,
        status
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $13, $14, $15, $16, 'visible')
    returning ${legacyContributionColumns}
  `;
  const values = [
    randomUUID(),
    input.eventId,
    input.eventTitle,
    input.type,
    cleanOptional(input.displayName, 64),
    cleanOptional(input.bodyText, 600),
    cleanOptional(input.songTitle, 140),
    cleanOptional(input.songArtist, 140),
    cleanOptional(input.songUrl, 500),
    cleanOptional(input.musicProvider, 40),
    cleanOptional(input.musicProviderItemId, 160),
    cleanOptional(input.musicProviderUrl, 500),
    cleanOptional(input.audioUrl, 500),
    input.durationSeconds ?? null,
    input.sessionId,
    toNullableUserId(input.userId),
  ];
  const result = await queryContributionInsert(insertSql, legacyInsertSql, values);

  return mapContributionRow(result.rows[0]);
}

export async function toggleReaction(input: {
  eventId: string;
  eventTitle: string;
  type: ReactionType;
  sessionId: string;
  userId?: string | null;
}) {
  if (input.type === "going") {
    return recordEventIntent({ ...input, source: "avlmc" });
  }

  await insertLegacyReaction(input);

  return getCountsForEvent(input.eventId);
}

export async function setContributionStatus(id: string, status: ContributionStatus) {
  const result = await queryContributionUpdate(
    `
      update public.contributions
      set status = $2
      where id = $1
      returning COLUMNS
    `,
    [id, status]
  );

  return result.rows[0] ? mapContributionRow(result.rows[0]) : null;
}

export function publicContribution(contribution: Contribution): PublicContribution {
  const { sessionId, userId, ...safe } = contribution;
  void sessionId;
  void userId;
  return safe;
}

const contributionColumns = `
  id,
  event_id,
  event_title,
  type,
  display_name,
  body_text,
  song_title,
  song_artist,
  song_url,
  music_provider,
  music_provider_item_id,
  music_provider_url,
  audio_url,
  duration_seconds,
  session_id,
  user_id,
  created_at,
  status
`;

const legacyContributionColumns = `
  id,
  event_id,
  event_title,
  type,
  display_name,
  body_text,
  song_title,
  song_artist,
  song_url,
  null::text as music_provider,
  null::text as music_provider_item_id,
  null::text as music_provider_url,
  audio_url,
  duration_seconds,
  session_id,
  user_id,
  created_at,
  status
`;

async function listVisibleContributionsForEvent(eventId: string) {
  const result = await queryContributions(
    `
      select COLUMNS
      from public.contributions
      where event_id = $1
        and status = 'visible'
      order by created_at desc
    `,
    [eventId]
  );

  return result.rows.map(mapContributionRow);
}

async function queryContributions(sql: string, values: unknown[]) {
  try {
    return await query<ContributionRow>(sql.replace("COLUMNS", contributionColumns), values);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return query<ContributionRow>(sql.replace("COLUMNS", legacyContributionColumns), values);
  }
}

async function queryContributionUpdate(sql: string, values: unknown[]) {
  try {
    return await query<ContributionRow>(sql.replace("COLUMNS", contributionColumns), values);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return query<ContributionRow>(sql.replace("COLUMNS", legacyContributionColumns), values);
  }
}

async function queryContributionInsert(sql: string, legacySql: string, values: unknown[]) {
  try {
    return await query<ContributionRow>(sql, values);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return query<ContributionRow>(legacySql, values);
  }
}

async function getCountsForEvent(eventId: string): Promise<CommunityCounts> {
  const [contributionCounts, intentCounts, fireCounts] = await Promise.all([
    query<CountRow>(
      `
        select
          count(*) filter (where type = 'song')::int as songs,
          count(*) filter (where type = 'comment')::int as notes,
          count(*) filter (where type = 'voice')::int as voices,
          0::int as going,
          0::int as fire
        from public.contributions
        where event_id = $1
          and status = 'visible'
      `,
      [eventId]
    ),
    queryIntentCountsByEvent([eventId]),
    queryFireCountsByEvent([eventId]),
  ]);
  const counts = {
    ...mapCountRow(contributionCounts.rows[0]),
    ...mapReactionCountRow(intentCounts.rows[0]),
  };

  return {
    ...counts,
    fire: toNumber(fireCounts.rows[0]?.fire),
  };
}

async function insertLegacyReaction(input: {
  eventId: string;
  eventTitle: string;
  type: ReactionType;
  sessionId: string;
  userId?: string | null;
}) {
  await query(
    `
      insert into public.reactions (id, event_id, event_title, type, session_id, user_id)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (event_id, type, session_id) do nothing
    `,
    [
      randomUUID(),
      input.eventId,
      input.eventTitle,
      input.type,
      input.sessionId,
      toNullableUserId(input.userId),
    ]
  );
}

async function assertRateLimit(sessionId: string) {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const result = await query<{ count: number | string }>(
    `
      select count(*)::int as count
      from public.contributions
      where session_id = $1
        and created_at >= $2
    `,
    [sessionId, cutoff]
  );

  if (toNumber(result.rows[0]?.count) >= MAX_RECENT_CONTRIBUTIONS) {
    throw new Error("Please slow down and try again in a few minutes.");
  }
}

function mapContributionRow(row: ContributionRow): Contribution {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    type: row.type,
    displayName: row.display_name,
    bodyText: row.body_text,
    songTitle: row.song_title,
    songArtist: row.song_artist,
    songUrl: row.song_url,
    musicProvider: row.music_provider ?? null,
    musicProviderItemId: row.music_provider_item_id ?? null,
    musicProviderUrl: row.music_provider_url ?? null,
    audioUrl: row.audio_url,
    durationSeconds: row.duration_seconds,
    sessionId: row.session_id,
    userId: row.user_id === null ? null : String(row.user_id),
    createdAt: toIsoString(row.created_at),
    status: row.status,
  };
}

function mapCountRow(row: CountRow | undefined): CommunityCounts {
  if (!row) {
    return emptyCounts();
  }

  return {
    songs: toNumber(row.songs),
    notes: toNumber(row.notes),
    voices: toNumber(row.voices),
    going: toNumber(row.going),
    fire: toNumber(row.fire),
    goingSources: {
      avlmc: toNumber(row.going_avlmc),
      spotify: toNumber(row.going_spotify),
      ticket_click: toNumber(row.going_ticket_click),
    },
  };
}

function mapReactionCountRow(row: CountRow | undefined): Pick<CommunityCounts, "going" | "goingSources"> {
  if (!row) {
    return {
      going: 0,
      goingSources: emptyGoingSources(),
    };
  }

  return {
    going: toNumber(row.going),
    goingSources: {
      avlmc: toNumber(row.going_avlmc),
      spotify: toNumber(row.going_spotify),
      ticket_click: toNumber(row.going_ticket_click),
    },
  };
}

function isMissingColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42703"
  );
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

function emptyCounts(): CommunityCounts {
  return {
    songs: 0,
    notes: 0,
    voices: 0,
    going: 0,
    fire: 0,
    goingSources: emptyGoingSources(),
  };
}

function emptyGoingSources(): Record<EventIntentSource, number> {
  return {
    avlmc: 0,
    spotify: 0,
    ticket_click: 0,
  };
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function cleanOptional(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

function toNullableUserId(userId: string | null | undefined) {
  if (!userId) {
    return null;
  }

  const parsed = Number(userId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
