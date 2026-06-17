"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { UserPlus, UserCheck } from "lucide-react";

type FollowButtonProps = {
  /** The user id of the listener/curator to follow. */
  followeeUserId: string;
  /** Human-readable name for accessible labels (e.g. "Nyla"). */
  followeeName?: string | null;
  /** Server-computed follow state for the current viewer. */
  initialFollowing: boolean;
  /** Whether a user is signed in; anonymous users get a sign-in affordance instead of a write. */
  isSignedIn: boolean;
  /** `chip` shows an icon + label; `icon` is compact for dense action bars. */
  variant?: "chip" | "icon";
  className?: string;
  /** Notified after a successful toggle with the new following state. */
  onToggle?: (following: boolean) => void;
};

/**
 * Follow / unfollow control for the Social / Curator Graph (PRD 23 / C1). One-way and reversible:
 * following adds an edge, unfollowing removes it. Distinct iconography from Save (bookmark) and the
 * planning/fire controls — a person-add, not a flame. Optimistic toggle with rollback on error;
 * anonymous users get a minimal sign-in affordance (mirrors SaveButton), carrying a return path.
 *
 * Placement on friend/curator surfaces is C2/C3; this is the reusable affordance those cycles drop in.
 */
export function FollowButton({
  followeeUserId,
  followeeName,
  initialFollowing,
  isSignedIn,
  variant = "icon",
  className,
  onToggle,
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  const who = followeeName?.trim() || "this listener";

  async function toggleFollow() {
    if (!isSignedIn) {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : "/";
      void signIn("spotify", { callbackUrl });
      return;
    }

    if (pending) {
      return;
    }

    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setPending(true);

    try {
      const response = await fetch("/api/me/follows", {
        method: nextFollowing ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followeeUserId }),
      });

      if (!response.ok) {
        throw new Error(`Follow request failed (${response.status}).`);
      }

      onToggle?.(nextFollowing);
    } catch {
      // Roll back optimistic state on failure.
      setFollowing(!nextFollowing);
    } finally {
      setPending(false);
    }
  }

  const title = !isSignedIn
    ? `Sign in to follow ${who}`
    : following
      ? `Following ${who} — tap to unfollow`
      : `Follow ${who}`;

  const labelText = following ? "Following" : "Follow";

  return (
    <button
      aria-label={title}
      aria-pressed={following}
      className={`follow-button follow-button--${variant} ${following ? "is-following" : ""} ${className ?? ""}`.trim()}
      disabled={pending}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        void toggleFollow();
      }}
      title={title}
      type="button"
    >
      {following ? (
        <UserCheck aria-hidden="true" size={variant === "chip" ? 16 : 18} strokeWidth={2.5} />
      ) : (
        <UserPlus aria-hidden="true" size={variant === "chip" ? 16 : 18} strokeWidth={2.5} />
      )}
      {variant === "chip" ? <span>{labelText}</span> : null}
    </button>
  );
}
