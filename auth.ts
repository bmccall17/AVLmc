import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { cookies } from "next/headers";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getPool } from "@/lib/db";
import { migrateSessionSignalsToUser } from "@/lib/discovery-memory";
import { recordMusicConnection } from "@/lib/music";

const SPOTIFY_SCOPES = ["user-read-private", "user-read-email", "user-top-read"];

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const flags = getAuthFeatureFlags();

  return {
    adapter: PostgresAdapter(getPool()),
    providers: flags.spotify
      ? [
          Spotify({
            clientId: process.env.AUTH_SPOTIFY_ID,
            clientSecret: process.env.AUTH_SPOTIFY_SECRET,
            authorization: `https://accounts.spotify.com/authorize?scope=${encodeURIComponent(SPOTIFY_SCOPES.join(" "))}`,
          }),
        ]
      : [],
    secret:
      process.env.AUTH_SECRET ??
      (process.env.NODE_ENV === "production" ? undefined : "local-auth-secret-change-me"),
    session: {
      strategy: "database",
    },
    pages: {
      error: "/auth/error",
    },
    trustHost: true,
    callbacks: {
      session({ session, user }) {
        if (session.user && user?.id) {
          session.user.id = String(user.id);
        }

        return session;
      },
    },
    events: {
      async signIn({ user, account }) {
        if (!user.id || !account?.provider) {
          return;
        }

        await recordMusicConnection({
          accessToken: account.access_token,
          expiresAt: account.expires_at,
          provider: account.provider,
          refreshToken: account.refresh_token,
          scopes: splitScopes(account.scope),
          tokenType: account.token_type,
          userId: String(user.id),
        });

        // Durable anonymous → account hand-off (PRD 20 / C3): migrate this browser's anonymous
        // session signals to the account so signing in is continuity, not a reset. Best-effort and
        // idempotent — a failure here must never block sign-in.
        try {
          const cookieStore = await cookies();
          const sessionId = getAnonymousSessionIdFromCookieValue(
            cookieStore.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value
          );
          if (sessionId) {
            await migrateSessionSignalsToUser(sessionId, String(user.id));
          }
        } catch (error) {
          console.error("Anonymous session hand-off failed.", error);
        }
      },
    },
  };
});

function splitScopes(scope: string | undefined) {
  return scope?.split(" ").filter(Boolean) ?? [];
}
