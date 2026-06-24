import type { Metadata } from "next";
import Link from "next/link";
import { CuratorRecommendForm } from "@/components/CuratorRecommendForm";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getOptionalUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recommend a curator — AVLmc",
  description: "Know someone who should curate Asheville shows? Recommend them. No pay-to-play.",
};

/**
 * "Recommend a curator" intake (parked backlog item) — replaces the old `mailto:`. Server resolves
 * sign-in state + auth features; the client form nominates someone and posts to the C1
 * recommendation API (admin-reviewed). Recommendations are private to the submitter + admin.
 */
export default async function CuratorRecommendPage() {
  const userId = await getOptionalUserId();
  const features = getAuthFeatureFlags();

  return (
    <main className="shell curators-directory-shell">
      <Link className="back-link" href="/curators">
        Back to curators
      </Link>

      <header className="curators-directory-head">
        <h1>Recommend a curator</h1>
        <p>
          Know someone whose show picks you&apos;d follow — a DJ, a booker, a music writer? Put them on
          our radar. No pay-to-play; an admin reviews every recommendation.
        </p>
      </header>

      <CuratorRecommendForm features={features} isSignedIn={Boolean(userId)} />
    </main>
  );
}
