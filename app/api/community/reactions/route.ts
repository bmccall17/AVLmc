import { NextResponse } from "next/server";
import {
  recordEventIntent,
  toggleReaction,
  type EventIntentSource,
  type ReactionType,
} from "@/lib/community";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { getOptionalUserId } from "@/lib/current-user";
import { recordDiscoveryEventAction } from "@/lib/discovery-memory";
import { revalidateEventSignals } from "@/lib/event-signals-cache";
import { getEventById } from "@/lib/events";

const REACTIONS = new Set<ReactionType>(["going", "fire"]);
const INTENT_SOURCES = new Set<EventIntentSource>(["avlmc", "spotify", "ticket_click"]);

export async function POST(request: Request) {
  const sessionId = getOrCreateAnonymousSessionId(request);
  const userId = await getOptionalUserId();
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = getString(body, "eventId");
  const eventTitle = getString(body, "eventTitle");
  const type = getString(body, "type") as ReactionType | null;
  const source = (getString(body, "source") ?? "avlmc") as EventIntentSource;

  if (!eventId || !eventTitle || !type || !REACTIONS.has(type)) {
    return NextResponse.json({ error: "Missing reaction fields." }, { status: 400 });
  }

  if (type === "going" && source !== "avlmc") {
    if (!userId) {
      return NextResponse.json({ error: "Sign in before saving external intent." }, { status: 401 });
    }
    if (!INTENT_SOURCES.has(source)) {
      return NextResponse.json({ error: "Unsupported intent source." }, { status: 400 });
    }

    const counts = await recordEventIntent({ eventId, eventTitle, sessionId, source, userId });
    await recordReactionDiscoveryAction({ eventId, sessionId, source, type, userId });
    revalidateEventSignals();
    const response = NextResponse.json({ counts });
    setAnonymousSessionCookie(response, sessionId);
    return response;
  }

  const counts = await toggleReaction({ eventId, eventTitle, sessionId, type, userId });
  await recordReactionDiscoveryAction({ eventId, sessionId, source, type, userId });
  revalidateEventSignals();
  const response = NextResponse.json({ counts });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}

async function recordReactionDiscoveryAction(input: {
  eventId: string;
  sessionId: string;
  source: EventIntentSource;
  type: ReactionType;
  userId: string | null;
}) {
  const event = await getEventById(input.eventId);

  if (!event) {
    return;
  }

  await recordDiscoveryEventAction({
    action: input.type === "fire" ? "fire" : "planning",
    event,
    sessionId: input.sessionId,
    source: input.source,
    userId: input.userId,
  });
}

function getString(body: object, key: string) {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
