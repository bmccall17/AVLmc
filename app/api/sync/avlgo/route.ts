import { NextResponse } from "next/server";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import {
  isUsingCustomAvlgoFeed,
  syncUpcomingEvents,
  syncUpcomingEventsWithDuplicateAudit,
  type EventSyncWithDuplicateAudit,
} from "@/lib/events";

export async function GET(request: Request) {
  const auditMode = new URL(request.url).searchParams.get("audit");

  if (auditMode === "duplicates") {
    const result = await syncUpcomingEventsWithDuplicateAudit();
    const duplicateGroups = await attachHiddenActivity(result);

    return NextResponse.json({
      ...baseSyncResponse(),
      eventCount: result.events.length,
      events: result.events,
      duplicateAudit: {
        duplicateGroupCount: duplicateGroups.length,
        incomingDuplicateGroupCount: result.incomingDuplicateAudit.length,
        storedDuplicateGroupCount: result.storedDuplicateAudit.length,
        duplicateGroups,
      },
    });
  }

  const events = await syncUpcomingEvents();

  return NextResponse.json({
    ...baseSyncResponse(),
    eventCount: events.length,
    events
  });
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
