import "server-only";
import type { Adapter } from "@auth/core/adapters";
import { findUserIdByEmail } from "@/lib/account-emails";

/**
 * Multi-email sign-in resolution (PRD 35 / Phase 15). Wraps the Auth.js `PostgresAdapter` so an
 * incoming email is resolved through `user_emails` — the real identity key — and not only through
 * `users.email`. This is what makes "sign in with ANY of my recorded emails → my one account" true:
 * a magic link sent to a platform-sourced secondary email (e.g. the email Spotify returned) lands on
 * the existing account instead of minting a duplicate user.
 *
 * Deliberately **additive**: it only consults `user_emails` when the adapter's own lookup misses, so
 * it never changes an existing hit — it only resolves *more* cases. It does not enable
 * `allowDangerousEmailAccountLinking`; for an OAuth provider whose email already belongs to a
 * different account while NOT signed in, the now-found user makes Auth.js raise `OAuthAccountNotLinked`
 * (mapped to the PRD 37 `duplicate_account` recovery) rather than silently forking or merging.
 */
export function withMultiEmailResolution(adapter: Adapter): Adapter {
  const baseGetUserByEmail = adapter.getUserByEmail?.bind(adapter);
  const baseGetUser = adapter.getUser?.bind(adapter);

  return {
    ...adapter,
    async getUserByEmail(email) {
      // 1. The adapter's own lookup (covers the primary `users.email`) — unchanged behavior.
      if (baseGetUserByEmail) {
        const direct = await baseGetUserByEmail(email);
        if (direct) {
          return direct;
        }
      }
      // 2. Fallback: resolve a secondary/platform email through `user_emails` to its owning account.
      const userId = await findUserIdByEmail(email);
      if (!userId || !baseGetUser) {
        return null;
      }
      return baseGetUser(userId);
    },
  };
}
