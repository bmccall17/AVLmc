/**
 * Hero-image resilience (PRD 06).
 *
 * Facebook CDN URLs (`scontent-*.xx.fbcdn.net`) are signed with an expiry (`oe` param, ~30 days),
 * and the AVLgo export keeps serving them long after they die. The rules here decide which
 * image URL an event row is allowed to keep so a working stored image is never replaced by a
 * URL that could expire:
 *
 *   1. A blob URL (our durable copy) always wins; only another blob URL may replace it.
 *   2. An expiring CDN URL is never persisted — it is either ingested to Blob first or dropped
 *      in favor of whatever non-expiring URL is already stored.
 *   3. NULL is stored only when there is nothing better to keep.
 *
 * Pure module (no I/O) so the precedence rule is unit-testable; `lib/events.ts` applies it and
 * mirrors it in the upsert SQL as a second line of defense.
 */

/** Hosts whose image URLs are signed with an expiry and go dead; extend as new sources appear. */
const EXPIRING_CDN_HOST_SUFFIXES = ["fbcdn.net"];

const BLOB_HOST_SUFFIX = "blob.vercel-storage.com";

export function isExpiringImageUrl(url: string | null | undefined): boolean {
  return EXPIRING_CDN_HOST_SUFFIXES.some((suffix) => hostMatches(url, suffix));
}

export function isBlobImageUrl(url: string | null | undefined): boolean {
  return hostMatches(url, BLOB_HOST_SUFFIX);
}

/**
 * Given what the database already holds and what this sync resolved for an event (feed URL,
 * freshly-ingested blob URL, or a dead expiring URL that could not be ingested), returns the
 * value the row should end up with.
 */
export function resolveStoredImageUrl(
  existingUrl: string | null | undefined,
  incomingUrl: string | null | undefined
): string | null {
  if (isBlobImageUrl(incomingUrl)) {
    return incomingUrl ?? null;
  }
  if (isBlobImageUrl(existingUrl)) {
    return existingUrl ?? null;
  }
  if (isExpiringImageUrl(incomingUrl)) {
    // Ingestion failed upstream; a dead-on-arrival CDN URL is worse than anything stored.
    return isExpiringImageUrl(existingUrl) ? null : existingUrl ?? null;
  }
  if (incomingUrl) {
    return incomingUrl;
  }
  return isExpiringImageUrl(existingUrl) ? null : existingUrl ?? null;
}

export type ImageIngestStats = {
  /** Expiring-CDN images fetched and uploaded to Blob this sync. */
  ingested: number;
  /** Events that already had a durable blob copy; no re-upload. */
  reused: number;
  /** Ingestion attempts that failed (CDN fetch or Blob upload). */
  failed: number;
  /** Dead URLs dropped with nothing better to keep — row stores NULL. */
  deadSkipped: number;
};

export function emptyImageIngestStats(): ImageIngestStats {
  return { ingested: 0, reused: 0, failed: 0, deadSkipped: 0 };
}

/** Compact human summary for job-run records, or null when no expiring images were seen. */
export function describeImageIngestStats(stats: ImageIngestStats): string | null {
  if (stats.ingested + stats.reused + stats.failed + stats.deadSkipped === 0) {
    return null;
  }

  return `images: ${stats.ingested} ingested, ${stats.reused} reused, ${stats.failed} failed, ${stats.deadSkipped} dead-skipped`;
}

function hostMatches(url: string | null | undefined, suffix: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === suffix || host.endsWith(`.${suffix}`);
  } catch {
    return url.toLowerCase().includes(suffix);
  }
}
