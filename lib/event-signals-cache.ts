import { revalidateTag } from "next/cache";
import { EVENTS_CACHE_TAG, EVENT_SIGNALS_CACHE_TAG } from "@/lib/event-read-cache";

/**
 * Write-side invalidation for the PRD 51 read caches. Route handlers call these after a
 * successful write so cached public payloads update on the write itself, never on a timer —
 * the "cache reads, invalidate on write" half of ADR 002.
 */

/** After a community/curator/shared-song write: public per-event signal maps re-query. */
export function revalidateEventSignals() {
  safeRevalidate(EVENT_SIGNALS_CACHE_TAG);
}

/** After event ingest/repair (cron routes): event rows AND the signal maps keyed off them re-query. */
export function revalidateEventReads() {
  safeRevalidate(EVENTS_CACHE_TAG);
  safeRevalidate(EVENT_SIGNALS_CACHE_TAG);
}

function safeRevalidate(tag: string) {
  try {
    revalidateTag(tag);
  } catch (error) {
    // Outside a request scope (scripts, tests) revalidation is meaningless but must never turn
    // a successful write into a 500.
    console.warn(`[cache] revalidateTag(${tag}) failed:`, error);
  }
}
