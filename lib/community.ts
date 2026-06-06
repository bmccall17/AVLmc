import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

export type ContributionType = "song" | "comment" | "voice";
export type ContributionStatus = "visible" | "hidden" | "pending";
export type ReactionType = "going" | "fire";

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
};

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

  const reactionCounts = await query<{
    event_id: string;
    going: number | string;
    fire: number | string;
  }>(
    `
      select
        event_id,
        count(*) filter (where type = 'going')::int as going,
        count(*) filter (where type = 'fire')::int as fire
      from public.reactions
      where event_id = any($1::text[])
      group by event_id
    `,
    [uniqueEventIds]
  );

  for (const row of reactionCounts.rows) {
    countsByEvent[row.event_id] = {
      ...countsByEvent[row.event_id],
      going: toNumber(row.going),
      fire: toNumber(row.fire),
    };
  }

  return countsByEvent;
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
  const result = await query<CountRow>(
    `
      with contribution_counts as (
        select
          count(*) filter (where type = 'song')::int as songs,
          count(*) filter (where type = 'comment')::int as notes,
          count(*) filter (where type = 'voice')::int as voices
        from public.contributions
        where event_id = $1
          and status = 'visible'
      ),
      reaction_counts as (
        select
          count(*) filter (where type = 'going')::int as going,
          count(*) filter (where type = 'fire')::int as fire
        from public.reactions
        where event_id = $1
      )
      select
        contribution_counts.songs,
        contribution_counts.notes,
        contribution_counts.voices,
        reaction_counts.going,
        reaction_counts.fire
      from contribution_counts
      cross join reaction_counts
    `,
    [eventId]
  );

  return mapCountRow(result.rows[0]);
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

function emptyCounts(): CommunityCounts {
  return {
    songs: 0,
    notes: 0,
    voices: 0,
    going: 0,
    fire: 0,
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
