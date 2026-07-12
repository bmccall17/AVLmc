import {
  RATE_WINDOW_MS,
  isRateLimited,
  recordAttempt,
} from "@/lib/tester-requests-core";

/**
 * Shared sliding-window rate limiting for the public write routes (PRD 52 / ADR 003 §4).
 *
 * Deliberately in-memory and per-instance: free, dependency-less, and adequate at current scale
 * because Fluid Compute reuses warm instances (ADR 003 amendment 4 records this as the accepted
 * limitation — the Vercel WAF rules are the cross-instance backstop, and a KV-backed limiter is
 * the escape hatch only if multi-instance accuracy becomes a measured problem).
 *
 * Pure module — no next/server, no DB — so tests/write-rate-limits.test.ts runs it bare-node.
 * Each route creates one limiter at module level and calls `check()` before parsing the body;
 * `check()` gates BEFORE recording (the tester-requests contract), across an IP dimension and an
 * optional identity dimension (session/user id). Rotating the identity (e.g. clearing the
 * anonymous-session cookie) does not reset the IP dimension.
 */

export type WriteRateLimitConfig = {
  /** Namespace so routes never share windows (e.g. "feedback"). */
  route: string;
  maxPerIp: number;
  maxPerIdentity?: number;
  windowMs?: number;
};

export type WriteRateLimiter = {
  /** True when this attempt is over the limit; otherwise records it and returns false. */
  check(input: { ip: string; identity?: string | null; now?: number }): boolean;
  /** Test hook — clears every window this limiter owns. */
  reset(): void;
};

const windows = new Map<string, number[]>();

export function createWriteRateLimiter(config: WriteRateLimitConfig): WriteRateLimiter {
  const windowMs = config.windowMs ?? RATE_WINDOW_MS;
  const ipKey = (ip: string) => `${config.route}|ip|${ip}`;
  const identityKey = (identity: string) => `${config.route}|id|${identity}`;

  const limitedAt = (key: string, now: number, max: number): boolean => {
    const window = windows.get(key) ?? [];
    if (isRateLimited(window, now, max, windowMs)) {
      return true;
    }
    windows.set(key, recordAttempt(window, now, windowMs));
    return false;
  };

  return {
    check({ ip, identity, now = Date.now() }) {
      // Gate both dimensions before recording either, so a limited attempt never inflates the
      // other dimension's window.
      const ipWindow = windows.get(ipKey(ip)) ?? [];
      if (isRateLimited(ipWindow, now, config.maxPerIp, windowMs)) {
        return true;
      }
      if (identity && config.maxPerIdentity !== undefined) {
        if (limitedAt(identityKey(identity), now, config.maxPerIdentity)) {
          return true;
        }
      }
      windows.set(ipKey(ip), recordAttempt(ipWindow, now, windowMs));
      return false;
    },
    reset() {
      const prefix = `${config.route}|`;
      for (const key of windows.keys()) {
        if (key.startsWith(prefix)) {
          windows.delete(key);
        }
      }
    },
  };
}

/** First hop of x-forwarded-for (Vercel sets it), or "unknown" outside a proxy. */
export function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** The `website` honeypot: legit clients submit it empty; bots fill it. */
export function honeypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const RATE_LIMIT_MESSAGE = "Too many requests — give it a few minutes and try again.";
