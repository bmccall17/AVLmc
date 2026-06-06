import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

export const ANONYMOUS_SESSION_COOKIE_NAME = "avl_anonymous_session";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreateAnonymousSessionId(request: Request) {
  const existing = getCookie(request, ANONYMOUS_SESSION_COOKIE_NAME);

  if (existing && UUID_PATTERN.test(existing)) {
    return existing;
  }

  return randomUUID();
}

export function setAnonymousSessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set({
    name: ANONYMOUS_SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");

  return cookie
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
