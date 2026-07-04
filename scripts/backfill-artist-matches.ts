/**
 * Full-catalog Spotify artist-match backfill (PRD 46, Story B).
 *
 * Thin HTTP driver: repeatedly calls `GET /api/sync/artist-match?limit=N` until every event has a
 * match row (`remaining === 0`). The heavy lifting (app-token resolution, exact-vs-fuzzy decision,
 * per-normalized-name caching, track fetch, persistence) happens server-side in lib/artist-match.ts
 * so this script needs no DATABASE_URL and no `server-only` imports — it just orchestrates batches
 * and respects Spotify back-off. Safe to re-run: events with a row are skipped, so a second run is
 * a no-op.
 *
 *   BASE_URL=https://avlmc.vercel.app npm run backfill:artist-matches
 *   # defaults to http://localhost:3000 when BASE_URL is unset
 *
 * Optional env: BATCH (events per request, default 100), MAX_BATCHES (safety cap, default 200).
 */

type BackfillSummary = {
  success: boolean;
  processed: number;
  matched: number;
  cached: number;
  needsReview: number;
  rejected: number;
  errors: number;
  remaining: number;
  backedOff: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const batch = Math.max(1, Math.min(Number(process.env.BATCH ?? 100) || 100, 500));
  const maxBatches = Math.max(1, Number(process.env.MAX_BATCHES ?? 200) || 200);

  const totals = { processed: 0, matched: 0, cached: 0, needsReview: 0, rejected: 0, errors: 0 };

  // eslint-disable-next-line no-console
  console.log(`Backfilling artist matches via ${baseUrl} (batch=${batch}) …`);

  for (let i = 0; i < maxBatches; i += 1) {
    const response = await fetch(`${baseUrl}/api/sync/artist-match?limit=${batch}`);
    if (!response.ok) {
      throw new Error(`Backfill request failed: ${response.status} ${response.statusText}`);
    }
    const summary = (await response.json()) as BackfillSummary;

    totals.processed += summary.processed;
    totals.matched += summary.matched;
    totals.cached += summary.cached;
    totals.needsReview += summary.needsReview;
    totals.rejected += summary.rejected;
    totals.errors += summary.errors;

    // eslint-disable-next-line no-console
    console.log(
      `  batch ${i + 1}: processed ${summary.processed}, matched ${summary.matched}, cached ${summary.cached}, review ${summary.needsReview}, rejected ${summary.rejected}, errors ${summary.errors}, remaining ${summary.remaining}${summary.backedOff ? " (backed off)" : ""}`
    );

    if (summary.remaining <= 0 || summary.processed === 0) {
      break;
    }
    // Back off harder when Spotify rate-limited us; otherwise a light pause between batches.
    await sleep(summary.backedOff ? 15_000 : 500);
  }

  // eslint-disable-next-line no-console
  console.log(
    `✓ done — processed ${totals.processed} (matched ${totals.matched}, cached ${totals.cached}, review ${totals.needsReview}, rejected ${totals.rejected}, errors ${totals.errors}).`
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("✗ backfill:artist-matches failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
