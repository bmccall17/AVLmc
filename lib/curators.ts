import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import {
  buildCuratorTopList,
  canChangeHandle,
  canSelfManageCurator,
  isCuratorActivated,
  cleanApplicationNote,
  cleanAvatarUrl,
  cleanBio,
  cleanDisplayName,
  isSelfServeOpen,
  isValidHandle,
  normalizeHandle,
  type CuratorPickStatus,
  type CuratedBy,
  type CuratorSelfStatus,
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

export type {
  CuratorStatus,
  CuratorSelfStatus,
  CuratorPickStatus,
  PublicCurator,
  CuratorTopListEntry,
  CuratedBy,
};

/** A listener's own curator standing (PRD 29) — `none` plus the persona fields when a row exists. */
export type MyCuratorStatus = {
  status: CuratorSelfStatus;
  handle?: string;
  displayName?: string;
  bio?: string | null;
  note?: string | null;
};

/** A pending self-serve application as the admin review queue sees it (PRD 29). */
export type CuratorApplication = PublicCurator & {
  id: string;
  userId: string;
  note: string | null;
  createdAt: string | null;
};

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

/* ---- Self-serve onboarding (PRD 29; listener plane, requireUserId-gated) --------- */

/**
 * Live self-serve gate state: whether new applications are promoted INSTANTLY (small platform) or
 * routed to admin review, plus the counts that decide it. If the curators table isn't migrated yet
 * we treat the install as brand-new and open. Counts are public aggregates only — no PII.
 */
export async function getSelfServeAvailability(): Promise<{
  open: boolean;
  activeCurators: number;
  users: number;
}> {
  try {
    const result = await query<{ active_curators: number | string; users: number | string }>(
      `
        select
          (select count(*)::int from public.curators where status = 'active') as active_curators,
          (select count(*)::int from public.users) as users
      `
    );
    const activeCurators = Number(result.rows[0]?.active_curators ?? 0);
    const users = Number(result.rows[0]?.users ?? 0);
    return { open: isSelfServeOpen(activeCurators, users), activeCurators, users };
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return { open: true, activeCurators: 0, users: 0 };
    }
    throw error;
  }
}

/**
 * A signed-in listener submits a self-authored curator application. Under the gate it is promoted
 * INSTANTLY (`active`); above it, it lands `pending` for admin review. Always `promoted_by_admin =
 * false`. Guard: a re-submission NEVER changes an admin-controlled state — an already-`active`
 * curator is not downgraded to pending, and an admin-`hidden` curator cannot re-activate itself
 * (admin oversight is never removed). The user id comes from the session, never the request body.
 */
export async function applyForCurator(input: {
  userId: number | string;
  handle: string;
  displayName?: string | null;
  bio?: string | null;
  note?: string | null;
  avatarUrl?: string | null;
}): Promise<{ status: CuratorSelfStatus; handle: string }> {
  const userId = Number(input.userId);
  if (!Number.isInteger(userId) || userId < 1) {
    throw new CuratorValidationError("A valid userId is required.");
  }
  const handle = normalizeHandle(input.handle);
  if (!isValidHandle(handle)) {
    throw new CuratorValidationError("Handle must be 3–40 chars: lowercase letters, digits, - or _.");
  }

  const availability = await getSelfServeAvailability();
  const requestedStatus: CuratorStatus = availability.open ? "active" : "pending";

  try {
    const result = await query<CuratorRow>(
      `
        insert into public.curators
          (id, user_id, handle, display_name, bio, avatar_url, application_note, status, promoted_by_admin)
        values ($1, $2, $3, $4, $5, $6, $7, $8, false)
        on conflict (user_id) do update
          set handle = excluded.handle,
            display_name = excluded.display_name,
            bio = excluded.bio,
            avatar_url = excluded.avatar_url,
            application_note = excluded.application_note,
            -- Preserve admin-controlled states: never self-downgrade an active curator, never
            -- self-un-hide an admin-hidden one. Only new/pending/rejected rows take the gate result.
            status = case
              when public.curators.status in ('active', 'hidden') then public.curators.status
              else excluded.status
            end,
            updated_at = now()
        returning id, user_id, handle, display_name, bio, avatar_url, status
      `,
      [
        randomUUID(),
        userId,
        handle,
        cleanDisplayName(input.displayName, handle),
        cleanBio(input.bio),
        cleanAvatarUrl(input.avatarUrl),
        cleanApplicationNote(input.note),
        requestedStatus,
      ]
    );
    const row = result.rows[0];
    return { status: row.status as CuratorSelfStatus, handle: row.handle };
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

/** A listener's OWN curator standing (PRD 29). `none` when they have no row. Private to the caller. */
export async function getMyCuratorStatus(userId: number | string): Promise<MyCuratorStatus> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    return { status: "none" };
  }
  try {
    const result = await query<CuratorRow & { application_note: string | null }>(
      `
        select id, user_id, handle, display_name, bio, avatar_url, status, application_note
        from public.curators
        where user_id = $1
        limit 1
      `,
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      return { status: "none" };
    }
    return {
      status: row.status as CuratorSelfStatus,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio,
      note: row.application_note,
    };
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return { status: "none" };
    }
    throw error;
  }
}

