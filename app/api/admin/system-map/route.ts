import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { loadSystemMap } from "@/lib/admin/registry";

/**
 * Agent-readable architecture export (PRD 06 / C1, Outcome 3).
 *
 * Returns the System Registry — nodes, edges, and live counts — as JSON for developers and AI
 * agents. Admin-gated and server-side only. The payload contains no env *values*, OAuth tokens,
 * or session secrets — only configuration variable NAMES, by construction of the registry model.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const systemMap = await loadSystemMap();
  return NextResponse.json(systemMap, {
    headers: { "cache-control": "no-store" },
  });
}
