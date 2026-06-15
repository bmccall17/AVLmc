import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { loadRecommendationInsight } from "@/lib/admin/insight";

/** Lazy-loaded Recommendation Insight data (PRD 09 / C4). Admin-gated. */
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const insight = await loadRecommendationInsight();
  return NextResponse.json(insight, { headers: { "cache-control": "no-store" } });
}
