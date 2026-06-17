import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { canViewActivity, isSelfFollow } from "@/lib/social-graph-core";

/**
 * Social / Curator Graph service (PRD 23 / C1) — the spine of the Social initiative (Phase 12).
 *
 * Owns all reads/writes of the private, one-way `listener_follows` table. A signed-in listener can
 * follow another listener (or, later, a curator); following is a single row, unfollowing deletes it
 * (reversible). The graph is private by construction: every method here is entitlement-scoped to the
 * signed-in caller. There is NO method that returns a regular listener's follower identities — only
 * an aggregate count — and nothing here is ever wired into a public/community/OG response.
 *
 * The visibility rule ("follow edge AND the followee opted into sharing") lives in the pure
 * `lib/social-graph-core.ts` so it is unit-tested once and reused by C2/C4 rather than re-derived.
 *
 * Brownfield posture: reads tolerate a not-yet-migrated table (Postgres 42P01) and degrade to empty,
 * matching `lib/saved-items.ts` / `lib/community.ts`.
 */

export type FollowingListEntry = {
  /** The followee's user id (string, matching the auth/session id shape). */
  userId: string;
  /** Minimal, privacy-safe display fields the follower is entitled to. Never email/PII. */
  name: string | null;
  image: string | null;
  createdAt: string;
};

export type FollowState = {
  isFollowing: boolean;
};

type FollowingRow = {
  followee_user_id: number;
  name: string | null;
  image: string | null;
  created_at: Date | string;
};

/**
 * Idempotent follow. Inserts one edge; a repeat follow is a no-op (no duplicate row). Rejects a
 * self-follow and a non-existent followee (the FK raises 23503). Returns true when an edge now
 * exists (whether newly created or already present).
 */
export async function followUser(followerId: string, followeeId: string): Promise<boolean> {
  if (isSelfFollow(followerId, followeeId)) {
    throw new Error("You cannot follow yourself.");
  }

  const follower = toDatabaseUserId(followerId);
  const followee = toDatabaseUserId(followeeId);

  try {
    await query(
      `
        insert into public.listener_follows (id, follower_user_id, followee_user_id)
        values ($1, $2, $3)
        on conflict (follower_user_id, followee_user_id) do nothing
      `,
      [randomUUID(), follower, followee]
    );
    return true;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("That listener does not exist.");
    }
    if (isMissingRelationError(error)) {
      throw new Error("Social graph table is not set up. Apply db/schema.sql before following.");
    }
    throw error;
  }
}

/** Reversible unfollow: deletes the edge if present. Returns true when a row was removed. */
export async function unfollowUser(followerId: string, followeeId: string): Promise<boolean> {
  const follower = toDatabaseUserId(followerId);
  const followee = toDatabaseUserId(followeeId);

  try {
    const result = await query(
      `
        delete from public.listener_follows
        where follower_user_id = $1 and followee_user_id = $2
      `,
      [follower, followee]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return false;
    }
    throw error;
  }
}

/** The people the caller follows, with minimal display fields, newest first. */
export async function listFollowing(userId: string): Promise<FollowingListEntry[]> {
  const follower = toDatabaseUserId(userId);

  try {
    const result = await query<FollowingRow>(
      `
        select f.followee_user_id, u.name, u.image, f.created_at
        from public.listener_follows f
        join public.users u on u.id = f.followee_user_id
        where f.follower_user_id = $1 and f.status = 'active'
        order by f.created_at desc
      `,
      [follower]
    );

    return result.rows.map((row) => ({
      userId: String(row.followee_user_id),
      name: row.name,
      image: row.image,
      createdAt: toIsoString(row.created_at),
    }));
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

/** Whether the caller actively follows `targetId`. */
export async function isFollowing(followerId: string, targetId: string): Promise<boolean> {
  if (isSelfFollow(followerId, targetId)) {
    return false;
  }

  const follower = toDatabaseUserId(followerId);
  const followee = toDatabaseUserId(targetId);

  try {
    const result = await query(
      `
        select 1
        from public.listener_follows
        where follower_user_id = $1 and followee_user_id = $2 and status = 'active'
        limit 1
      `,
      [follower, followee]
    );
    return result.rows.length > 0;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return false;
    }
    throw error;
  }
}

/** Convenience wrapper used by the FollowButton hydration path. */
export async function getFollowState(followerId: string, targetId: string): Promise<FollowState> {
  return { isFollowing: await isFollowing(followerId, targetId) };
}

/**
 * How many listeners actively follow `userId`. Aggregate ONLY — there is deliberately no method that
 * returns a regular listener's follower identities.
 */
export async function getFollowerCount(userId: string): Promise<number> {
  const followee = toDatabaseUserId(userId);

  try {
    const result = await query<{ count: number | string }>(
      `
        select count(*)::int as count
        from public.listener_follows
        where followee_user_id = $1 and status = 'active'
      `,
      [followee]
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return 0;
    }
    throw error;
  }
}

/**
 * The reusable gate (PRD 23): true only when an active follow edge exists from `viewerId` to
 * `targetId` AND the target has activity-sharing on. C2/C4 import this rather than re-deriving the
 * rule. A viewer can always see their own activity.
 */
export async function canViewActivityOf(viewerId: string, targetId: string): Promise<boolean> {
  if (isSelfFollow(viewerId, targetId)) {
    return canViewActivity({ hasActiveEdge: false, followeeSharesActivity: false, isSelf: true });
  }

  const viewer = toDatabaseUserId(viewerId);
  const target = toDatabaseUserId(targetId);

  try {
    const result = await query<{ shares: boolean }>(
      `
        select coalesce(p.share_activity, false) as shares
        from public.listener_follows f
        left join public.listener_discovery_preferences p on p.user_id = f.followee_user_id
        where f.follower_user_id = $1 and f.followee_user_id = $2 and f.status = 'active'
        limit 1
      `,
      [viewer, target]
    );

    const row = result.rows[0];
    return canViewActivity({
      hasActiveEdge: Boolean(row),
      followeeSharesActivity: Boolean(row?.shares),
    });
  } catch (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) {
      // No graph table or pre-migration prefs row → no one can see anyone's activity yet.
      return false;
    }
    throw error;
  }
}

function toDatabaseUserId(userId: string) {
  const parsed = Number(userId);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid user id.");
  }

  return parsed;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function isMissingRelationError(error: unknown) {
  return hasErrorCode(error, "42P01");
}

function isUndefinedColumnError(error: unknown) {
  return hasErrorCode(error, "42703");
}

function isForeignKeyViolation(error: unknown) {
  return hasErrorCode(error, "23503");
}
