import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { sendTesterInviteEmail } from "@/lib/tester-request-emails";
import {
  countSeatedTesterEmails,
  listTesterRequests,
  setTesterRequestStatus,
} from "@/lib/tester-requests";
import { TESTER_SEAT_BUDGET, TESTER_SEAT_WARNING_AT } from "@/lib/tester-requests-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin tester-request review (PRD 42 / Phase 17). Works the anonymous email-keyed queue that the
 * public /spotify-access form fills (the signed-in `spotify_access_requests` queue from PRD 36 has
 * its own route; the seat count here spans both). Actions encode the loop's side effects:
 *   approve → status `approved`, then the "you're in" invite email; `invited` once it sends. The
 *             owner allowlists the email in the Spotify Developer Dashboard FIRST — the panel copy
 *             enforces the order. A failed send stays `approved` so the panel can retry the send.
 *   decline → `declined` (the applicant can re-apply without re-notifying the owner).
 *   reopen  → back to `pending` (e.g. to reconsider a decline, or to re-run a botched approve).
 * Admin-cookie gated; mirrors app/api/admin/spotify-access.
 */
export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const [requests, seatsUsed] = await Promise.all([listTesterRequests(), countSeatedTesterEmails()]);
  return NextResponse.json(
    {
      requests,
      seats: { used: seatsUsed, budget: TESTER_SEAT_BUDGET, warnAt: TESTER_SEAT_WARNING_AT },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : null;
  if (id === null || !action) {
    return NextResponse.json({ error: "An id and action are required." }, { status: 400 });
  }

  try {
    if (action === "decline" || action === "reopen") {
      const updated = await setTesterRequestStatus(id, action === "decline" ? "declined" : "pending");
      return updated
        ? NextResponse.json({ request: updated })
        : NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (action === "approve") {
      const approved = await setTesterRequestStatus(id, "approved");
      if (!approved) {
        return NextResponse.json({ error: "Request not found." }, { status: 404 });
      }
      // Invite send is best-effort: a Resend failure keeps the row `approved` (never rolls back),
      // and the panel shows "approved — invite not sent" with a retry via approve again.
      try {
        const origin = new URL(request.url).origin;
        await sendTesterInviteEmail({ to: approved.email, signInUrl: `${origin}/` });
      } catch (error) {
        console.error("Tester invite email failed:", error);
        return NextResponse.json({ request: approved, inviteSent: false });
      }
      const invited = await setTesterRequestStatus(id, "invited");
      return NextResponse.json({ request: invited ?? approved, inviteSent: true });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("Tester request update failed:", error);
    return NextResponse.json({ error: "Could not update the request." }, { status: 400 });
  }
}

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

function unauthorized() {
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}