/** Pending self-serve applications for the admin review queue (PRD 29): persona + pitch + age. */
export async function listCuratorApplications(): Promise<CuratorApplication[]> {
  try {
    const result = await query<
      CuratorRow & { application_note: string | null; created_at: Date | string | null }
    >(
      `
        select id, user_id, handle, display_name, bio, avatar_url, status, application_note, created_at
        from public.curators
        where status = 'pending'
        order by created_at asc
      `
    );
    return result.rows.map((row) => ({
      ...toPublicCurator(row),
      id: row.id,
      userId: String(row.user_id),
      note: row.application_note,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }));
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/* ---- Curator self-management (PRD 31; listener plane, self-scoped to the caller) - */

/** A pick as its OWNING curator manages it — includes hidden picks (not just public/visible ones). */
export type MyCuratorPick = CuratorPick & { status: CuratorPickStatus };

/** The caller's OWN curator record + all their picks (incl. hidden), for the self-management surface. */
export type MyCurator = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: CuratorStatus;
  picks: MyCuratorPick[];
  /** PRD 32: visible-pick count + whether the curator is "activated" (≥ 1 visible pick). */
  visiblePickCount: number;
  activated: boolean;
};

/**
 * Resolve the caller's OWN active curator id from their session user id — the single gate every
 * self-management write passes through. Throws if the caller isn't a curator or the row isn't
 * active (admin moderation overrides; see `canSelfManageCurator`). The curator id is NEVER taken
 * from the request, so a caller can only ever act on their own row.
 */
async function requireOwnActiveCuratorId(userId: number | string): Promise<string> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    throw new CuratorValidationError("A valid userId is required.");
  }
  const result = await query<{ id: string; status: CuratorStatus }>(
    `select id, status from public.curators where user_id = $1 limit 1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) {
    throw new CuratorValidationError("You are not a curator.");
  }
  if (!canSelfManageCurator(row.status)) {
    throw new CuratorValidationError(
      "This curator profile isn't active. An admin must restore it before you can manage it."
    );
  }
  return row.id;
}

/** The caller's own curator + all picks (incl. hidden) for management, or null if they aren't one. */
export async function getMyCurator(userId: number | string): Promise<MyCurator | null> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  try {
    const curatorResult = await query<CuratorRow>(
      `
        select id, user_id, handle, display_name, bio, avatar_url, status
        from public.curators
        where user_id = $1
        limit 1
      `,
      [id]
    );
    const row = curatorResult.rows[0];
    if (!row) {
      return null;
    }
    const picksResult = await query<PickRow & { status: CuratorPickStatus }>(
      `
        select p.id, p.event_id, p.event_title, p.note, p.status,
          e.artist_name, e.venue_name, e.image_url, e.event_date, e.tags
        from public.curator_picks p
        left join public.events e on e.id = p.event_id
        where p.curator_id = $1
        order by p.created_at desc
      `,
      [row.id]
    );
    const picks = picksResult.rows.map((pick) => ({ ...mapPickRow(pick), status: pick.status }));
    const visiblePickCount = picks.filter((pick) => pick.status === "visible").length;
    return {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      status: row.status,
      picks,
      visiblePickCount,
      activated: isCuratorActivated(visiblePickCount),
    };
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Active curators with ZERO visible picks (PRD 32) — the "not-activated" set the C5 admin oversight
 * read consumes. An empty/weak directory entry that hasn't picked anything yet.
 */
export async function listNotActivatedCurators(): Promise<
  Array<PublicCurator & { id: string; userId: string }>
> {
  try {
    const result = await query<CuratorRow>(
      `
        select c.id, c.user_id, c.handle, c.display_name, c.bio, c.avatar_url, c.status
        from public.curators c
        left join public.curator_picks p on p.curator_id = c.id and p.status = 'visible'
        where c.status = 'active'
        group by c.id
        having count(p.id) = 0
        order by c.created_at desc
      `
    );
    return result.rows.map((row) => ({
      ...toPublicCurator(row),
      id: row.id,
      userId: String(row.user_id),
    }));
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Edit the caller's OWN persona (display name / bio / avatar; handle re-validated if changed).
 * Scoped by `user_id` + `status='active'` in the WHERE — only the caller's active row is touched.
 * Unspecified fields are preserved. Refuses a non-active row (admin restore required).
 */
export async function updateMyCuratorPersona(
  userId: number | string,
  input: { displayName?: string | null; bio?: string | null; avatarUrl?: string | null; handle?: string | null }
): Promise<PublicCurator> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    throw new CuratorValidationError("A valid userId is required.");
  }
  const currentResult = await query<CuratorRow & { handle_changed_at: Date | string | null }>(
    `select id, user_id, handle, display_name, bio, avatar_url, status, handle_changed_at from public.curators where user_id = $1 limit 1`,
    [id]
  );
  const current = currentResult.rows[0];
  if (!current) {
    throw new CuratorValidationError("You are not a curator.");
  }
  if (!canSelfManageCurator(current.status)) {
    throw new CuratorValidationError(
      "This curator profile isn't active. An admin must restore it before you can edit it."
    );
  }

  const nextHandle = input.handle != null ? normalizeHandle(input.handle) : current.handle;
  if (!isValidHandle(nextHandle)) {
    throw new CuratorValidationError("Handle must be 3–40 chars: lowercase letters, digits, - or _.");
  }
  // Anti-abuse (PRD 33): rate-limit handle CHANGES (other persona edits are unrestricted).
  const handleChanged = nextHandle !== current.handle;
  if (handleChanged && !canChangeHandle(current.handle_changed_at)) {
    throw new CuratorValidationError("You can only change your handle once a day. Try again later.");
  }
  const nextDisplayName =
    input.displayName !== undefined ? cleanDisplayName(input.displayName, nextHandle) : current.display_name;
  const nextBio = input.bio !== undefined ? cleanBio(input.bio) : current.bio;
  const nextAvatar = input.avatarUrl !== undefined ? cleanAvatarUrl(input.avatarUrl) : current.avatar_url;

  try {
    const result = await query<CuratorRow>(
      `
        update public.curators
          set handle = $2, display_name = $3, bio = $4, avatar_url = $5, updated_at = now(),
            handle_changed_at = case when $6 then now() else handle_changed_at end
        where user_id = $1 and status = 'active'
        returning id, user_id, handle, display_name, bio, avatar_url, status
      `,
      [id, nextHandle, nextDisplayName, nextBio, nextAvatar, handleChanged]
    );
    const row = result.rows[0];
    if (!row) {
      throw new CuratorValidationError("This curator profile isn't active.");
    }
    return toPublicCurator(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CuratorValidationError("That handle is already taken.");
    }
    throw error;
  }
}

/** Add a pick to the caller's OWN curator (resolves + asserts active ownership first). */
export async function addMyPick(
  userId: number | string,
  input: { eventId: string; eventTitle?: string; note?: string | null }
): Promise<boolean> {
  const curatorId = await requireOwnActiveCuratorId(userId);
  return addCuratorPick({
    curatorId,
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    note: input.note,
  });
}

/**
 * Show/hide one of the caller's OWN picks. Ownership is enforced in the SQL WHERE (`curator_id` =
 * the caller's resolved id), so a crafted pick id belonging to another curator matches nothing.
 */
export async function setMyPickStatus(
  userId: number | string,
  pickId: string,
  status: CuratorPickStatus
): Promise<boolean> {
  const curatorId = await requireOwnActiveCuratorId(userId);
  const result = await query(
    `update public.curator_picks set status = $3 where id = $1 and curator_id = $2`,
    [pickId, curatorId, status]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Delete one of the caller's OWN picks (ownership enforced in the SQL WHERE). */
export async function removeMyPick(userId: number | string, pickId: string): Promise<boolean> {
  const curatorId = await requireOwnActiveCuratorId(userId);
  const result = await query(
    `delete from public.curator_picks where id = $1 and curator_id = $2`,
    [pickId, curatorId]
  );
  return (result.rowCount ?? 0) > 0;
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
