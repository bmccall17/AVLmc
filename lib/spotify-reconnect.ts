/**
 * Spotify "reconnect required" state — the durable answer to a refresh token that Spotify no longer
 * honours. Spotify documents a 6-month refresh-token lifetime and says an `invalid_grant` response
 * to a refresh means the token must be discarded and the user must re-authorize. Without this, a
 * previously working connection "breaks again" and surfaces as a generic sync error with no path
 * back. This error is thrown once the refresh is known-unrecoverable; the API maps it to a code the
 * UI shows as a clean "Reconnect Spotify" prompt (distinct from the invite-only limited-beta 403).
 */

export const SPOTIFY_RECONNECT_CODE = "spotify_reconnect_required";

export const SPOTIFY_RECONNECT_MESSAGE =
  "Your Spotify connection expired and needs to be reconnected. Click Connect Spotify to sign in again — your board and imported taste are untouched.";

export class SpotifyReconnectRequiredError extends Error {
  code = SPOTIFY_RECONNECT_CODE;
  // 409 Conflict: the request is valid but the stored connection state must be re-established first.
  status = 409;

  constructor(message = SPOTIFY_RECONNECT_MESSAGE) {
    super(message);
    this.name = "SpotifyReconnectRequiredError";
  }
}

export function isSpotifyReconnectRequiredError(error: unknown): error is SpotifyReconnectRequiredError {
  return (
    error instanceof SpotifyReconnectRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === SPOTIFY_RECONNECT_CODE)
  );
}

/**
 * Classify a failed Spotify token-refresh response as unrecoverable (refresh token dead → must
 * re-authorize) vs. a transient/other failure worth retrying. Pure so it is unit-tested without a
 * network. Spotify returns HTTP 400 with `{"error":"invalid_grant"}` for a revoked/expired refresh
 * token; a 400 `invalid_client` (bad app creds) is NOT a per-user reconnect and stays a generic
 * error. Body parsing is defensive — Spotify's error body is JSON, but we tolerate garbage.
 */
export function isUnrecoverableRefreshResponse(status: number, body: string): boolean {
  if (status !== 400 && status !== 401) {
    return false;
  }
  let errorCode = "";
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string") {
      errorCode = parsed.error.toLowerCase();
    }
  } catch {
    errorCode = body.toLowerCase();
  }
  return errorCode.includes("invalid_grant");
}
