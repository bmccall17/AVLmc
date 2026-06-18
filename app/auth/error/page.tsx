import { AuthRecovery } from "@/components/AuthRecovery";
import { resolveAuthFailure } from "@/lib/auth-failures";

export const dynamic = "force-dynamic";

type AuthErrorPageProps = {
  searchParams: Promise<{ error?: string; code?: string }>;
};

/**
 * Auth & linking failure recovery page (PRD 37 / Phase 15). Reads the Auth.js `?error=` param (or an
 * explicit `?code=` taxonomy code) and renders a real recovery surface from the single failure
 * taxonomy — accurate copy + a concrete recoverable next step — instead of the old blind redirect to
 * the Spotify beta notice. Unknown/missing errors degrade to an honest retry, never a dead-end.
 */
export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams;
  const failure = resolveAuthFailure(params.code ?? params.error);

  return (
    <main className="shell auth-recovery-shell">
      <AuthRecovery failure={failure} />
    </main>
  );
}
