import { NextResponse } from "next/server";
import { runArtistMatchBackfill } from "@/lib/artist-match";
import { recordJobRun } from "@/lib/admin/job-runs";
import { assertCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;
export const runtime = "nodejs";

// Server-side ceiling on ?limit= — each unit is live Spotify quota, so a caller can never widen
// the batch past this; the bearer gate below is the primary control.
const ARTIST_MATCH_LIMIT_CEILING = 500;
const ARTIST_MATCH_LIMIT_DEFAULT = 100;

/**
 * Artist-match backfill pass (PRD 46, Story B). Resolves Spotify artist matches for a bounded
 * batch of events that don't yet have one, then records the run. Idempotent and resumable: events
 * with a row are skipped, so this can be called repeatedly (by `scripts/backfill-artist-matches.ts`
 * or a cron) until `remaining` reaches 0. `?limit=` caps how many events one invocation processes.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const startedAt = new Date();
  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), ARTIST_MATCH_LIMIT_CEILING)
      : ARTIST_MATCH_LIMIT_DEFAULT;

  try {
    const summary = await runArtistMatchBackfill({ limit });

    await recordJobRun({
      job: "artist_match",
      status: summary.errors > 0 ? "failure" : "success",
      itemsProcessed: summary.processed,
      detail: `matched ${summary.matched} · cached ${summary.cached} · review ${summary.needsReview} · rejected ${summary.rejected} · errors ${summary.errors} · tracks +${summary.tracksFilled}/-${summary.tracksFailed} · remaining ${summary.remaining}${summary.lastTrackError ? ` · lastTrackError=${summary.lastTrackError}` : ""}${summary.backedOff ? ` · backed off (429; retry-after ${summary.retryAfterSeconds ?? "?"}s)` : ""}`,
      startedAt,
    });

    return NextResponse.json({
      success: true,
      backfilledAt: new Date().toISOString(),
      ...summary,
    });
  } catch (error) {
    await recordJobRun({
      job: "artist_match",
      status: "failure",
      detail: error instanceof Error ? error.message : "Artist-match backfill failed",
      startedAt,
    });
    console.error("Artist-match backfill job failed:", error);
    return NextResponse.json({ success: false, error: "Artist-match backfill failed" }, { status: 500 });
  }
}
