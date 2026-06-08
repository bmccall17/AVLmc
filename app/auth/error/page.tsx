import Link from "next/link";

type AuthErrorPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams;
  const error = params?.error ?? "Unknown";

  return (
    <main className="auth-error-shell">
      <section className="auth-error-panel" aria-labelledby="auth-error-title">
        <p className="eyebrow">Spotify connection</p>
        <h1 id="auth-error-title">Could not connect Spotify</h1>
        <p>
          Try again from the personalized discovery panel. If this is a test account, it may need to be added to the
          Spotify app access list before Spotify will return profile data.
        </p>
        <p className="auth-error-code">Error: {error}</p>
        <Link className="primary-action" href="/#personalized-discovery">
          Back to discovery settings
        </Link>
      </section>
    </main>
  );
}
