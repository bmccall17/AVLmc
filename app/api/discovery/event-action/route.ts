import { NextResponse } from "next/server";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import {
  getCommunityCountsForEvent,
  recordEventIntent,
  recordTicketIntent,
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
import { getEventById } from "@/lib/events";

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

  const counts = await recordCountAction({
    action,
    eventId: event.id,
    eventTitle: event.eventTitle,
    intentSource,
    sessionId,
    userId,
  });
  const recordedState = await recordDiscoveryEventAction({
    action,
    event,
    sessionId,
    source: surface ?? intentSource,
    userId,
  });
  const state =
    recordedState ??
    (await listDiscoveryStates([event.id], { sessionId, userId }))[event.id] ??
    fallbackStateForAction(event.id, action);

  const response = NextResponse.json({ counts, state });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}

function fallbackStateForAction(eventId: string, action: DiscoveryEventAction) {
  const state = emptyDiscoveryState(eventId);

  if (action === "fire") {
    return { ...state, fire: true, fireAt: new Date().toISOString() };
  }
  if (action === "planning") {
    return { ...state, planning: true, planningAt: new Date().toISOString() };
  }
  if (action === "remove") {
    return { ...state, removed: true, removedAt: new Date().toISOString() };
  }

  return state;
}

async function recordCountAction(input: {
  action: DiscoveryEventAction;
  eventId: string;
  eventTitle: string;
  intentSource: EventIntentSource;
  sessionId: string;
  userId: string | null;
}) {
  if (input.action === "planning") {
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

function getString(body: object, key: string) {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
