import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { getEventSignalAttribution } from "@/lib/community";

/**
 * Who is behind an event's Going/Fire ticks (name/email/source/time) for admin
 * attribution tooltips. Returns PII, so it is strictly admin-gated. (Requested Aug 2026.)
 */
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
  }

  const attribution = await getEventSignalAttribution(eventId);
  return NextResponse.json(attribution, { headers: { "cache-control": "no-store" } });
}
