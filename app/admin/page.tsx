import Link from "next/link";
import { cookies } from "next/headers";
import { AdminPortal } from "@/components/AdminPortal";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { loadAdminDashboardData } from "@/lib/admin-data";
import {
  listContributions,
  publicContribution,
  type ContributionStatus,
} from "@/lib/community";

type AdminPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const cookieStore = await cookies();
  const isAuthed = isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);

  if (!isAuthed) {
    return (
      <main className="admin-login-shell">
        <div className="admin-login-card">
          <div className="admin-login-header">
            <span className="admin-brand-mark">AVLmc</span>
            <div>
              <strong>Admin Portal</strong>
              <small>AVL Music Companion</small>
            </div>
          </div>
          <form action="/api/admin/login" method="post">
            <label>
              <span>Admin password</span>
              <input name="password" required type="password" autoComplete="current-password" />
            </label>
            <button className="admin-login-button" type="submit">
              Log in
            </button>
          </form>
          <Link className="admin-login-back" href="/">
            ← Back to shows
          </Link>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const status = getStatus(params.status);
  const [data, contributions] = await Promise.all([
    loadAdminDashboardData(),
    listContributions(status === "all" ? undefined : status),
  ]);

  return (
    <main className="admin-shell">
      <AdminPortal
        data={data}
        contributions={contributions.map(publicContribution)}
        currentStatus={status}
      />
    </main>
  );
}

function getStatus(value: string | undefined): ContributionStatus | "all" {
  if (value === "visible" || value === "hidden" || value === "pending") {
    return value;
  }

  return "all";
}
