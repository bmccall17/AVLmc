import type { Metadata } from "next";
import Link from "next/link";
import { CuratorApplyForm } from "@/components/CuratorApplyForm";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getOptionalUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Become a curator — AVLmc",
  description: "Apply to curate Asheville shows on AVL Music Companion. No pay-to-play.",
};

/**
 * Guided curator apply flow (PRD 30 / C2). Server resolves sign-in state; the client form authors
 * the persona and posts to the C1 application API (instant under the gate, admin-reviewed above it).
 * Applications are private to the applicant + admin — nothing here is ever public.
 */
export default async function CuratorApplyPage() {
  const userId = await getOptionalUserId();
  const features = getAuthFeatureFlags();

  return (
    <main className="shell curators-directory-shell">
      <Link className="back-link" href="/curators">
        Back to curators
      </Link>

      <header className="curators-directory-head">
        <h1>Become a curator</h1>
        <p>
          Curate Asheville shows you love and build a public picks profile others can follow. No
          pay-to-play — anyone can apply, and an admin keeps the surface healthy.
        </p>
      </header>

      <CuratorApplyForm features={features} isSignedIn={Boolean(userId)} />
    </main>
  );
}
