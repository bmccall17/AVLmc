export type AuthFeatureFlags = {
  auth: boolean;
  spotify: boolean;
  googleYouTube: boolean;
  appleMusic: boolean;
};

export function getAuthFeatureFlags(): AuthFeatureFlags {
  const auth = isEnabled(process.env.NEXT_PUBLIC_AUTH_ENABLED);

  return {
    auth,
    spotify:
      auth &&
      isEnabled(process.env.AUTH_SPOTIFY_ENABLED) &&
      Boolean(process.env.AUTH_SPOTIFY_ID && process.env.AUTH_SPOTIFY_SECRET),
    googleYouTube: auth && isEnabled(process.env.AUTH_GOOGLE_YOUTUBE_ENABLED),
    appleMusic: auth && isEnabled(process.env.AUTH_APPLE_MUSIC_ENABLED),
  };
}

export function isEnabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}
