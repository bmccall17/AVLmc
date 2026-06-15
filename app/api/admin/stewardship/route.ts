import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { loadStewardship } from "@/lib/admin/stewardship";

/** Lazy-loaded Content & Data Stewardship data (PRD 08 / C3). Admin-gated. */
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const stewardship = await loadStewardship();
  return NextResponse.json(stewardship, { headers: { "cache-control": "no-store" } });
}
