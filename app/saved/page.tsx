import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SavedSpace, type SavedEventRow, type SavedSimpleRow } from "@/components/saved/SavedSpace";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getOptionalUserId } from "@/lib/current-user";
import { getEventById } from "@/lib/events";
import { formatLongDate } from "@/lib/format";
import { listSavedItems } from "@/lib/saved-items";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved — AVL Music Companion",
  description: "Your private saved events, venues, and artists.",
  robots: { index: false, follow: false },
};

export default async function SavedPage() {
  // Signed-in only. Anonymous visitors are routed to sign-in with a return path; if auth is
  // disabled entirely, fall back to the public board.
  if (!getAuthFeatureFlags().auth) {
    redirect("/");
  }

  const userId = await getOptionalUserId();
  if (!userId) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent("/saved")}`);
  }

  const saved = await listSavedItems(userId);

  // Resolve event details (title/date/venue) for the saved events; tolerate events that have
  // since left the board by falling back to the saved label snapshot.
  const eventRows: SavedEventRow[] = await Promise.all(
    saved.event.map(async (item) => {
      const event = item.eventId ? await getEventById(item.eventId) : null;
      return {
        itemKey: item.itemKey,
        label: event?.eventTitle ?? item.label,
        dateLabel: event ? formatLongDate(event.eventDate) : null,
        venueName: event?.venueName ?? null,
        available: Boolean(event),
      };
    })
  );

  const venueRows: SavedSimpleRow[] = saved.venue.map((item) => ({
    itemKey: item.itemKey,
    label: item.label,
  }));
  const artistRows: SavedSimpleRow[] = saved.artist.map((item) => ({
    itemKey: item.itemKey,
    label: item.label,
  }));

  return (
    <main className="shell saved-shell">
      <Link className="back-link" href="/">
        Back to all shows
      </Link>

      <header className="saved-hero">
        <p className="eyebrow">Private to you</p>
        <h1>Saved</h1>
        <p className="saved-intro">
          The events, venues, and artists you&apos;ve bookmarked. Only you can see this — tap a
          bookmark anywhere to add or remove.
        </p>
      </header>

      <SavedSpace artists={artistRows} events={eventRows} venues={venueRows} />
    </main>
  );
}
