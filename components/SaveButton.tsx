"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Bookmark, BookmarkCheck } from "lucide-react";

type SavedItemType = "event" | "venue" | "artist";

type SaveButtonProps = {
  /** What kind of thing this saves. */
  itemType: SavedItemType;
  /** Raw key: the stable event id, or the display name for a venue/artist (the server normalizes). */
  itemKey: string;
  /** Human-readable name snapshotted at save time. */
  label: string;
  /** Linked event id when saving an event (mirrors itemKey). */
  eventId?: string | null;
  /** Server-computed saved state for the current listener. */
  initialSaved: boolean;
  /** Whether a user is signed in; anonymous users get a sign-in affordance instead of a write. */
  isSignedIn: boolean;
  /** `chip` shows an icon + label; `icon` is compact for dense action bars. */
  variant?: "chip" | "icon";
  className?: string;
  /** Notified after a successful toggle with the new saved state (e.g. to drop a Saved-list row). */
  onToggle?: (saved: boolean) => void;
};

const TYPE_NOUN: Record<SavedItemType, string> = {
  event: "show",
  venue: "venue",
  artist: "artist",
};

/**
 * Save / un-save control for events, venues, and artists (PRD 12 / C1). Distinct from the
 * planning/fire/remove controls — a bookmark, not a flame. Optimistic toggle with rollback on
 * error; signed-in only (anonymous users get a minimal sign-in affordance; the full
 * action-preserving nudge lands in C2).
 */
export function SaveButton({
  itemType,
  itemKey,
  label,
  eventId,
  initialSaved,
  isSignedIn,
  variant = "icon",
  className,
  onToggle,
}: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  const noun = TYPE_NOUN[itemType];

  async function toggleSave() {
    if (!isSignedIn) {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : "/";
      void signIn("spotify", { callbackUrl });
      return;
    }

    if (pending) {
      return;
    }

    const nextSaved = !saved;
    setSaved(nextSaved);
    setPending(true);

    try {
      const response = await fetch("/api/me/saved-items", {
        method: nextSaved ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          nextSaved ? { itemType, itemKey, label, eventId: eventId ?? null } : { itemType, itemKey }
        ),
      });

      if (!response.ok) {
        throw new Error(`Save request failed (${response.status}).`);
      }

      onToggle?.(nextSaved);
    } catch {
      // Roll back optimistic state on failure.
      setSaved(!nextSaved);
    } finally {
      setPending(false);
    }
  }

  const title = !isSignedIn
    ? `Sign in to save this ${noun}`
    : saved
      ? `Saved — tap to remove this ${noun}`
      : `Save this ${noun}`;

  const labelText = saved ? "Saved" : "Save";

  return (
    <button
      aria-label={title}
      aria-pressed={saved}
      className={`save-button save-button--${variant} ${saved ? "is-saved" : ""} ${className ?? ""}`.trim()}
      disabled={pending}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        void toggleSave();
      }}
      title={title}
      type="button"
    >
      {saved ? (
        <BookmarkCheck aria-hidden="true" size={variant === "chip" ? 16 : 18} strokeWidth={2.5} />
      ) : (
        <Bookmark aria-hidden="true" size={variant === "chip" ? 16 : 18} strokeWidth={2.5} />
      )}
      {variant === "chip" ? <span>{labelText}</span> : null}
    </button>
  );
}
