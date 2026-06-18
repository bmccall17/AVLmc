import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { getAccountLinks } from "@/lib/account-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account links API (PRD 35 / Phase 15). Signed-in-only, self-scoped: returns the caller's OWN
 * linked sign-in providers (tokens stripped) and the emails associated with their account, so the
 * profile UI can show "you can sign in with magic link AND Spotify, on one account." Resolves the
 * id from the session, never the body. Returns 401 when anonymous.
 *
 * GET only in this cycle — initiating a link reuses the provider sign-in (`signIn("spotify")` /
 * `signIn("resend")`) from the authenticated profile menu; the merge-safe resolution + duplicate
 * recovery land in the linking callback (PRD 35 follow-up) and PRD 37.
 */
export async function GET() {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const links = await getAccountLinks(userId);
  return NextResponse.json(links, { headers: { "cache-control": "no-store" } });
}

async function getSignedInUserId() {
  if (!getAuthFeatureFlags().auth) {
    return null;
  }
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
