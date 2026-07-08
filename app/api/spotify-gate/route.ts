import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { checkSpotifyGate } from "@/lib/spotify-gate";
import {
  isRateLimited,
  normalizeTesterEmail,
  recordAttempt,
  RATE_MAX_PER_IP,
} from "@/lib/tester-requests-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spotify pre-redirect gate API (PRD 43 / Phase 17).
 *   GET  → chooser config: `{ openAccess, spotifyEnabled, emailEnabled }` — flags only, no DB read,
 *          so with SPOTIFY_OPEN_ACCESS=true no gate check ever touches a store.
 *   POST → the gate check: `{ email? }` (a signed-in caller's session email/id is used when the
 *          body omits one) → `{ outcome, email }`. Outcomes: allowed | pending | declined |
 *          not_found | email_required. Rate-limited per IP like the capture API; outcomes reveal
 *          only beta-list membership (low stakes), never notes or other fields.
 */
export function GET() {
  const flags = getAuthFeatureFlags();
  return NextResponse.json(
    {
      openAccess: flags.spotifyOpenAccess,
      spotifyEnabled: flags.spotify,
      emailEnabled: flags.email,
      googleEnabled: flags.google,
    },
    { headers: { "cache-control": "no-store" } }
  );
}

// Per-warm-instance sliding window (same posture as app/api/tester-requests).
const attemptsByIp = new Map<string, number[]>();

export async function POST(request: Request) {
  const flags = getAuthFeatureFlags();

  // Open access: always allowed, and deliberately no rate limit / session / DB work at all.
  if (flags.spotifyOpenAccess) {
    return NextResponse.json({ outcome: "allowed" });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (isRateLimited(attemptsByIp.get(ip) ?? [], now, RATE_MAX_PER_IP)) {
    return NextResponse.json(
      { error: "Too many checks — give it a few minutes and try again." },
      { status: 429 }
    );
  }
  attemptsByIp.set(ip, recordAttempt(attemptsByIp.get(ip) ?? [], now));

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const statedEmail = normalizeTesterEmail(typeof body?.email === "string" ? body.email : null);

  const session = await auth().catch(() => null);
  const sessionEmail = normalizeTesterEmail(session?.user?.email);
  const email = statedEmail || sessionEmail;

  try {
    const outcome = await checkSpotifyGate({ email, userId: session?.user?.id ?? null });
    // Echo the checked email so the chooser can pre-fill the request form on a miss.
    return NextResponse.json({ outcome, email });
  } catch (error) {
    console.error("Spotify gate check failed:", error);
    // An unreadable gate must not strand a would-be tester: degrade to the request path.
    return NextResponse.json({ outcome: email ? "not_found" : "email_required", email });
  }
}
