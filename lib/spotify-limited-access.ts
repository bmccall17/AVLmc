export const SPOTIFY_LIMITED_BETA_CODE = "spotify_limited_beta_access";

export const SPOTIFY_LIMITED_BETA_MESSAGE =
  "Spotify import is invite-only while we're in Spotify's beta program, so taste sync isn't available for this account yet. Everything else works: sign in with your email and tune your board by hand — no Spotify required.";

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
