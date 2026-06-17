import type { Metadata } from "next";
import Link from "next/link";
import { CuratorManagePanel, type PickableEvent } from "@/components/CuratorManagePanel";
import { getOptionalUserId } from "@/lib/current-user";
import { getUpcomingEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage your curator profile — AVLmc",
  description: "Edit your curator persona and manage your show picks on AVL Music Companion.",
};

/**
 * Curator self-management page (PRD 31 / C3) + first-pick activation (PRD 32 / C4). Owner-only: the
 * panel resolves the caller's OWN curator from the session and drives the self-scoped
 * /api/me/curator plane. Upcoming events are passed in for the first-picks search (no new pick API
 * or endpoint). Never exposes or touches another curator; admin moderation overrides.
 */
export default async function CuratorManagePage() {
  const userId = await getOptionalUserId();

  // Upcoming shows the curator can pick from (deliberate choice — no auto-suggested picks).
  const events: PickableEvent[] = userId
    ? (await getUpcomingEvents()).map((event) => ({
        id: event.id,
        title: event.eventTitle || event.artistName || "Show",
        venue: event.venueName || null,
        date: event.eventDate || null,
      }))
    : [];

  return (
    <main className="shell curators-directory-shell">
      <Link className="back-link" href="/curators">
        Back to curators
      </Link>

      <header className="curators-directory-head">
        <h1>Manage your curator profile</h1>
        <p>Edit your persona and curate the shows you love. Only you can see and change this.</p>
      </header>

      <CuratorManagePanel isSignedIn={Boolean(userId)} upcomingEvents={events} />
    </main>
  );
}
