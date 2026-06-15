import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { loadListenerTrace } from "@/lib/admin/listener-graph";

/**
 * Admin-gated per-listener taste trace (PRD 10 / C5).
 *
 * Highest-sensitivity surface: requires an admin session and returns only the trace the admin view
 * renders — never OAuth tokens, refresh tokens, or session secrets (the loader does not read them).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Listener id is required." }, { status: 400 });
  }

  const trace = await loadListenerTrace(id);
  if (!trace) {
    return NextResponse.json({ error: "Listener not found." }, { status: 404 });
  }

  return NextResponse.json({ trace }, { headers: { "cache-control": "no-store" } });
}
