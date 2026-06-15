import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { loadAnalytics, parseRange } from "@/lib/admin/analytics";

/**
 * Admin-gated analytics read for client-side range switching (PRD 11 / C6).
 * Never exposes the Umami API key — it is read server-side only inside loadAnalytics.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const range = parseRange(new URL(request.url).searchParams.get("range"));
  const analytics = await loadAnalytics(range);
  return NextResponse.json(analytics, { headers: { "cache-control": "no-store" } });
}
