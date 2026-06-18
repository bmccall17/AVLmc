import "server-only";
import { query } from "@/lib/db";
import {
  emailSourceForProvider,
  isProviderEmailVerified,
  normalizeEmail,
  type EmailSource,
} from "@/lib/account-linking";

/**
 * Account identity — multi-email service (PRD 35 / Phase 15). Reads/writes the `user_emails`
 * association so one account can own many verified emails (magic link + each linked platform).
 * Best-effort + `42P01/42703`-tolerant: a failure here must never block sign-in. Tokens are never
 * read or returned by this module.
 */

export type LinkedProvider = {
  provider: string;
  /** Auth.js `accounts.type` (e.g. "oauth", "email"). No tokens. */
  type: string;
};

export type AccountEmail = {
  email: string;
  source: EmailSource;
  verified: boolean;
  isPrimary: boolean;
};

export type AccountLinks = {
  providers: LinkedProvider[];
  emails: AccountEmail[];
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

/**
 * Record an email association for an account (idempotent, best-effort). Becomes the account's
 * primary email only if it has none yet; never inserts an email already owned (by any account) —
 * cross-account collisions are resolved deliberately by the linking decision matrix, not here.
 */
export async function recordUserEmail(input: {
  userId: number | string;
  email: string | null | undefined;
  source: EmailSource;
  verified: boolean;
}): Promise<void> {
  const userId = Number(input.userId);
  const email = normalizeEmail(input.email);
  if (!Number.isInteger(userId) || userId < 1 || !email) {
    return;
  }
  try {
    await query(
      `
        insert into public.user_emails (user_id, email, source, verified, is_primary)
        select $1, $2, $3, $4, not exists (select 1 from public.user_emails where user_id = $1)
        where not exists (select 1 from public.user_emails where lower(email) = lower($2))
      `,
      [userId, email, input.source, input.verified]
    );
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return;
    }
    // Best-effort: a unique-collision (email owned elsewhere) or any write issue must not block auth.
    console.error("recordUserEmail failed (non-fatal).", error);
  }
}

/** Convenience for the `auth.ts` sign-in event: derive source/verified from the provider id. */
export async function recordProviderEmail(
  userId: number | string,
  provider: string | null | undefined,
  email: string | null | undefined
): Promise<void> {
  await recordUserEmail({
    userId,
    email,
    source: emailSourceForProvider(provider),
    verified: isProviderEmailVerified(provider),
  });
}

/** Which `users.id`, if any, owns this email (via `user_emails`). Null when unowned/unmigrated. */
export async function findUserIdByEmail(email: string | null | undefined): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  try {
    const result = await query<{ user_id: number }>(
      `select user_id from public.user_emails where lower(email) = lower($1) limit 1`,
      [normalized]
    );
    const row = result.rows[0];
    return row ? String(row.user_id) : null;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

/** The caller's linked providers (tokens stripped) + associated emails, for the self-service surface. */
export async function getAccountLinks(userId: number | string): Promise<AccountLinks> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    return { providers: [], emails: [] };
  }
  try {
    const [providers, emails] = await Promise.all([
      query<{ provider: string; type: string }>(
        `select provider, type from public.accounts where "userId" = $1 order by provider asc`,
        [id]
      ),
      query<{ email: string; source: EmailSource; verified: boolean; is_primary: boolean }>(
        `select email, source, verified, is_primary from public.user_emails where user_id = $1
         order by is_primary desc, added_at asc`,
        [id]
      ),
    ]);
    return {
      providers: providers.rows.map((row) => ({ provider: row.provider, type: row.type })),
      emails: emails.rows.map((row) => ({
        email: row.email,
        source: row.source,
        verified: row.verified,
        isPrimary: row.is_primary,
      })),
    };
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return { providers: [], emails: [] };
    }
    throw error;
  }
}
