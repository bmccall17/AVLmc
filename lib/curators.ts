import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import {
  buildCuratorTopList,
  cleanBio,
  cleanDisplayName,
  isValidHandle,
  normalizeHandle,
  type CuratorPickStatus,
  type CuratedBy,
  type CuratorStatus,
  type CuratorTopListEntry,
  type PublicCurator,
} from "@/lib/curators-core";

/**
 * Curator & Influencer Profiles service (PRD 25 / C3).
 *
 * Owns the admin-promoted curator persona (`curators`) and per-show picks (`curator_picks`).
 * Public reads expose ONLY the persona + visible picks (never a curator's private going/firing,
 * never a non-curator listener, never tokens/PII). Admin writes are reached only through the
 * admin-cookie-gated route. Following a curator is the C1 `listener_follows` edge — a curator is a
 * special followee. Reads tolerate not-yet-migrated tables (42P01) and degrade to empty.
 */

export type { CuratorStatus, CuratorPickStatus, PublicCurator, CuratorTopListEntry, CuratedBy };

export type CuratorPick = {
  id: string;
  eventId: string;
  eventTitle: string;
  note: string | null;
  artistName: string | null;
  venueName: string | null;
  imageUrl: string | null;
  eventDate: string | null;
};

export type CuratorDirectoryEntry = PublicCurator & { pickCount: number };

export type CuratorProfile = {
  curator: PublicCurator;
  /** The underlying user id — needed by the FollowButton to create the C1 edge. Not PII. */
  userId: string;
  topList: CuratorTopListEntry[];
  picks: CuratorPick[];
};

class CuratorValidationError extends Error {}
export { CuratorValidationError };

type CuratorRow = {
  id: string;
  user_id: number;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  status: CuratorStatus;
};

type PickRow = {
  id: string;
  event_id: string;
  event_title: string;
  note: string | null;
  artist_name: string | null;
  venue_name: string | null;
  image_url: string | null;
  event_date: Date | string | null;
  tags: string[] | null;
};

/* ---- Public reads --------------------------------------------------------------- */

