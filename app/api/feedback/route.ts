import { NextResponse } from "next/server";
import { getOptionalUserId } from "@/lib/current-user";
import { submitFeedback } from "@/lib/feedback";
import { FeedbackValidationError } from "@/lib/feedback-core";
import {
  RATE_LIMIT_MESSAGE,
  createWriteRateLimiter,
  getClientIp,
  honeypotTripped,
} from "@/lib/write-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createWriteRateLimiter({ route: "feedback", maxPerIp: 5 });

/**
 * Listener feedback API. Public (anonymous-friendly) — used by the 404 detour and general feedback.
 * POST a short message (optional email + the path they came from); the user id is attached from the
 * session when signed in, never from the body. Feedback is private to the admin. Resilient: a
 * not-yet-provisioned table degrades to a friendly success rather than a 500.
 */
export async function POST(request: Request) {
  if (limiter.check({ ip: getClientIp(request) })) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (honeypotTripped(body.website)) {
    return NextResponse.json({ error: "Spam check failed." }, { status: 400 });
  }

  try {
    await submitFeedback({
      message: typeof body.message === "string" ? body.message : "",
      email: typeof body.email === "string" ? body.email : null,
      path: typeof body.path === "string" ? body.path : null,
      userId: await getOptionalUserId(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Feedback submission failed:", error);
    return NextResponse.json({ error: "Could not send your note. Try again in a moment." }, { status: 500 });
  }
}
