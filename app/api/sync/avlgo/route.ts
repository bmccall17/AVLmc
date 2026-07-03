import { NextResponse } from "next/server";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import {
  isUsingCustomAvlgoFeed,
  syncUpcomingEventsDetailed,
  syncUpcomingEventsWithDuplicateAudit,
  type EventSyncWithDuplicateAudit,
} from "@/lib/events";
import { describeImageIngestStats } from "@/lib/image-resilience";
import { recordJobRun } from "@/lib/admin/job-runs";

export async function GET(request: Request) {
  const startedAt = new Date();
  const auditMode = new URL(request.url).searchParams.get("audit");

  try {
    if (auditMode === "duplicates") {
      const result = await syncUpcomingEventsWithDuplicateAudit();
      const duplicateGroups = await attachHiddenActivity(result);

      await recordJobRun({
        job: "avlgo_sync",
        status: "success",
        itemsProcessed: result.events.length,
        detail: joinDetail(
          `audit mode · ${duplicateGroups.length} duplicate groups`,
          describeImageIngestStats(result.imageStats)
        ),
        startedAt,
      });

      return NextResponse.json({
        ...baseSyncResponse(),
        eventCount: result.events.length,
        events: result.events,
        imageStats: result.imageStats,
        duplicateAudit: {
          duplicateGroupCount: duplicateGroups.length,
          incomingDuplicateGroupCount: result.incomingDuplicateAudit.length,
          storedDuplicateGroupCount: result.storedDuplicateAudit.length,
          duplicateGroups,
        },
      });
    }

    const { events, imageStats } = await syncUpcomingEventsDetailed();

    await recordJobRun({
      job: "avlgo_sync",
      status: "success",
      itemsProcessed: events.length,
      detail: describeImageIngestStats(imageStats),
      startedAt,
    });

    return NextResponse.json({
      ...baseSyncResponse(),
      eventCount: events.length,
      events,
      imageStats
    });
  } catch (error) {
    await recordJobRun({
      job: "avlgo_sync",
      status: "failure",
      detail: error instanceof Error ? error.message : "Unknown error",
      startedAt,
    });
    throw error;
  }
}

function joinDetail(...parts: Array<string | null>) {
  const present = parts.filter(Boolean);
  return present.length > 0 ? present.join(" · ") : null;
}

function baseSyncResponse() {
  return {
    source: isUsingCustomAvlgoFeed() ? "custom AVLGO_API_URL" : "AVLgo public JSON export",
    syncedAt: new Date().toISOString(),
    windowDays: 21,
  };
}

async function attachHiddenActivity(result: EventSyncWithDuplicateAudit) {
  const hiddenIds = Array.from(
    new Set(result.duplicateAudit.flatMap((group) => group.hiddenIds))
  );
  const countsByEvent = await getCommunityCountsByEvent(hiddenIds);

  return result.duplicateAudit.map((group) => ({
    ...group,
    hiddenActivity: group.hiddenIds
      .map((eventId) => ({
        eventId,
        counts: countsByEvent[eventId],
        hasActivity: hasActivity(countsByEvent[eventId]),
      }))
      .filter((activity) => activity.hasActivity),
  }));
}

function hasActivity(counts: CommunityCounts | undefined) {
  if (!counts) {
    return false;
  }

  return (
    counts.songs +
      counts.notes +
      counts.voices +
      counts.going +
      counts.fire >
    0
  );
}
