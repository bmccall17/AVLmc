import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { SchemaNotProvisionedError } from "@/lib/schema-errors";
import {
  isAdminSettableRecommendationStatus,
  validateCuratorRecommendation,
  type CuratorRecommendationStatus,
} from "@/lib/curator-recommendations-core";

/**
 * "Recommend a curator" — data service (parked backlog item). Reads/writes
 * `curator_recommendations`: a signed-in listener nominates someone who should curate; the admin
 * works the pending queue (mark `reviewed` or `dismissed`). The submitter id always comes from the
 * session, never the body. Private to submitter + admin (never public, no pay-to-play). Reads are
 * 42P01/42703-tolerant so a not-yet-migrated DB degrades to empty instead of erroring.
 */

/** A row in the admin review queue: who nominated whom, plus the submitter's account email. */
export type AdminCuratorRecommendation = {
  id: string;
  status: CuratorRecommendationStatus;
  nomineeName: string;
  nomineeLink: string | null;
  reason: string | null;
  createdAt: string | null;
  userId: string;
  /** The submitter's account email, for context in the admin queue. */
  submitterEmail: string | null;
};

type Row = {
  id: string;
  user_id: number;
  nominee_name: string;
  nominee_link: string | null;
  reason: string | null;
  status: CuratorRecommendationStatus;
  created_at: string | Date | null;
  submitter_email?: string | null;
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

/**
 * Submit a curator recommendation on behalf of the caller. The user id always comes from the
 * session, never the body. Throws CuratorRecommendationValidationError on bad input and
 * SchemaNotProvisionedError when the table isn't migrated yet.
 */
export async function submitCuratorRecommendation(input: {
  userId: number | string;
  nomineeName: string | null | undefined;
  nomineeLink?: string | null | undefined;
  reason?: string | null | undefined;
}): Promise<void> {
  const userId = Number(input.userId);
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Sign in required.");
  }
  const { nomineeName, nomineeLink, reason } = validateCuratorRecommendation({
    nomineeName: input.nomineeName,
    nomineeLink: input.nomineeLink,
    reason: input.reason,
  });

  try {
    await query(
      `
        insert into public.curator_recommendations
          (id, user_id, nominee_name, nominee_link, reason, status)
        values ($1, $2, $3, $4, $5, 'pending')
      `,
      [randomUUID(), userId, nomineeName, nomineeLink, reason]
    );
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      throw new SchemaNotProvisionedError("Curator recommendations");
    }
    throw error;
  }
}

/** The admin review queue: pending recommendations, oldest first, with the submitter's email. */
export async function listCuratorRecommendationsForAdmin(): Promise<AdminCuratorRecommendation[]> {
  try {
    const result = await query<Row>(
      `
        select r.id, r.user_id, r.nominee_name, r.nominee_link, r.reason, r.status, r.created_at,
               u.email as submitter_email
          from public.curator_recommendations r
          left join public.users u on u.id = r.user_id
         where r.status = 'pending'
         order by r.created_at asc
      `
    );
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      nomineeName: row.nominee_name,
      nomineeLink: row.nominee_link,
      reason: row.reason,
      createdAt: toIso(row.created_at),
      userId: String(row.user_id),
      submitterEmail: row.submitter_email ?? null,
    }));
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Admin write (reached only through the admin-cookie-gated route): move a recommendation to a new
 * status. Only `reviewed`/`dismissed` are settable; both stamp `resolved_at`. Returns false when the
 * id doesn't exist.
 */
export async function setCuratorRecommendationStatus(
  id: string,
  status: string
): Promise<boolean> {
  if (!id) {
    return false;
  }
  if (!isAdminSettableRecommendationStatus(status)) {
    throw new Error(`Unsupported status: ${status}`);
  }
  const result = await query(
    `
      update public.curator_recommendations
         set status = $2, resolved_at = now()
       where id = $1
    `,
    [id, status]
  );
  return (result.rowCount ?? 0) > 0;
}
