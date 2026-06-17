import type { Metadata } from "next";
import Link from "next/link";
import { listCurators } from "@/lib/curators";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Curators — AVLmc",
  description: "Local tastemakers curating Asheville shows on AVL Music Companion.",
};

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
        <p className="empty-copy">No curators yet. Check back soon.</p>
      ) : (
        <ul className="curators-directory-list">
          {curators.map((curator) => (
            <li key={curator.handle}>
              <Link className="curators-directory-card" href={`/curator/${encodeURIComponent(curator.handle)}`}>
                <strong>{curator.displayName}</strong>
                <small>@{curator.handle}</small>
                {curator.bio ? <p>{curator.bio}</p> : null}
                <span className="curators-directory-count">{curator.pickCount} picks</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
