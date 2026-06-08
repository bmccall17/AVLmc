export const SPOTIFY_LIMITED_BETA_CODE = "spotify_limited_beta_access";

export const SPOTIFY_LIMITED_BETA_MESSAGE =
  "Spotify personalization is currently in beta testing. Core AVL Music Companion features remain available.";

export class SpotifyLimitedBetaAccessError extends Error {
  code = SPOTIFY_LIMITED_BETA_CODE;
  status = 403;

  constructor(message = SPOTIFY_LIMITED_BETA_MESSAGE) {
    super(message);
    this.name = "SpotifyLimitedBetaAccessError";
  }
}

export function isSpotifyLimitedBetaAccessError(error: unknown): error is SpotifyLimitedBetaAccessError {
  return (
    error instanceof SpotifyLimitedBetaAccessError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === SPOTIFY_LIMITED_BETA_CODE)
  );
}