/** Active curators for the public directory, with their visible pick counts. */
export async function listCurators(): Promise<CuratorDirectoryEntry[]> {
  try {
    const result = await query<CuratorRow & { pick_count: number | string }>(
      `
        select c.id, c.user_id, c.handle, c.display_name, c.bio, c.avatar_url, c.status,
          count(p.id) filter (where p.status = 'visible')::int as pick_count
        from public.curators c
        left join public.curator_picks p on p.curator_id = c.id
        where c.status = 'active'
        group by c.id
        order by pick_count desc, c.display_name asc
      `
    );
    return result.rows.map((row) => ({ ...toPublicCurator(row), pickCount: Number(row.pick_count ?? 0) }));
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/** Full public profile for an active curator: persona + derived top-list + visible picks. */
export async function getCuratorProfile(rawHandle: string): Promise<CuratorProfile | null> {
  const handle = normalizeHandle(rawHandle);
  if (!isValidHandle(handle)) {
    return null;
  }

  try {
    const curatorResult = await query<CuratorRow>(
      `
        select id, user_id, handle, display_name, bio, avatar_url, status
        from public.curators
        where handle = $1 and status = 'active'
        limit 1
      `,
      [handle]
    );
    const curatorRow = curatorResult.rows[0];
    if (!curatorRow) {
      return null;
    }

    const picksResult = await query<PickRow>(
      `
        select p.id, p.event_id, p.event_title, p.note,
          e.artist_name, e.venue_name, e.image_url, e.event_date, e.tags
        from public.curator_picks p
        left join public.events e on e.id = p.event_id
        where p.curator_id = $1 and p.status = 'visible'
        order by p.created_at desc
      `,
      [curatorRow.id]
    );

    const picks = picksResult.rows.map(mapPickRow);
    const topList = buildCuratorTopList(
      picksResult.rows.map((row) => ({
        eventId: row.event_id,
        eventTitle: row.event_title,
        artistName: row.artist_name,
        venueName: row.venue_name,
        tags: row.tags,
        note: row.note,
      }))
    );

    return {
      curator: toPublicCurator(curatorRow),
      userId: String(curatorRow.user_id),
      topList,
      picks,
    };
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

/** Batched "curated by" lookup for the board / event detail: active curators with a visible pick. */
export async function getCuratedByForEvents(eventIds: string[]): Promise<Record<string, CuratedBy[]>> {
  const uniqueIds = Array.from(new Set(eventIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  try {
    const result = await query<{ event_id: string; handle: string; display_name: string }>(
      `
        select p.event_id, c.handle, c.display_name
        from public.curator_picks p
        join public.curators c on c.id = p.curator_id and c.status = 'active'
        where p.event_id = any($1::text[]) and p.status = 'visible'
        order by c.display_name asc
      `,
      [uniqueIds]
    );

    const byEvent: Record<string, CuratedBy[]> = {};
    for (const row of result.rows) {
      (byEvent[row.event_id] ??= []).push({ handle: row.handle, displayName: row.display_name });
    }
    return byEvent;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return {};
    }
    throw error;
  }
}

/**
 * For the C4 socialCircle signal: the events a viewer's FOLLOWED curators have visibly picked,
 * keyed by event id. Joins the C1 follow edge (viewer → curator's user) against active curators with
 * visible picks. Empty for anonymous callers; an unfollowed curator's pick never appears here.
 */
export async function getFollowedCuratorPicks(
  viewerId: string | null | undefined,
  eventIds: string[]
): Promise<Record<string, CuratedBy[]>> {
  const viewer = Number(viewerId);
  const uniqueIds = Array.from(new Set(eventIds)).filter(Boolean);
  if (!Number.isInteger(viewer) || viewer < 1 || uniqueIds.length === 0) {
    return {};
  }

  try {
    const result = await query<{ event_id: string; handle: string; display_name: string }>(
      `
        select p.event_id, c.handle, c.display_name
        from public.curator_picks p
        join public.curators c on c.id = p.curator_id and c.status = 'active'
        join public.listener_follows f
          on f.followee_user_id = c.user_id and f.follower_user_id = $1 and f.status = 'active'
        where p.event_id = any($2::text[]) and p.status = 'visible'
        order by c.display_name asc
      `,
      [viewer, uniqueIds]
    );

    const byEvent: Record<string, CuratedBy[]> = {};
    for (const row of result.rows) {
      (byEvent[row.event_id] ??= []).push({ handle: row.handle, displayName: row.display_name });
    }
    return byEvent;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return {};
    }
    throw error;
  }
}

/* ---- Admin writes (reached only through the admin-gated route) ------------------ */

export async function promoteCurator(input: {
  userId: number;
  handle: string;
  displayName?: string | null;
  bio?: string | null;
}): Promise<PublicCurator> {
  const handle = normalizeHandle(input.handle);
  if (!isValidHandle(handle)) {
    throw new CuratorValidationError("Handle must be 3–40 chars: lowercase letters, digits, - or _.");
  }
  if (!Number.isInteger(input.userId) || input.userId < 1) {
    throw new CuratorValidationError("A valid userId is required.");
  }

  try {
    const result = await query<CuratorRow>(
      `
        insert into public.curators (id, user_id, handle, display_name, bio)
        values ($1, $2, $3, $4, $5)
        on conflict (user_id) do update
          set handle = excluded.handle,
            display_name = excluded.display_name,
            bio = excluded.bio,
            status = 'active',
            updated_at = now()
        returning id, user_id, handle, display_name, bio, avatar_url, status
      `,
      [randomUUID(), input.userId, handle, cleanDisplayName(input.displayName, handle), cleanBio(input.bio)]
    );
    return toPublicCurator(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CuratorValidationError("That handle is already taken.");
    }
    if (isForeignKeyViolation(error)) {
      throw new CuratorValidationError("That user does not exist.");
    }
    throw error;
  }
}

export async function setCuratorStatus(id: string, status: CuratorStatus): Promise<boolean> {
  const result = await query(
    `update public.curators set status = $2, updated_at = now() where id = $1`,
    [id, status]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function addCuratorPick(input: {
  curatorId: string;
  eventId: string;
  eventTitle?: string;
  note?: string | null;
}): Promise<boolean> {
  const eventId = input.eventId?.trim();
  if (!input.curatorId || !eventId) {
    throw new CuratorValidationError("A curatorId and eventId are required.");
  }

  await query(
    `
      insert into public.curator_picks (id, curator_id, event_id, event_title, note)
      values ($1, $2, $3, $4, $5)
      on conflict (curator_id, event_id) do update
        set note = excluded.note,
          event_title = excluded.event_title,
          status = 'visible'
    `,
    [randomUUID(), input.curatorId, eventId, input.eventTitle ?? "", cleanBio(input.note)]
  );
  return true;
}

export async function setPickStatus(id: string, status: CuratorPickStatus): Promise<boolean> {
  const result = await query(
    `update public.curator_picks set status = $2 where id = $1`,
    [id, status]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Admin listing (includes hidden curators) for the management surface. */
export async function listCuratorsForAdmin(): Promise<Array<PublicCurator & { id: string; userId: string; status: CuratorStatus }>> {
  try {
    const result = await query<CuratorRow>(
      `
        select id, user_id, handle, display_name, bio, avatar_url, status
        from public.curators
        order by created_at desc
      `
    );
    return result.rows.map((row) => ({
      ...toPublicCurator(row),
      id: row.id,
      userId: String(row.user_id),
      status: row.status,
    }));
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/* ---- Mapping & error helpers ---------------------------------------------------- */

function toPublicCurator(row: CuratorRow): PublicCurator {
  return {
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
  };
}

function mapPickRow(row: PickRow): CuratorPick {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    note: row.note,
    artistName: row.artist_name,
    venueName: row.venue_name,
    imageUrl: row.image_url,
    eventDate: row.event_date instanceof Date ? row.event_date.toISOString() : row.event_date,
  };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function isToleratedSchemaError(error: unknown): boolean {
  return hasErrorCode(error, "42P01") || hasErrorCode(error, "42703");
}

function isUniqueViolation(error: unknown): boolean {
  return hasErrorCode(error, "23505");
}

function isForeignKeyViolation(error: unknown): boolean {
  return hasErrorCode(error, "23503");
}
