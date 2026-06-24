import "server-only";
import { query } from "@/lib/db";
import { SchemaNotProvisionedError } from "@/lib/schema-errors";
import {
  isAdminSettableSpotifyAccessStatus,
  isTerminalSpotifyAccessStatus,
  validateSpotifyEmail,
  type SpotifyAccessRequestStatus,
} from "@/lib/spotify-access-requests-core";

/**
 * Spotify tester-slot access requests — data service (PRD 36 / Phase 15). Reads/writes
 * `spotify_access_requests`: a listener submits their Spotify email + `pending`; the admin works the
 * queue (mark `slot_added` after adding them in the Spotify dashboard, then `approved`/`rejected`).
 * The listener's Spotify email is private to listener + admin; no tokens are read or returned here.
 * Reads are `42P01/42703`-tolerant so a not-yet-migrated DB degrades gracefully instead of erroring.
 */

/** The listener's own view of their request (self-plane). */
export type MySpotifyAccessRequest = {
  id: string;
  status: SpotifyAccessRequestStatus;
  spotifyEmail: string;
  requestedAt: string | null;
  resolvedAt: string | null;
  note: string | null;
};

/** A row in the admin review queue: who is waiting + the Spotify email to add to a tester slot. */
export type AdminSpotifyAccessRequest = MySpotifyAccessRequest & {
  userId: string;
  /** The account's primary/display email, for context next to the Spotify email. */
  accountEmail: string | null;
};

type Row = {
  id: number;
  user_id: number;
  spotify_email: string;
  status: SpotifyAccessRequestStatus;
  note: string | null;
  requested_at: string | Date | null;
  resolved_at: string | Date | null;
  account_email?: string | null;
};

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

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMine(row: Row): MySpotifyAccessRequest {
  return {
    id: String(row.id),
    status: row.status,
    spotifyEmail: row.spotify_email,
    requestedAt: toIso(row.requested_at),
    resolvedAt: toIso(row.resolved_at),
    note: row.note,
  };
}

/**
 * Submit (or update) the caller's Spotify access request. Enforces exactly one OPEN request per
 * user: a retry edits the existing open row (refreshing the email + timestamp) instead of forking a
 * new one — backed by the `spotify_access_requests_one_open_idx` partial unique. The user id always
 * comes from the session, never the body. Throws SpotifyAccessRequestValidationError on a bad email.
 */
export async function submitMySpotifyAccessRequest(input: {
  userId: number | string;
  spotifyEmail: string | null | undefined;
}): Promise<MySpotifyAccessRequest> {
  const userId = Number(input.userId);
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Sign in required.");
  }
  const spotifyEmail = validateSpotifyEmail(input.spotifyEmail);

  try {
    // Edit the open row if one exists (pending or slot_added); otherwise insert a fresh pending row.
    const updated = await query<Row>(
      `
        update public.spotify_access_requests
           set spotify_email = $2, requested_at = now()
         where user_id = $1 and status in ('pending', 'slot_added')
        returning id, user_id, spotify_email, status, note, requested_at, resolved_at
      `,
      [userId, spotifyEmail]
    );
    if (updated.rows[0]) {
      return toMine(updated.rows[0]);
    }

    const inserted = await query<Row>(
      `
        insert into public.spotify_access_requests (user_id, spotify_email, status)
        values ($1, $2, 'pending')
        returning id, user_id, spotify_email, status, note, requested_at, resolved_at
      `,
      [userId, spotifyEmail]
    );
    return toMine(inserted.rows[0]);
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      throw new SchemaNotProvisionedError("Spotify access requests");
    }
    throw error;
  }
}

/** The caller's current/most-recent request, or null if they've never asked (or table not migrated). */
export async function getMySpotifyAccessRequest(
  userId: number | string
): Promise<MySpotifyAccessRequest | null> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  try {
    // Prefer the open request; else the latest resolved one (so "approved"/"rejected" still shows).
    const result = await query<Row>(
      `
        select id, user_id, spotify_email, status, note, requested_at, resolved_at
          from public.spotify_access_requests
         where user_id = $1
         order by (status in ('pending', 'slot_added')) desc, requested_at desc
         limit 1
      `,
      [id]
    );
    const row = result.rows[0];
    return row ? toMine(row) : null;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

/** The admin review queue: open requests (pending first), with the Spotify email + account email. */
export async function listSpotifyAccessRequestsForAdmin(): Promise<AdminSpotifyAccessRequest[]> {
  try {
    const result = await query<Row>(
      `
        select r.id, r.user_id, r.spotify_email, r.status, r.note, r.requested_at, r.resolved_at,
               u.email as account_email
          from public.spotify_access_requests r
          left join public.users u on u.id = r.user_id
         where r.status in ('pending', 'slot_added')
         order by (r.status = 'pending') desc, r.requested_at asc
      `
    );
    return result.rows.map((row) => ({
      ...toMine(row),
      userId: String(row.user_id),
      accountEmail: row.account_email ?? null,
    }));
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Admin write (reached only through the admin-cookie-gated route): move a request to a new status.
 * Only `slot_added`/`approved`/`rejected` are settable; terminal states stamp `resolved_at`. Returns
 * false when the id doesn't exist.
 */
export async function setSpotifyAccessRequestStatus(
  id: string | number,
  status: string
): Promise<boolean> {
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId < 1) {
    return false;
  }
  if (!isAdminSettableSpotifyAccessStatus(status)) {
    throw new Error(`Unsupported status: ${status}`);
  }
  const resolvedAtSql = isTerminalSpotifyAccessStatus(status) ? "now()" : "null";
  const result = await query(
    `
      update public.spotify_access_requests
         set status = $2, resolved_at = ${resolvedAtSql}
       where id = $1
    `,
    [requestId, status]
  );
  return (result.rowCount ?? 0) > 0;
}
