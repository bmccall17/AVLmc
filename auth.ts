import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Spotify from "next-auth/providers/spotify";
import Resend from "next-auth/providers/resend";
import { cookies } from "next/headers";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getPool } from "@/lib/db";
import { migrateSessionSignalsToUser } from "@/lib/discovery-memory";
import { recordProviderEmail } from "@/lib/account-emails";
import { withMultiEmailResolution } from "@/lib/auth-adapter";
import { sendMagicLinkEmail } from "@/lib/auth-email";
import { recordMusicConnection } from "@/lib/music";
import { isCustomAvatarUrl, setUserImage } from "@/lib/user-image";

const SPOTIFY_SCOPES = ["user-read-private", "user-read-email", "user-top-read"];

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const flags = getAuthFeatureFlags();

  return {
    // Multi-email identity (PRD 35): resolve incoming emails through `user_emails`, so signing in
    // with ANY recorded email lands on the one account instead of forking a duplicate user.
    adapter: withMultiEmailResolution(PostgresAdapter(getPool())),
    // Email magic-link is the primary, Spotify-independent sign-in (persistent account);
    // Spotify is an optional, invite-only-beta taste-import enhancement on top. Each provider is
    // only registered when its feature flag (creds present) is on.
    providers: [
      ...(flags.email
        ? [
            Resend({
              apiKey: process.env.AUTH_RESEND_KEY,
              from: resolveEmailFrom(process.env.AUTH_EMAIL_FROM),
              // Replace Auth.js's stock light-mode email with the branded dark-mode
              // sign-in email (see lib/auth-email.ts + docs/design/AVLmc-Design-Spec.md).
              async sendVerificationRequest({ identifier, url, provider }) {
                await sendMagicLinkEmail({
                  to: identifier,
                  url,
                  apiKey: String(provider.apiKey),
                  from: String(provider.from),
                });
              },
            }),
          ]
        : []),
      ...(flags.google
        ? [
            Google({
              clientId: process.env.AUTH_GOOGLE_ID,
              clientSecret: process.env.AUTH_GOOGLE_SECRET,
              // Same justification as Spotify below: Google verifies its emails, so a Google sign-in
              // whose email matches an existing account links onto it (one identity per person, PRD 44)
              // instead of raising OAuthAccountNotLinked. Any future provider must re-justify this.
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : []),
      ...(flags.spotify
        ? [
            Spotify({
              clientId: process.env.AUTH_SPOTIFY_ID,
              clientSecret: process.env.AUTH_SPOTIFY_SECRET,
              authorization: `https://accounts.spotify.com/authorize?scope=${encodeURIComponent(SPOTIFY_SCOPES.join(" "))}`,
              // One identity per person (PRD 44 / Phase 17): a fresh Spotify sign-in whose email
              // matches an existing account links onto it instead of raising OAuthAccountNotLinked.
              // Safe HERE because both doors prove email ownership — Spotify verifies its emails,
              // and a Resend magic link IS possession of the inbox. Any future provider must
              // re-justify this flag explicitly (do not copy it blindly).
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : []),
    ],
    secret:
      process.env.AUTH_SECRET ??
      (process.env.NODE_ENV === "production" ? undefined : "local-auth-secret-change-me"),
    session: {
      strategy: "database",
    },
    pages: {
      // The product's own chooser (PRD 43) — no funnel state shows NextAuth's unstyled default.
      signIn: "/auth/signin",
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
      async signIn({ user, account, profile }) {
        if (!user.id || !account?.provider) {
          return;
        }

        // Only music providers (Spotify) carry a taste-import token. Email magic-link sign-in has
        // no music connection to record — recording one would create a bogus `accounts` row.
        if (account.provider === "spotify") {
          await recordMusicConnection({
            accessToken: account.access_token,
            expiresAt: account.expires_at,
            provider: account.provider,
            refreshToken: account.refresh_token,
            scopes: splitScopes(account.scope),
            tokenType: account.token_type,
            userId: String(user.id),
          });
        }

        // Refresh the stored avatar from the fresh provider profile. Provider avatars can be signed,
        // expiring URLs (Spotify serves `platform-lookaside.fbsbx.com` Facebook links whose `ext` is
        // an expiry); the adapter writes `users.image` only on first sign-in, so without this a
        // stored URL eventually expires and renders broken. We skip this when the listener has set
        // their own uploaded photo (a Blob URL) so a provider sign-in never clobbers it. Best-effort:
        // a failure must never block sign-in.
        try {
          const freshImage = extractProfileImage(account.provider, profile);
          if (freshImage && freshImage !== user.image && !isCustomAvatarUrl(user.image)) {
            await setUserImage(String(user.id), freshImage);
          }
        } catch (error) {
          console.error("Failed to refresh profile image on sign-in.", error);
        }

        // Multi-email identity (PRD 35 / Phase 15): record the email this provider returned against
        // the account so any of a listener's emails resolves to one identity. Best-effort + additive
        // (it never changes sign-in resolution here) — a failure must never block sign-in.
        await recordProviderEmail(String(user.id), account.provider, user.email);

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

/**
 * Pull the current avatar URL from a raw OAuth profile. Spotify exposes `images: [{ url }]` (largest
 * first); Google exposes a single `picture` string. Returns undefined when there's no usable image
 * so callers leave the stored value alone.
 */
function extractProfileImage(provider: string, profile: unknown): string | undefined {
  if (!profile || typeof profile !== "object") {
    return undefined;
  }

  if (provider === "google") {
    const picture = (profile as { picture?: unknown }).picture;
    return typeof picture === "string" && picture.length > 0 ? picture : undefined;
  }

  if (provider === "spotify") {
    const images = (profile as { images?: unknown }).images;
    if (Array.isArray(images)) {
      for (const entry of images) {
        const url = (entry as { url?: unknown })?.url;
        if (typeof url === "string" && url.length > 0) {
          return url;
        }
      }
    }
  }

  return undefined;
}

/**
 * Normalize the email-sender env (`AUTH_EMAIL_FROM`) for Resend. Resend requires
 * `email@example.com` or `Name <email@example.com>` and rejects anything else (422). A very common
 * deploy mistake is storing the value WITH surrounding quotes (e.g. `"AVLmc <a@b.com>"`) so the
 * quotes become part of the address — strip a single wrapping pair + whitespace so that can't break
 * sign-in. (Domain verification is separate — that surfaces as a 403, not a format error.)
 */
function resolveEmailFrom(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^["'](.*)["']$/, "$1").trim();
}
