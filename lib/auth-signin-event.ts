import { cookies } from "next/headers";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { recordProviderEmail } from "@/lib/account-emails";
import { migrateSessionSignalsToUser } from "@/lib/discovery-memory";
import { recordMusicConnection } from "@/lib/music";
import { isCustomAvatarUrl, setUserImage } from "@/lib/user-image";

/**
 * The `events.signIn` body for `auth.ts`, extracted here so it is testable in isolation and so the
 * "sign-in is sacred" posture is structural, not per-step discipline (PRD 47 / Phase 19 C1, audit
 * F2).
 *
 * `@auth/core` **awaits** `events.signIn` *inside* the callback handler: if it throws, the response
 * aborts after the DB session row is created but before the session cookie is returned, stranding a
 * listener with valid credentials on `/auth/error`. So every side effect here MUST be best-effort —
 * log and continue, never throw. `runBestEffort` makes that impossible to get wrong.
 */

/** Awaits `fn`, swallows any throw (logged with a stable, greppable prefix), never rejects. */
export async function runBestEffort(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`signIn side-effect failed: ${label}`, error);
  }
}

type SignInEvent = {
  user: { id?: string | null; image?: string | null; email?: string | null };
  account?:
    | {
        provider?: string | null;
        access_token?: string;
        expires_at?: number;
        refresh_token?: string;
        scope?: string;
        token_type?: string;
      }
    | null;
  profile?: unknown;
};

/**
 * Injectable side effects. Defaults wire the real implementations; the test passes stubs (e.g. a
 * throwing `recordMusicConnection`) and spies, with no DB or request context. `readAnonymousSessionId`
 * wraps the `cookies()` read so the test never needs a request scope.
 */
export type SignInEventDeps = {
  recordMusicConnection: typeof recordMusicConnection;
  setUserImage: typeof setUserImage;
  recordProviderEmail: typeof recordProviderEmail;
  migrateSessionSignalsToUser: typeof migrateSessionSignalsToUser;
  readAnonymousSessionId: () => Promise<string | null>;
};

const defaultDeps: SignInEventDeps = {
  recordMusicConnection,
  setUserImage,
  recordProviderEmail,
  migrateSessionSignalsToUser,
  readAnonymousSessionId: async () => {
    const cookieStore = await cookies();
    return getAnonymousSessionIdFromCookieValue(
      cookieStore.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value
    );
  },
};

export async function handleSignInEvent(
  { user, account, profile }: SignInEvent,
  deps: SignInEventDeps = defaultDeps
): Promise<void> {
  if (!user.id || !account?.provider) {
    return;
  }

  const userId = String(user.id);
  const provider = account.provider;

  // Only music providers (Spotify) carry a taste-import token. Email magic-link sign-in has
  // no music connection to record — recording one would create a bogus `accounts` row.
  if (provider === "spotify") {
    await runBestEffort("record music connection", () =>
      deps.recordMusicConnection({
        accessToken: account.access_token,
        expiresAt: account.expires_at,
        provider,
        refreshToken: account.refresh_token,
        scopes: splitScopes(account.scope),
        tokenType: account.token_type,
        userId,
      })
    );
  }

  // Refresh the stored avatar from the fresh provider profile. Provider avatars can be signed,
  // expiring URLs (Spotify serves `platform-lookaside.fbsbx.com` Facebook links whose `ext` is
  // an expiry); the adapter writes `users.image` only on first sign-in, so without this a
  // stored URL eventually expires and renders broken. We skip this when the listener has set
  // their own uploaded photo (a Blob URL) so a provider sign-in never clobbers it. Best-effort:
  // a failure must never block sign-in.
  await runBestEffort("refresh profile image", async () => {
    const freshImage = extractProfileImage(provider, profile);
    if (freshImage && freshImage !== user.image && !isCustomAvatarUrl(user.image)) {
      await deps.setUserImage(userId, freshImage);
    }
  });

  // Multi-email identity (PRD 35 / Phase 15): record the email this provider returned against
  // the account so any of a listener's emails resolves to one identity. Best-effort + additive
  // (it never changes sign-in resolution here) — a failure must never block sign-in.
  await runBestEffort("record provider email", () =>
    deps.recordProviderEmail(userId, provider, user.email)
  );

  // Durable anonymous → account hand-off (PRD 20 / C3): migrate this browser's anonymous
  // session signals to the account so signing in is continuity, not a reset. Best-effort and
  // idempotent — a failure here must never block sign-in.
  await runBestEffort("anonymous session hand-off", async () => {
    const sessionId = await deps.readAnonymousSessionId();
    if (sessionId) {
      await deps.migrateSessionSignalsToUser(sessionId, userId);
    }
  });
}

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
