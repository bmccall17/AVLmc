import Link from "next/link";
import { cookies } from "next/headers";
import { AdminModeration } from "@/components/AdminModeration";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
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
      <main className="shell detail-shell">
        <Link className="back-link" href="/">
          Back to shows
        </Link>
        <section className="login-panel">
          <p className="eyebrow">Admin</p>
          <h1>Moderation login</h1>
          <form action="/api/admin/login" method="post">
            <label>
              Admin password
              <input name="password" required type="password" />
            </label>
            <button className="primary-action" type="submit">
              Log in
            </button>
          </form>
        </section>
      </main>
    );
  }

  const params = await searchParams;
  const status = getStatus(params.status);
  const contributions = await listContributions(status === "all" ? undefined : status);

  return (
    <main className="shell detail-shell">
      <Link className="back-link" href="/">
        Back to shows
      </Link>
      <AdminModeration
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
