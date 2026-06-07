import { NextResponse } from "next/server";
import { recordTicketIntent } from "@/lib/community";
import { recordDiscoveryEventAction } from "@/lib/discovery-memory";
import { getEventById } from "@/lib/events";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { getOptionalUserId } from "@/lib/current-user";

export async function POST(request: Request) {
  const sessionId = getOrCreateAnonymousSessionId(request);
  const userId = await getOptionalUserId();
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = getString(body, "eventId");
  const eventTitle = getString(body, "eventTitle");

  if (!eventId || !eventTitle) {
    return NextResponse.json({ error: "Missing ticket intent fields." }, { status: 400 });
  }

  const counts = await recordTicketIntent({ eventId, eventTitle, sessionId, userId });
  const event = await getEventById(eventId);

  if (event) {
    await recordDiscoveryEventAction({
      action: "avlgo_click",
      event,
      sessionId,
      source: "ticket-intents",
      userId,
    });
  }

  const response = NextResponse.json({ counts });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}

function getString(body: object, key: string) {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
