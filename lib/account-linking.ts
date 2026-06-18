/**
 * Account identity & linking — pure decision logic (PRD 35 / Phase 15). No DB/network imports, so
 * the merge-safe rule that decides "link vs. create vs. conflict" is unit-tested in isolation
 * (tests/account-linking.test.ts) and reused by the `auth.ts` linking callback + the adapter's
 * email resolution. It never performs the link; it only decides what is safe to do.
 *
 * Posture (locked, see the epic): one human = one `users` row that can own MANY verified emails.
 * Linking happens while authenticated; an email owned by a DIFFERENT account is never silently
 * merged — it's handed to the duplicate-account recovery (PRD 37). No blind email auto-linking.
 */

/** Where an associated email came from. Only magic_link + spotify are wired in Phase 15. */
export type EmailSource = "magic_link" | "spotify" | "google_youtube" | "apple_music";

export type AccountLinkInputs = {
  /** The current session user id when the listener is already signed in (i.e. linking). Else null. */
  sessionUserId: string | null;
  /** The user id that already owns the incoming email (resolved from `user_emails`), if any. */
  emailOwnerUserId: string | null;
};

export type AccountLinkDecision =
  /** Attach the incoming provider account + email to this existing `users.id`. */
  | { kind: "link"; userId: string }
  /** No existing owner → create the account and seed `user_emails`. */
  | { kind: "create" }
  /** Email is owned by a DIFFERENT account → do not merge; hand to recovery (PRD 37). */
  | { kind: "conflict"; ownerUserId: string };

/**
 * Resolve the safe action for an incoming provider identity + email.
 *
 * - Signed in (linking a second method):
 *   - email unowned, or already owned by the current account → **link** onto the current account.
 *   - email owned by a different account → **conflict** (never silently merge).
 * - Not signed in (plain sign-in):
 *   - email already owned → **link** to the owning account (so any recorded email = one identity).
 *   - email unowned → **create** a new account.
 */
export function resolveAccountLink({
  sessionUserId,
  emailOwnerUserId,
}: AccountLinkInputs): AccountLinkDecision {
  if (sessionUserId) {
    if (!emailOwnerUserId || emailOwnerUserId === sessionUserId) {
      return { kind: "link", userId: sessionUserId };
    }
    return { kind: "conflict", ownerUserId: emailOwnerUserId };
  }

  if (emailOwnerUserId) {
    return { kind: "link", userId: emailOwnerUserId };
  }
  return { kind: "create" };
}

/** Normalize an email to its stored/compared form (lowercased, trimmed). Matches `lower(email)`. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** A provider id (Auth.js) → the `user_emails.source` it records. Unknown providers fall back safely. */
export function emailSourceForProvider(provider: string | null | undefined): EmailSource {
  switch (provider) {
    case "spotify":
      return "spotify";
    case "google":
    case "google_youtube":
      return "google_youtube";
    case "apple":
    case "apple_music":
      return "apple_music";
    case "resend":
    case "email":
    case "magic_link":
    default:
      return "magic_link";
  }
}

/** Is a provider's returned email already verified by that provider? (Spotify `user-read-email` is.) */
export function isProviderEmailVerified(provider: string | null | undefined): boolean {
  // Magic link is verified by the click itself; Spotify emails are provider-verified. Others: assume
  // verified only once we wire + confirm them (reserved providers default to false until exercised).
  return provider === "spotify" || provider === "resend" || provider === "email" || provider === "magic_link";
}
