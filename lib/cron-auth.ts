import { timingSafeEqual } from "node:crypto";

/**
 * Shared bearer gate for the /api/sync/* job routes (PRD 50 / ADR 003 §1). Vercel injects
 * `Authorization: Bearer ${CRON_SECRET}` on cron invocations whenever the CRON_SECRET env var is
 * set, so the scheduled callers keep working while every other caller gets a 401. Fails closed:
 * with no CRON_SECRET configured, nothing is authorized — an unset secret must never silently
 * reopen the routes.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined
): boolean {
  const secret = cronSecret?.trim();
  if (!secret) {
    return false;
  }

  return safeEqual(authorizationHeader ?? "", `Bearer ${secret}`);
}

/**
 * Returns a 401 response the route should return as-is, or null when the caller is authorized.
 * One helper for all four sync handlers — the admin routes' three divergent auth checks are the
 * anti-pattern this avoids.
 */
export function assertCronRequest(request: Request): Response | null {
  if (isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return null;
  }

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
