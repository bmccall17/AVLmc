/**
 * Social / Curator Graph — pure logic (PRD 23 / C1).
 *
 * The privacy rules of the follow graph, with no I/O so they can be unit-tested directly and
 * imported by later cycles (C2 attribution, C4 ranking) instead of being re-derived. Nothing here
 * touches the database or `server-only`; the data-bearing service is `lib/social-graph.ts`.
 *
 * Two invariants live here:
 *  - You cannot follow yourself.
 *  - You may see a followee's activity ONLY when an active follow edge exists AND the followee has
 *    turned activity-sharing on. Missing either side → no visibility. This is the single gate every
 *    "your people" read checks.
 */

export type FollowStatus = "active" | "blocked";

/** True when a follow would be a self-follow (the `check` constraint also rejects this in the DB). */
export function isSelfFollow(followerId: string, followeeId: string): boolean {
  return normalizeId(followerId) === normalizeId(followeeId);
}

/**
 * The reusable visibility gate. A follower may see a followee's going/firing activity only when
 * both conditions hold:
 *  - an ACTIVE follow edge from follower → followee exists (`hasActiveEdge`), and
 *  - the followee has opted into activity-sharing (`followeeSharesActivity`).
 *
 * A viewer can always see their own activity (`isSelf`). Anything else is false — this is what keeps
 * a not-opted-in or not-followed listener absent from every "your people" read.
 */
export function canViewActivity(input: {
  hasActiveEdge: boolean;
  followeeSharesActivity: boolean;
  isSelf?: boolean;
}): boolean {
  if (input.isSelf) {
    return true;
  }
  return input.hasActiveEdge && input.followeeSharesActivity;
}

function normalizeId(value: string): string {
  return String(value).trim();
}
