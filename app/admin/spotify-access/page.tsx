import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SpotifyAccessSection } from "@/components/admin/SpotifyAccessSection";
import { TesterRequestsSection } from "@/components/admin/TesterRequestsSection";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Admin Spotify tester access review page: the signed-in slot queue (PRD 36 / Phase 15) and the
 * anonymous email-keyed tester requests + seat budget (PRD 42 / Phase 17) in one place — the whole
 * owner + 5-user Development Mode picture. Admin-cookie gated; redirects to the admin login when not authed.
 */
export default async function AdminSpotifyAccessPage() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    redirect("/admin");
  }

  return (
    <main className="shell admin-curators-shell">
      <Link className="back-link" href="/admin">
        ← Back to admin
      </Link>
      <TesterRequestsSection />
      <SpotifyAccessSection />
    </main>
  );
}
