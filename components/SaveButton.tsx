"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useSignInChooser } from "@/components/SignInChooser";

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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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
  const { chooser, openChooser } = useSignInChooser();

  const noun = TYPE_NOUN[itemType];

  async function toggleSave() {
    if (!isSignedIn) {
      // Pre-redirect chooser (PRD 43): never fire a blind Spotify redirect from a nudge.
      const callbackUrl = typeof window !== "undefined" ? window.location.href : "/";
      openChooser({ callbackUrl, source: "save-button", heading: `Sign in to save this ${noun}` });
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
    ? `Sign in to save this ${noun} to your Saved list`
    : saved
      ? `This ${noun} is on your Saved list — tap to remove it`
      : `Bookmark this ${noun} to your Saved list so you can find it again`;

  const labelText = saved ? `${capitalize(noun)} saved` : `Save ${noun}`;

  return (
    <>
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
      {chooser}
    </>
  );
}
