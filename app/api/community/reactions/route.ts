import { NextResponse } from "next/server";
import { toggleReaction, type ReactionType } from "@/lib/community";

const REACTIONS = new Set<ReactionType>(["going", "fire"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const eventId = getString(body, "eventId");
  const eventTitle = getString(body, "eventTitle");
  const sessionId = getString(body, "sessionId");
  const type = getString(body, "type") as ReactionType | null;

  if (!eventId || !eventTitle || !sessionId || !type || !REACTIONS.has(type)) {
    return NextResponse.json({ error: "Missing reaction fields." }, { status: 400 });
  }

  const counts = await toggleReaction({ eventId, eventTitle, sessionId, type });
  return NextResponse.json({ counts });
}

function getString(body: object, key: string) {
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
