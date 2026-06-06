import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getPool } from "@/lib/db";
import { recordMusicConnection } from "@/lib/music";

const SPOTIFY_SCOPES = ["user-read-private", "user-read-email", "user-top-read"];

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const flags = getAuthFeatureFlags();

  return {
    adapter: PostgresAdapter(getPool()),
    providers: flags.spotify
      ? [
          Spotify({
            authorization: {
              params: {
                scope: SPOTIFY_SCOPES.join(" "),
              },
            },
          }),
        ]
      : [],
    secret:
      process.env.AUTH_SECRET ??
      (process.env.NODE_ENV === "production" ? undefined : "local-auth-secret-change-me"),
    session: {
      strategy: "database",
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
      },
    },
  };
});

function splitScopes(scope: string | undefined) {
  return scope?.split(" ").filter(Boolean) ?? [];
}
