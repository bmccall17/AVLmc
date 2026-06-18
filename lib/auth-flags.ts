export type AuthFeatureFlags = {
  auth: boolean;
  email: boolean;
  spotify: boolean;
  googleYouTube: boolean;
  appleMusic: boolean;
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
    googleYouTube: auth && isEnabled(process.env.AUTH_GOOGLE_YOUTUBE_ENABLED),
    appleMusic: auth && isEnabled(process.env.AUTH_APPLE_MUSIC_ENABLED),
  };
}

export function isEnabled(value: string | undefined) {
  const normalized = value?.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
