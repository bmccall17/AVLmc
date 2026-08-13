import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";

/**
 * Non-PII probe so the client can decide whether to attach admin-only affordances
 * (e.g. the who-clicked hover on Going/Fire ticks). Returns only a boolean.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const admin = isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
  return NextResponse.json({ admin }, { headers: { "cache-control": "no-store" } });
}
