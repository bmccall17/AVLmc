/**
 * Inner-Circle Attribution — pure shaping (PRD 24 / C2). No DB/network imports, so the gating and
 * label logic is unit-tested in isolation (tests/social-activity.test.ts) and reused by the service.
 *
 * "Your people, not the crowd": this layer surfaces what followed-and-opted-in people are going to /
 * firing, and attributes shared songs to in-circle seeders. Every row that reaches these helpers has
 * ALREADY passed the C1 visibility gate at the SQL join (active follow edge AND followee sharing on);
 * these functions only bucket, count, and label — they never decide entitlement.
 */

/** A followee's activity on one event, already entitlement-filtered upstream. */
export type CircleActivityRow = {
  eventId: string;
  userId: string;
  displayName: string | null;
  going: boolean;
  firing: boolean;
};

export type CirclePerson = {
  userId: string;
  displayName: string;
};

/** Per-event roll-up of a viewer's circle activity. Distinct from anonymous community heat. */
export type CircleEventActivity = {
  eventId: string;
  goingCount: number;
  fireCount: number;
  people: CirclePerson[];
};

/** Max in-circle names we collect/show per event before falling back to "+N more". */
export const MAX_CIRCLE_NAMES = 8;

const FALLBACK_NAME = "Someone you follow";

/**
 * Bucket entitlement-filtered rows into per-event activity. A row counts toward `going`/`fire` only
 * when that flag is set; a followee can be both. People with no active state are dropped upstream, so
 * any row here represents real going/firing. Names are de-duplicated per event and capped.
 */
export function shapeCircleActivity(
  rows: CircleActivityRow[]
): Record<string, CircleEventActivity> {
  const byEvent: Record<string, CircleEventActivity> = {};
  const seenPerEvent = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.going && !row.firing) {
      continue;
    }

    const activity = (byEvent[row.eventId] ??= {
      eventId: row.eventId,
      goingCount: 0,
      fireCount: 0,
      people: [],
    });
    const seen = seenPerEvent.get(row.eventId) ?? new Set<string>();
    seenPerEvent.set(row.eventId, seen);

    if (row.going) {
      activity.goingCount += 1;
    }
    if (row.firing) {
      activity.fireCount += 1;
    }

    if (!seen.has(row.userId)) {
      seen.add(row.userId);
      if (activity.people.length < MAX_CIRCLE_NAMES) {
        activity.people.push({
          userId: row.userId,
          displayName: cleanName(row.displayName),
        });
      }
    }
  }

  return byEvent;
}

/**
 * Truthful, private-safe summary line for a "People you follow" strip:
 *   "3 people you follow are going · 1 firing".
 * Attributes counts (and, by the caller, in-circle names) — never anyone outside the viewer's circle.
 * Returns null when there is nothing to show, so callers render nothing.
 */
export function summarizeCircleLabel(activity: CircleEventActivity | undefined | null): string | null {
  if (!activity) {
    return null;
  }
  const parts: string[] = [];
  if (activity.goingCount > 0) {
    const noun = activity.goingCount === 1 ? "person" : "people";
    parts.push(`${activity.goingCount} ${noun} you follow ${activity.goingCount === 1 ? "is" : "are"} going`);
  }
  if (activity.fireCount > 0) {
    parts.push(`${activity.fireCount} firing`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Compact board-badge count: distinct in-circle people with any activity on the event. */
export function circleBadgeCount(activity: CircleEventActivity | undefined | null): number {
  if (!activity) {
    return 0;
  }
  // people is capped; fall back to the larger of the two counts when names were truncated.
  return Math.max(activity.people.length, activity.goingCount, activity.fireCount);
}

function cleanName(name: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed || FALLBACK_NAME;
}
