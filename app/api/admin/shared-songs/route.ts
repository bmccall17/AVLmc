import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import {
  setSharedSongStatus,
  type SharedSongStatus,
} from "@/lib/shared-songs";
import { revalidateEventSignals } from "@/lib/event-signals-cache";

const STATUSES = new Set<SharedSongStatus>(["visible", "hidden", "pending"]);

// Admin moderation for the Shared Listening surface (PRD 17), mirroring the contributions
// moderation route so a shared song can be hidden — it can't become a spam vector.
export async function POST(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (!isAdminSession(cookie)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : null;
  const status = typeof body?.status === "string" ? (body.status as SharedSongStatus) : null;

  if (!id || !status || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid moderation action." }, { status: 400 });
  }

  const song = await setSharedSongStatus(id, status);

  if (!song) {
    return NextResponse.json({ error: "Shared song not found." }, { status: 404 });
  }

  revalidateEventSignals();
  return NextResponse.json({ song });
}
