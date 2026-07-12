import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import {
  getCommunityCountsForEvent,
  recordEventIntent,
  recordTicketIntent,
  removeEventIntent,
  toggleReaction,
  type EventIntentSource,
} from "@/lib/community";
import { getOptionalUserId } from "@/lib/current-user";
import {
  emptyDiscoveryState,
  listDiscoveryStates,
  recordDiscoveryEventAction,
  type DiscoveryEventAction,
} from "@/lib/discovery-memory";
import { revalidateEventSignals } from "@/lib/event-signals-cache";
import { getEventById } from "@/lib/events";
import { seedSharedSongsForEvent } from "@/lib/shared-songs";
import { addPickIfActiveCurator, hidePickIfActiveCurator } from "@/lib/curators";

const ACTIONS = new Set<DiscoveryEventAction>([
  "impression",
  "detail_open",
  "avlgo_click",
  "fire",
  "planning",
  "remove",
  "unremove",
  "song_contribution",
  "note_contribution",
]);
const INTENT_SOURCES = new Set<EventIntentSource>(["avlmc", "spotify", "ticket_click"]);

export async function POST(request: Request) {
  const sessionId = getOrCreateAnonymousSessionId(request);
  const userId = await getOptionalUserId();
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = getString(body, "eventId");
  const action = getString(body, "action") as DiscoveryEventAction | null;
  const intentSource = (getString(body, "intentSource") ?? "avlmc") as EventIntentSource;
  const surface = getString(body, "surface");

  if (!eventId || !action || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "Missing discovery action fields." }, { status: 400 });
  }

  if (!INTENT_SOURCES.has(intentSource)) {
    return NextResponse.json({ error: "Unsupported intent source." }, { status: 400 });
  }

  if (action === "planning" && intentSource !== "avlmc" && !userId) {
    return NextResponse.json({ error: "Sign in before saving external intent." }, { status: 401 });
  }

  const event = await getEventById(eventId);

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  // State first: fire/planning from the buttons are TOGGLES (external intent sources
  // keep set-once semantics). The post-toggle state then drives the public counts so
  // the button state and the count always move together.
  let recordedState: Awaited<ReturnType<typeof recordDiscoveryEventAction>>;

  try {
    recordedState = await recordDiscoveryEventAction({
      action,
      event,
      sessionId,
      source: surface ?? intentSource,
      toggle: (action === "fire" || action === "planning") && intentSource === "avlmc",
      userId,
    });
  } catch (error) {
    console.error("Discovery state write failed:", error);
    return NextResponse.json(
      { error: "Could not persist your discovery action. Please try again." },
      { status: 500 }
    );
  }

  const state =
    recordedState ??
    (await listDiscoveryStates([event.id], { sessionId, userId }))[event.id] ??
    emptyDiscoveryState(event.id);

  let counts: Awaited<ReturnType<typeof recordCountAction>>;

  try {
    counts = await recordCountAction({
      action,
      eventId: event.id,
      eventTitle: event.eventTitle,
      fireOn: state.fire,
      intentSource,
      planningOn: state.planning,
      sessionId,
      userId,
    });
  } catch (error) {
    console.error("Discovery count write failed:", error);
    return NextResponse.json(
      { error: "Could not update community counts. Please try again." },
      { status: 500 }
    );
  }

  // Shared Listening (PRD 17): a signed-in listener Going/Firing shares the artist's top tracks
  // onto the event page. Awaited so the client's follow-up fetch finds the songs, but fully
  // failure-safe — a Spotify error (incl. limited-beta) must never break the reaction.
  if (
    (action === "fire" || action === "planning") &&
    userId &&
    // Only seed when the toggle landed ON — un-firing/un-going shouldn't share songs.
    (action === "fire" ? state.fire : state.planning)
  ) {
    try {
      await seedSharedSongsForEvent({
        event: { id: event.id, eventTitle: event.eventTitle, artistName: event.artistName },
        userId,
      });
    } catch (error) {
      console.error("Shared songs seed failed (non-fatal):", error);
    }
  }

  // Curator picks (PRD 25 / C3): a signed-in ACTIVE curator's Fire/Going surfaces as a visible pick.
  // Toggled on → upsert a visible pick; toggled off → hide it. No-op for non-curators. Fully
  // failure-safe — a pick write must never break the reaction (same posture as shared songs).
  let curatorPickAdded = false;
  if ((action === "fire" || action === "planning") && userId) {
    const toggledOn = action === "fire" ? state.fire : state.planning;
    try {
      if (toggledOn) {
        curatorPickAdded = await addPickIfActiveCurator(userId, {
          eventId: event.id,
          eventTitle: event.eventTitle,
        });
      } else {
        await hidePickIfActiveCurator(userId, event.id);
      }
    } catch (error) {
      console.error("Curator pick upsert failed (non-fatal):", error);
    }
  }

  if (shouldRevalidateAfterAction(action)) {
    revalidateEventSurfaces(event.id);
  }

  const response = NextResponse.json({ counts, state, curatorPickAdded });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}


async function recordCountAction(input: {
  action: DiscoveryEventAction;
  eventId: string;
  eventTitle: string;
  fireOn: boolean;
  intentSource: EventIntentSource;
  planningOn: boolean;
  sessionId: string;
  userId: string | null;
}) {
  if (input.action === "planning") {
    // Button toggled OFF (avlmc only): remove the intent so the Going count drops.
    // External sources never toggle, so they always land on the record path.
    if (input.intentSource === "avlmc" && !input.planningOn) {
      return removeEventIntent({
        eventId: input.eventId,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    }

    return recordEventIntent({
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      sessionId: input.sessionId,
      source: input.intentSource,
      userId: input.userId,
    });
  }

  if (input.action === "fire") {
    return toggleReaction({
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      on: input.fireOn,
      sessionId: input.sessionId,
      type: "fire",
      userId: input.userId,
    });
  }

  if (input.action === "avlgo_click") {
    return recordTicketIntent({
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      sessionId: input.sessionId,
      userId: input.userId,
    });
  }

  return getCommunityCountsForEvent(input.eventId);
}

function shouldRevalidateAfterAction(action: DiscoveryEventAction) {
  return (
    action === "planning" ||
    action === "fire" ||
    action === "remove" ||
    action === "unremove" ||
    action === "avlgo_click"
  );
}

function revalidateEventSurfaces(eventId: string) {
  revalidatePath("/");
  revalidatePath(`/event/${encodeURIComponent(eventId)}`);
  // Cached public signal maps (PRD 51): counts/shared-songs/picks move on the write itself.
  revalidateEventSignals();
}

function getString(body: object, key: string) {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
