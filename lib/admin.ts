import { timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "avl_admin_session";

export function getAdminSessionToken() {
  return getRequiredSecret("ADMIN_SESSION_TOKEN", "local-admin-session");
}

export function verifyAdminPassword(password: string) {
  return safeEqual(password, getRequiredSecret("ADMIN_PASSWORD", "stone-soup-admin"));
}

export function isAdminSession(value: string | undefined | null) {
  return safeEqual(value ?? "", getAdminSessionToken());
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequiredSecret(name: "ADMIN_PASSWORD" | "ADMIN_SESSION_TOKEN", localFallback: string) {
  const value = process.env[name];

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production.`);
  }

  return localFallback;
}
