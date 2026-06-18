import Link from "next/link";
import { FeedbackForm } from "@/components/FeedbackForm";
import { getUpcomingEvents, type EventRecord } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * The detour, not the dead end (global 404). A broken link is a missed connection, not a failure —
 * so this page apologizes plainly, then keeps serving: three shows happening soon, a peek at how the
 * board personalizes, a one-tap way to send feedback (returns home after), and a path back. All
 * resilient: if events can't load, the page still renders its copy and actions.
 */
export default async function NotFound() {
  const shows = await pickShows();

  return (
    <main className="shell not-found-shell">
      <p className="eyebrow">404 · the detour is here to serve you</p>
      <h1 className="not-found-title">We missed that connection.</h1>
      <p className="not-found-lede">
        That link didn&apos;t land — our wiring, not your fault. We try to connect you to the right
        show; this time we dropped the handoff. While the map redraws, here&apos;s what&apos;s good in
        Asheville right now.
      </p>

      {shows.length > 0 ? (
        <section className="not-found-shows">
          <h2>Happening soon</h2>
          <ul>
            {shows.map((show) => (
              <li key={show.id}>
                <Link href={`/event/${show.id}`}>
                  <strong>{show.eventTitle || show.artistName || "Untitled show"}</strong>
                  <small>{showMeta(show)}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="not-found-insight">
        <h2>Why your board looks the way it does</h2>
        <p>
          Your board is personalized from timing, community heat, local context, your Spotify taste
          (optional), and the dials you set — never a black box. You can see the math and tune every
          weight from your listener profile.
        </p>
        <Link className="ghost-control" href="/#personalized-discovery">
          Open my board &amp; tune it →
        </Link>
      </section>

      <FeedbackForm />

      <div className="not-found-actions">
        <Link className="primary-action" href="/">
          Back to the board
        </Link>
        <Link className="ghost-control" href="/curators">
          Know someone with great taste? Explore &amp; recommend curators →
        </Link>
      </div>
    </main>
  );
}

/** Up to three shows: prefer the next 24 hours, otherwise the soonest upcoming. Never throws. */
async function pickShows(): Promise<EventRecord[]> {
  try {
    const events = await getUpcomingEvents();
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;
    const soon = events.filter(
      (event) => event.startsAt && new Date(event.startsAt).getTime() <= cutoff
    );
    return (soon.length >= 3 ? soon : events).slice(0, 3);
  } catch {
    return [];
  }
}

function showMeta(show: EventRecord): string {
  const parts = [show.venueName].filter(Boolean) as string[];
  const when = formatWhen(show);
  if (when) {
    parts.push(when);
  }
  return parts.join(" · ");
}

function formatWhen(show: EventRecord): string {
  if (!show.startsAt) {
    return show.eventTime ?? "";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(show.startsAt));
  } catch {
    return show.eventTime ?? "";
  }
}
