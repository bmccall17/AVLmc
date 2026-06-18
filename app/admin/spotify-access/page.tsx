import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SpotifyAccessSection } from "@/components/admin/SpotifyAccessSection";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Admin Spotify tester-slot access review page (PRD 36 / Phase 15). Admin-cookie gated; redirects to
 * the admin login when not authed. A focused sub-page like /admin/curators.
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
      <SpotifyAccessSection />
    </main>
  );
}
