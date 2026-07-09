import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Serves the personalization-panel redesign sandbox (a static HTML mock kept in docs/) inside the
 * admin portal. Admin-gated so design explorations never leak onto the public site.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();

  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const filePath = path.join(process.cwd(), "docs", "avlmc-redesign-sandbox.html");
  const html = await readFile(filePath, "utf8");

  return new NextResponse(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
