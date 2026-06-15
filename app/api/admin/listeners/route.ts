import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { listTraceableListeners, loadListenerTrace } from "@/lib/admin/listener-graph";

/**
 * Lazy-loaded Listener Taste Graph bootstrap (PRD 10 / C5): the listener directory plus the first
 * listener's trace. Admin-gated; never returns tokens or secrets. Individual listener switching
 * uses GET /api/admin/listener-trace?id=.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const listeners = await listTraceableListeners();
  const trace = listeners[0] ? await loadListenerTrace(listeners[0].identityKey) : null;
  return NextResponse.json({ listeners, trace }, { headers: { "cache-control": "no-store" } });
}
