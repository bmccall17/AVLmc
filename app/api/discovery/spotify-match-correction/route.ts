import { NextResponse } from "next/server";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { getOptionalUserId } from "@/lib/current-user";
import {
  recordSpotifyMatchCorrection,
  type SpotifyMatchCorrectionAction,
} from "@/lib/discovery-memory";
import { getEventById } from "@/lib/events";

const ACTIONS = new Set<SpotifyMatchCorrectionAction>(["reject", "replace"]);

export async function POST(request: Request) {
  const sessionId = getOrCreateAnonymousSessionId(request);
  const userId = await getOptionalUserId();
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = getString(body, "eventId");
  const matchedTerm = getString(body, "matchedTerm");
  const normalizedTerm = getString(body, "normalizedTerm");
  const action = getString(body, "action") as SpotifyMatchCorrectionAction | null;

  if (!eventId || !matchedTerm || !normalizedTerm || !action || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "Missing Spotify match correction fields." }, { status: 400 });
  }

  const replacement = typeof body.replacement === "object" && body.replacement !== null
    ? body.replacement as Record<string, unknown>
    : null;

  if (action === "replace" && (!replacement || !getString(replacement, "providerItemId") || !getString(replacement, "name"))) {
    return NextResponse.json({ error: "Missing replacement artist." }, { status: 400 });
  }

  const event = await getEventById(eventId);

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const correction = await recordSpotifyMatchCorrection({
    action,
    event,
    matchedTerm,
    normalizedTerm,
    replacementImageUrl: replacement ? getString(replacement, "imageUrl") : null,
    replacementName: replacement ? getString(replacement, "name") : null,
    replacementProviderItemId: replacement ? getString(replacement, "providerItemId") : null,
    replacementUrl: replacement ? getString(replacement, "externalUrl") : null,
    sessionId,
    userId,
  });

  const response = NextResponse.json({ correction });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}

function getString(source: Record<string, unknown>, key: string) {
  const value = source[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
