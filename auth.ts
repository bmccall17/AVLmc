import PostgresAdapter from "@auth/pg-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Spotify from "next-auth/providers/spotify";
import Resend from "next-auth/providers/resend";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getPool } from "@/lib/db";
import { withMultiEmailResolution } from "@/lib/auth-adapter";
import { sendMagicLinkEmail } from "@/lib/auth-email";
import { handleSignInEvent } from "@/lib/auth-signin-event";

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
      // The body lives in lib/auth-signin-event.ts so it is testable in isolation and every step is
      // best-effort by construction: @auth/core awaits this inside the callback, so a throw would
      // abort the response after the session row is created but before the cookie is set (PRD 47 /
      // audit F2). Never add a bare `await` side effect here.
      signIn: handleSignInEvent,
    },
  };
});

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
