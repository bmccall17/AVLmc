import "server-only";
import { query } from "@/lib/db";
import { SchemaNotProvisionedError } from "@/lib/schema-errors";
import {
  isTesterRequestStatus,
  validateTesterEmail,
  validateTesterNote,
  normalizeTesterSource,
  type TesterRequestStatus,
} from "@/lib/tester-requests-core";

/**
 * Anonymous Spotify tester requests — data service (PRD 42 / Phase 17). Reads/writes
 * `tester_requests`: the email-keyed, pre-redirect capture of Spotify interest (the signed-in
 * connect path keeps its own `spotify_access_requests`, PRD 36). Upsert-on-reapply — one row per
 * email, `updated_at` refreshed, status never demoted. Emails are private to applicant + owner.
 * Reads are `42P01/42703`-tolerant so a not-yet-migrated DB degrades gracefully instead of erroring.
 */

export type TesterRequest = {
  id: string;
  email: string;
  note: string | null;
  source: string;
  status: TesterRequestStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

type Row = {
  id: number;
  email: string;
  note: string | null;
  source: string;
  status: TesterRequestStatus;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  created?: boolean;
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

function toRequest(row: Row): TesterRequest {
  return {
    id: String(row.id),
    email: row.email,
    note: row.note,
    source: row.source,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Capture (or refresh) an applicant's tester request. One row per email: a re-apply refreshes
 * `updated_at` and the note/source when provided, and NEVER touches status — `approved`/`invited`
 * keep their seat, `declined` stays declined (no notification fatigue; only the owner re-opens).
 * Returns `created` so the caller notifies the owner exactly once per genuine new interest.
 */
export async function upsertTesterRequest(input: {
  email: string | null | undefined;
  note?: string | null;
  source?: string | null;
}): Promise<{ request: TesterRequest; created: boolean }> {
  const email = validateTesterEmail(input.email);
  const note = validateTesterNote(input.note);
  const source = normalizeTesterSource(input.source);

  try {
    // `xmax = 0` marks a freshly inserted row (no prior version), distinguishing insert from update.
    const result = await query<Row>(
      `
        insert into public.tester_requests (email, note, source)
        values ($1, $2, $3)
        on conflict (email) do update
           set note = coalesce(excluded.note, tester_requests.note),
               source = excluded.source,
               updated_at = now()
        returning id, email, note, source, status, created_at, updated_at, (xmax = 0) as created
      `,
      [email, note, source]
    );
    const row = result.rows[0];
    return { request: toRequest(row), created: Boolean(row.created) };
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      throw new SchemaNotProvisionedError("Tester requests");
    }
    throw error;
  }
}

/** The request on file for an email, or null (also null when the table isn't migrated yet). */
export async function getTesterRequestByEmail(
  email: string | null | undefined
): Promise<TesterRequest | null> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  try {
    const result = await query<Row>(
      `
        select id, email, note, source, status, created_at, updated_at
          from public.tester_requests
         where email = $1
      `,
      [normalized]
    );
    const row = result.rows[0];
    return row ? toRequest(row) : null;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

/** The full admin queue: pending first, then invited/approved/declined, newest activity first. */
export async function listTesterRequests(): Promise<TesterRequest[]> {
  try {
    const result = await query<Row>(
      `
        select id, email, note, source, status, created_at, updated_at
          from public.tester_requests
         order by (status = 'pending') desc,
                  array_position(array['invited', 'approved', 'declined'], status),
                  updated_at desc
      `
    );
    return result.rows.map(toRequest);
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Admin write (reached only through the admin-cookie-gated route): move a request to a new status.
 * Statuses are the core lifecycle set; the invite-send flow is what moves `approved → invited`.
 * Returns the updated request, or null when the id doesn't exist.
 */
export async function setTesterRequestStatus(
  id: string | number,
  status: string
): Promise<TesterRequest | null> {
  const requestId = Number(id);
  if (!Number.isInteger(requestId) || requestId < 1) {
    return null;
  }
  if (!isTesterRequestStatus(status)) {
    throw new Error(`Unsupported status: ${status}`);
  }
  const result = await query<Row>(
    `
      update public.tester_requests
         set status = $2, updated_at = now()
       where id = $1
      returning id, email, note, source, status, created_at, updated_at
    `,
    [requestId, status]
  );
  const row = result.rows[0];
  return row ? toRequest(row) : null;
}

/** How many tester requests are pending right now (for the owner-notification email). */
export async function countPendingTesterRequests(): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      `select count(*)::text as count from public.tester_requests where status = 'pending'`
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return 0;
    }
    throw error;
  }
}

/**
 * Seated testers against the owner + 5-user Development Mode budget, counted as DISTINCT emails across
 * BOTH request stores — this table's `approved`/`invited` and PRD 36's signed-in
 * `spotify_access_requests` `slot_added`/`approved` — since both mirror the same dashboard
 * allowlist. An email that asked through both paths holds one seat, not two.
 */
export async function countSeatedTesterEmails(): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      `
        select count(distinct email)::text as count
          from (
            select lower(email) as email
              from public.tester_requests
             where status in ('approved', 'invited')
            union
            select lower(spotify_email) as email
              from public.spotify_access_requests
             where status in ('slot_added', 'approved')
          ) seated
      `
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return 0;
    }
    throw error;
  }
}
