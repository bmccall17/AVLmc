import { NextResponse } from "next/server";
import { backfillDeadImageUrls } from "@/lib/events";
import { recordJobRun } from "@/lib/admin/job-runs";
import { assertCronRequest } from "@/lib/cron-auth";
import { revalidateEventReads } from "@/lib/event-signals-cache";

export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Manual repair pass (PRD 06): rows persisted before the image-resilience rules can still hold
 * expired Facebook CDN URLs. Re-ingests each one that still resolves into Vercel Blob and clears
 * the rest to NULL so the placeholder renders intentionally. Idempotent — once no fbcdn URLs
 * remain, it scans zero rows.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const startedAt = new Date();

  try {
    const result = await backfillDeadImageUrls();
    // Repaired image URLs live on cached event rows (PRD 51) — surface them without waiting
    // for the daily backstop.
    revalidateEventReads();

    await recordJobRun({
      job: "image_backfill",
      status: "success",
      itemsProcessed: result.scanned,
      detail: `${result.repaired} repaired · ${result.cleared} cleared`,
      startedAt,
    });

    return NextResponse.json({
      success: true,
      backfilledAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    await recordJobRun({
      job: "image_backfill",
      status: "failure",
      detail: error instanceof Error ? error.message : "Backfill failed",
      startedAt,
    });
    console.error("Image backfill job failed:", error);
    return NextResponse.json({ success: false, error: "Backfill failed" }, { status: 500 });
  }
}
