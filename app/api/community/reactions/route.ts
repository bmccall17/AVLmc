import { NextResponse } from "next/server";
import { toggleReaction, type ReactionType } from "@/lib/community";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { getOptionalUserId } from "@/lib/current-user";

const REACTIONS = new Set<ReactionType>(["going", "fire"]);

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

  if (!eventId || !eventTitle || !type || !REACTIONS.has(type)) {
    return NextResponse.json({ error: "Missing reaction fields." }, { status: 400 });
  }

  const counts = await toggleReaction({ eventId, eventTitle, sessionId, type, userId });
  const response = NextResponse.json({ counts });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}

function getString(body: object, key: string) {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
