/**
 * Pure cache-wiring for the event read path (PRD 51 / ADR 002 §1). Kept free of next/cache and
 * server-only imports so the once-per-key / tag-invalidation / freshness contract is unit-testable
 * with a fake cache factory (`tests/events-cache.test.ts`). lib/events.ts injects Next's
 * `unstable_cache`; between cron runs, thousands of pageviews collapse to one cached read.
 */

/** Invalidated by the AVLgo sync after a successful upsert — the primary freshness mechanism. */
export const EVENTS_CACHE_TAG = "events";

/**
 * Invalidated by community/curator/shared-song writes so cached public per-event signals stay
 * exact (counts move on the write, not on a timer).
 */
export const EVENT_SIGNALS_CACHE_TAG = "event-signals";

/** Daily ceiling — a backstop, never the freshness mechanism (ADR 002). */
export const EVENT_READ_REVALIDATE_SECONDS = 86_400;

/** Backstop for the public signal maps; writes revalidate the tag immediately. */
export const EVENT_SIGNALS_REVALIDATE_SECONDS = 3_600;

export type TaggedCacheOptions = { revalidate: number; tags: string[] };

/** The shape of next/cache's `unstable_cache`, injectable so tests can fake it. */
export type TaggedCacheFactory = <Args extends string[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: TaggedCacheOptions
) => (...args: Args) => Promise<Result>;

export type UpcomingEventLike = { startsAt: string | null };

/**
 * Replays the SQL per-view filter (`starts_at is null or starts_at >= now`) over the day-keyed
 * cached rows, so a shared daily cache entry still hides already-started shows per request and
 * the rendered board stays identical to the uncached query.
 */
export function filterNotYetStarted<E extends UpcomingEventLike>(events: E[], now: Date): E[] {
  const cutoff = now.getTime();
  return events.filter((event) => {
    if (!event.startsAt) {
      return true;
    }
    const startsAt = new Date(event.startsAt).getTime();
    return Number.isNaN(startsAt) || startsAt >= cutoff;
  });
}

export function createEventReadCache<UpcomingEvent, ByIdEvent>(deps: {
  cacheFactory: TaggedCacheFactory;
  /** Uncached DB read of the rolling window for one day key (superset: filtered per view). */
  listUpcomingByDay: (dayKey: string) => Promise<UpcomingEvent[]>;
  /** Uncached DB read of a single event row. */
  getById: (id: string) => Promise<ByIdEvent | null>;
}) {
  return {
    readUpcomingByDay: deps.cacheFactory(deps.listUpcomingByDay, ["upcoming-events"], {
      revalidate: EVENT_READ_REVALIDATE_SECONDS,
      tags: [EVENTS_CACHE_TAG],
    }),
    readById: deps.cacheFactory(deps.getById, ["event-by-id"], {
      revalidate: EVENT_READ_REVALIDATE_SECONDS,
      tags: [EVENTS_CACHE_TAG],
    }),
  };
}
