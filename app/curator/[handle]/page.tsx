import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/FollowButton";
import { getCuratorProfile } from "@/lib/curators";
import { getOptionalUserId } from "@/lib/current-user";
import { isFollowing } from "@/lib/social-graph";

type CuratorPageProps = {
  params: Promise<{ handle: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CuratorPageProps): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getCuratorProfile(handle);
  if (!profile) {
    return { title: "Curator not found — AVLmc" };
  }
  const { displayName, bio } = profile.curator;
  return {
    title: `${displayName} — AVLmc curator`,
    description: bio ?? `Shows and taste curated by ${displayName} on AVL Music Companion.`,
  };
}

export default async function CuratorPage({ params }: CuratorPageProps) {
  const { handle } = await params;
  const profile = await getCuratorProfile(handle);

  if (!profile) {
    notFound();
  }

  const viewerId = await getOptionalUserId();
  const isSignedIn = Boolean(viewerId);
  const alreadyFollowing = viewerId ? await isFollowing(viewerId, profile.userId) : false;
  const { curator, topList, picks } = profile;

  return (
    <main className="shell curator-shell">
      <Link className="back-link" href="/">
        Back to all shows
      </Link>

      <header className="curator-hero">
        <div className="curator-hero-copy">
          <span className="curator-eyebrow">Curator</span>
          <h1>{curator.displayName}</h1>
          <p className="curator-handle">@{curator.handle}</p>
          {curator.bio ? <p className="curator-bio">{curator.bio}</p> : null}
        </div>
        <FollowButton
          followeeName={curator.displayName}
          followeeUserId={profile.userId}
          initialFollowing={alreadyFollowing}
          isSignedIn={isSignedIn}
          variant="chip"
        />
      </header>

      {topList.length > 0 ? (
        <section className="curator-toplist" aria-label="Top list">
          <h2>Top list</h2>
          <ul>
            {topList.map((entry) => (
              <li className="curator-toplist-item" key={`${entry.kind}:${entry.label}`}>
                <span className={`curator-toplist-kind kind-${entry.kind}`}>{entry.kind}</span>
                <span>{entry.label}</span>
                <small>{entry.count}×</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="curator-picks" aria-label="Per-show picks">
        <h2>Picks</h2>
        {picks.length === 0 ? (
          <p className="empty-copy">No picks yet.</p>
        ) : (
          <ul>
            {picks.map((pick) => (
              <li className="curator-pick" key={pick.id}>
                <Link className="curator-pick-link" href={`/event/${encodeURIComponent(pick.eventId)}`}>
                  <strong>{pick.eventTitle || pick.artistName || "Show"}</strong>
                  {pick.venueName ? <small>{pick.venueName}</small> : null}
                </Link>
                {pick.note ? <p className="curator-pick-note">“{pick.note}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
