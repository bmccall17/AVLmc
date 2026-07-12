import { NextResponse } from "next/server";
import { cleanupOldEventImages } from "@/lib/events";
import { recordJobRun } from "@/lib/admin/job-runs";
import { assertCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const startedAt = new Date();

  try {
    const result = await cleanupOldEventImages(7);

    await recordJobRun({
      job: "cleanup",
      status: "success",
      itemsProcessed: typeof result?.deletedCount === "number" ? result.deletedCount : null,
      startedAt,
    });

    return NextResponse.json({
      success: true,
      cleanedAt: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    await recordJobRun({
      job: "cleanup",
      status: "failure",
      detail: error instanceof Error ? error.message : "Cleanup failed",
      startedAt,
    });
    console.error("Cleanup job failed:", error);
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
