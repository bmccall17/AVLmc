import "server-only";
import { query } from "@/lib/db";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { resolveGateOutcome, type SpotifyGateOutcome } from "@/lib/spotify-gate-core";
import type { SpotifyAccessRequestStatus } from "@/lib/spotify-access-requests-core";
import type { TesterRequestStatus } from "@/lib/tester-requests-core";

/**
 * Spotify pre-redirect gate — data service (PRD 43 / Phase 17). Resolves whether an email/account
 * may proceed to `signIn("spotify")` BEFORE the redirect, so a non-allowlisted listener is caught
 * by the chooser instead of stranded on Spotify's Development-Mode 403. Reads both request stores
 * (the anonymous `tester_requests` loop and the signed-in `spotify_access_requests` loop) —
 * most-permissive-wins, since both mirror the one dashboard allowlist. `SPOTIFY_OPEN_ACCESS=true`
 * short-circuits to allowed without touching the DB (the C4 flag flip). Reads are 42P01-tolerant.
 */
export async function checkSpotifyGate(input: {
  /** The stated or session email (normalized here). */
  email?: string | null;
  /** The session user id, when signed in — also matches their PRD 36 request. */
  userId?: string | number | null;
}): Promise<SpotifyGateOutcome> {
  if (getAuthFeatureFlags().spotifyOpenAccess) {
    return resolveGateOutcome({
      openAccess: true,
      identified: true,
      testerStatus: null,
      accessStatus: null,
    });
  }

  const email = (input.email ?? "").trim().toLowerCase();
  const userId = Number(input.userId);
  const hasUser = Number.isInteger(userId) && userId >= 1;

  if (!email && !hasUser) {
    return resolveGateOutcome({
      openAccess: false,
      identified: false,
      testerStatus: null,
      accessStatus: null,
    });
  }

  const [testerStatus, accessStatus] = await Promise.all([
    email ? getTesterStatus(email) : Promise.resolve(null),
    getSpotifyAccessStatus({ email, userId: hasUser ? userId : null }),
  ]);

  return resolveGateOutcome({ openAccess: false, identified: true, testerStatus, accessStatus });
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}

function isToleratedSchemaError(error: unknown): boolean {
  return hasErrorCode(error, "42P01") || hasErrorCode(error, "42703");
}

async function getTesterStatus(email: string): Promise<TesterRequestStatus | null> {
  try {
    const result = await query<{ status: TesterRequestStatus }>(
      `select status from public.tester_requests where email = $1`,
      [email]
    );
    return result.rows[0]?.status ?? null;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * The PRD 36 store, matched by the session user OR the stated Spotify email (someone slot-added
 * through the signed-in loop may hit the chooser anonymously from another browser). When several
 * rows match, the most seat-like row decides — mirror of the gate's most-permissive-wins.
 */
async function getSpotifyAccessStatus(input: {
  email: string;
  userId: number | null;
}): Promise<SpotifyAccessRequestStatus | null> {
  if (!input.email && input.userId === null) {
    return null;
  }
  try {
    const result = await query<{ status: SpotifyAccessRequestStatus }>(
      `
        select status
          from public.spotify_access_requests
         where ($1::int is not null and user_id = $1)
            or ($2 <> '' and lower(spotify_email) = $2)
         order by array_position(array['slot_added', 'approved', 'pending', 'rejected'], status)
         limit 1
      `,
      [input.userId, input.email]
    );
    return result.rows[0]?.status ?? null;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return null;
    }
    throw error;
  }
}
