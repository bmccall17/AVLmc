import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CuratorAdminPanel } from "@/components/admin/CuratorAdminPanel";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Admin curators management page (PRD 25 / C3). Admin-cookie gated; redirects to the admin login
 * when not authed. Kept as a focused sub-page rather than threading the heavy tabbed AdminPortal.
 */
export default async function AdminCuratorsPage() {
  const cookieStore = await cookies();
  if (!isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value)) {
    redirect("/admin");
  }

  return (
    <main className="shell admin-curators-shell">
      <Link className="back-link" href="/admin">
        ← Back to admin
      </Link>
      <CuratorAdminPanel />
    </main>
  );
}
