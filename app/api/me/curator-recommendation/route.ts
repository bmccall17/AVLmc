import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { submitCuratorRecommendation } from "@/lib/curator-recommendations";
import { CuratorRecommendationValidationError } from "@/lib/curator-recommendations-core";
import { sendAdminNotificationEmail } from "@/lib/auth-email";
import { SchemaNotProvisionedError } from "@/lib/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Recommend a curator" submit API (parked backlog item). Signed-in-only listener plane:
 *   POST → nominate someone who should curate ("I know someone"). Distinct from the self-serve
 *   application API (a caller applies as themselves) — here the nominee is free text.
 * The submitter id always comes from the session, NEVER the request body. Recommendations are
 * private to submitter + admin (never public, no pay-to-play). Returns 401 when anonymous.
 * On a successful submit it best-effort emails the admin queue — a Resend failure never fails the
 * submit. Mirrors app/api/me/curator-application + app/api/me/spotify-access-request.
 */
export async function POST(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await submitCuratorRecommendation({
      userId,
      nomineeName: typeof body.nomineeName === "string" ? body.nomineeName : "",
      nomineeLink: typeof body.nomineeLink === "string" ? body.nomineeLink : null,
      reason: typeof body.reason === "string" ? body.reason : null,
    });

    await notifyAdmin({
      nomineeName: typeof body.nomineeName === "string" ? body.nomineeName : "",
      nomineeLink: typeof body.nomineeLink === "string" ? body.nomineeLink : null,
      reason: typeof body.reason === "string" ? body.reason : null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CuratorRecommendationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SchemaNotProvisionedError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Curator recommendation failed:", error);
    return NextResponse.json({ error: "Curator recommendation unavailable." }, { status: 500 });
  }
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

/** Escape user-supplied text before it lands in the admin notification HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Best-effort admin email on a new recommendation — never throws (so it can't fail the submit). */
async function notifyAdmin(input: {
  nomineeName: string;
  nomineeLink: string | null;
  reason: string | null;
}) {
  const name = escapeHtml(input.nomineeName.trim());
  const link = input.nomineeLink?.trim() ? escapeHtml(input.nomineeLink.trim()) : null;
  const reason = input.reason?.trim() ? escapeHtml(input.reason.trim()) : null;

  const subject = `New curator recommendation: ${input.nomineeName.trim()}`;
  const html = `<p>A listener recommended a curator on AVL Music Companion.</p>
<p><strong>Nominee:</strong> ${name}</p>
${link ? `<p><strong>Link:</strong> ${link}</p>` : ""}
${reason ? `<p><strong>Why:</strong> ${reason}</p>` : ""}
<p>Review it in the admin curators queue.</p>`;
  const text = [
    "A listener recommended a curator on AVL Music Companion.",
    `Nominee: ${input.nomineeName.trim()}`,
    link ? `Link: ${input.nomineeLink?.trim()}` : null,
    reason ? `Why: ${input.reason?.trim()}` : null,
    "Review it in the admin curators queue.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await sendAdminNotificationEmail({ subject, html, text });
  } catch (error) {
    console.error("Curator recommendation admin email failed (non-fatal):", error);
  }
}
