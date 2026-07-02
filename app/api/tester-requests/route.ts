import { NextResponse, after } from "next/server";
import { sendAdminNotificationEmail } from "@/lib/auth-email";
import { renderTesterRequestNotification } from "@/lib/tester-request-emails";
import {
  countPendingTesterRequests,
  upsertTesterRequest,
} from "@/lib/tester-requests";
import {
  isRateLimited,
  normalizeTesterEmail,
  recordAttempt,
  shouldNotifyOwner,
  RATE_MAX_PER_EMAIL,
  RATE_MAX_PER_IP,
  TesterRequestValidationError,
} from "@/lib/tester-requests-core";
import { SchemaNotProvisionedError } from "@/lib/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public Spotify tester request capture (PRD 42 / Phase 17). Anonymous-accessible on purpose — the
 * applicants we most want to catch have no account yet. Body `{ email, note?, source?, website? }`:
 * `website` is the honeypot (same anti-spam pattern as community contributions), and a per-IP +
 * per-email sliding window caps bursts. Upserts one row per email (re-applying never duplicates,
 * never demotes a status) and notifies the owner exactly once per genuine new interest — after the
 * response, never blocking the applicant's confirmation.
 */

// Per-warm-instance sliding windows (Fluid Compute reuses instances, so this genuinely dampens
// bursts; a cold start resetting it is acceptable — the honeypot + upsert semantics still hold).
const attemptsByIp = new Map<string, number[]>();
const attemptsByEmail = new Map<string, number[]>();

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ error: "Spam check failed." }, { status: 400 });
  }

  const email = normalizeTesterEmail(typeof body.email === "string" ? body.email : null);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (
    isRateLimited(attemptsByIp.get(ip) ?? [], now, RATE_MAX_PER_IP) ||
    (email && isRateLimited(attemptsByEmail.get(email) ?? [], now, RATE_MAX_PER_EMAIL))
  ) {
    return NextResponse.json(
      { error: "Too many requests — give it a few minutes and try again." },
      { status: 429 }
    );
  }
  attemptsByIp.set(ip, recordAttempt(attemptsByIp.get(ip) ?? [], now));
  if (email) {
    attemptsByEmail.set(email, recordAttempt(attemptsByEmail.get(email) ?? [], now));
  }

  try {
    const { request: testerRequest, created } = await upsertTesterRequest({
      email,
      note: typeof body.note === "string" ? body.note : null,
      source: typeof body.source === "string" ? body.source : null,
    });

    if (shouldNotifyOwner(created)) {
      const origin = new URL(request.url).origin;
      // Notify after the response is sent — the applicant's confirmation never waits on Resend,
      // and a send failure is logged, not surfaced (the admin queue is the durable record).
      after(async () => {
        try {
          const pendingCount = await countPendingTesterRequests();
          const { subject, html, text } = renderTesterRequestNotification({
            email: testerRequest.email,
            note: testerRequest.note,
            source: testerRequest.source,
            pendingCount,
            adminUrl: `${origin}/admin/spotify-access`,
          });
          await sendAdminNotificationEmail({ subject, html, text });
        } catch (error) {
          console.error("Tester-request owner notification failed:", error);
        }
      });
    }

    // `alreadyRequested` lets the form say "you're already on the list" vs "request received";
    // the row itself (note, source, status detail) stays private to applicant + owner.
    return NextResponse.json({
      status: testerRequest.status,
      alreadyRequested: !created,
    });
  } catch (error) {
    if (error instanceof TesterRequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SchemaNotProvisionedError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Tester request capture failed:", error);
    return NextResponse.json({ error: "Could not save your request." }, { status: 500 });
  }
}
