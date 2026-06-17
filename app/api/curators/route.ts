import { NextResponse } from "next/server";
import { listCurators } from "@/lib/curators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public curator directory (PRD 25 / C3): active curators + visible pick counts only. No private
 * data, no non-curator listeners, no tokens/PII. Anonymous-safe.
 */
export async function GET() {
  const curators = await listCurators();
  return NextResponse.json({ curators });
}
