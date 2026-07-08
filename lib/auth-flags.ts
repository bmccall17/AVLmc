export type AuthFeatureFlags = {
  auth: boolean;
  email: boolean;
  spotify: boolean;
  /** "Sign in with Google" (Auth.js Google OAuth). Persistent account + a durable profile photo. */
  google: boolean;
  googleYouTube: boolean;
  appleMusic: boolean;
  /**
   * Spotify Extended Quota granted (PRD 43/45 / Phase 17): `SPOTIFY_OPEN_ACCESS=true` collapses the
   * Development-Mode gate — the sign-in chooser sends everyone straight to Spotify and hides
   * "Request access". The one-line go-live flip; see docs/product/prds/prd-45-*.md.
   */
  spotifyOpenAccess: boolean;
};

export function getAuthFeatureFlags(): AuthFeatureFlags {
  const auth = isEnabled(process.env.NEXT_PUBLIC_AUTH_ENABLED);

  return {
    auth,
    // Email magic-link sign-in (Auth.js Resend provider). Persistent account without Spotify.
    // Stays off until a verified sender + API key are configured, so the UI hides it gracefully.
    email:
      auth &&
      isEnabled(process.env.AUTH_EMAIL_ENABLED) &&
      Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM),
    spotify:
      auth &&
      isEnabled(process.env.AUTH_SPOTIFY_ENABLED) &&
      Boolean(process.env.AUTH_SPOTIFY_ID && process.env.AUTH_SPOTIFY_SECRET),
    // Google sign-in stays off until OAuth creds are present, so the UI hides the button gracefully.
    google:
      auth &&
      isEnabled(process.env.AUTH_GOOGLE_ENABLED) &&
      Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    googleYouTube: auth && isEnabled(process.env.AUTH_GOOGLE_YOUTUBE_ENABLED),
    appleMusic: auth && isEnabled(process.env.AUTH_APPLE_MUSIC_ENABLED),
    spotifyOpenAccess: isEnabled(process.env.SPOTIFY_OPEN_ACCESS),
  };
}

export function isEnabled(value: string | undefined) {
  const normalized = value?.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
