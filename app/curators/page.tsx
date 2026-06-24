import type { Metadata } from "next";
import Link from "next/link";
import { listCurators } from "@/lib/curators";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Curators — AVLmc",
  description: "Local tastemakers curating Asheville shows on AVL Music Companion.",
};

/** Short, locale-stable date for a directory pick (e.g. "Aug 3"). Empty when missing/unparseable. */
function formatPickDate(value: string | null): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(time);
}

/**
 * Public curator directory (PRD 25 / C3) — replaces the "Curators — Coming soon" promise with the
 * real surface. Lists active, admin-promoted curators; regular listeners never appear here.
 */
export default async function CuratorsDirectoryPage() {
  const curators = await listCurators();

  return (
    <main className="shell curators-directory-shell">
      <Link className="back-link" href="/">
        Back to all shows
      </Link>

      <header className="curators-directory-head">
        <h1>Curators</h1>
        <p>Local tastemakers whose picks you can follow. No pay-to-play.</p>
        <Link className="primary-action curators-directory-apply" href="/curators/apply">
          Become a curator
        </Link>
      </header>

      {curators.length === 0 ? (
        <div className="curators-directory-empty">
          <p>No curators yet — this is wide open.</p>
          <p>
            Be the first to curate Asheville shows. It&apos;s free, no pay-to-play, and takes a minute.
          </p>
          <Link className="primary-action" href="/curators/apply">
            Become the first curator
          </Link>
        </div>
      ) : (
        <ul className="curators-directory-list">
          {curators.map((curator) => {
            const tasteChips = [
              ...curator.topGenres.map((label) => ({ kind: "genre" as const, label })),
              ...curator.topVenues.map((label) => ({ kind: "venue" as const, label })),
            ];
            return (
              <li key={curator.handle}>
                <Link className="curators-directory-card" href={`/curator/${encodeURIComponent(curator.handle)}`}>
                  <strong>{curator.displayName}</strong>
                  <small>@{curator.handle}</small>
                  {curator.bio ? <p>{curator.bio}</p> : null}
                  {tasteChips.length > 0 ? (
                    <span className="curators-directory-taste">
                      {tasteChips.map((chip) => (
                        <span className={`curators-directory-chip kind-${chip.kind}`} key={`${chip.kind}:${chip.label}`}>
                          <span className="curators-directory-chip-kind">{chip.kind}</span>
                          {chip.label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {curator.nextUpcomingPick ? (
                    <span className="curators-directory-pick">
                      <strong>Next:</strong> {curator.nextUpcomingPick.eventTitle}
                      {formatPickDate(curator.nextUpcomingPick.eventDate)
                        ? ` · ${formatPickDate(curator.nextUpcomingPick.eventDate)}`
                        : ""}
                    </span>
                  ) : curator.latestPick ? (
                    <span className="curators-directory-pick">
                      <strong>Latest:</strong> {curator.latestPick.eventTitle}
                    </span>
                  ) : null}
                  <span className="curators-directory-count">{curator.pickCount} picks</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
