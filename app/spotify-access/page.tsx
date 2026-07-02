import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { TesterRequestForm } from "@/components/TesterRequestForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request Spotify access — AVLmc",
  description:
    "Spotify import is invite-only while AVL Music Companion is in Spotify's beta program. Request a tester seat — everything else works with email sign-in.",
};

/**
 * Public Spotify tester request page (PRD 42 / Phase 17). The linkable landing spot for every
 * "Request Spotify access" affordance (the /auth/error beta notice today; the sign-in chooser in
 * PRD 43). Anonymous-accessible — the applicants we most want to catch have no account yet; a
 * signed-in visitor gets their email pre-filled. Renders in the auth-recovery shell so the dark
 * route tokens apply.
 */
export default async function SpotifyAccessPage() {
  const session = await auth().catch(() => null);

  return (
    <main className="shell auth-recovery-shell">
      <section className="auth-recovery auth-recovery-limitation">
        <p className="eyebrow">Spotify beta</p>
        <h1>Request Spotify access</h1>
        <p className="auth-recovery-message">
          Spotify import is invite-only while we&apos;re in Spotify&apos;s beta program — they cap
          us at 25 connected listeners until our extended-access request is granted. Leave your
          email and we&apos;ll hand you a seat as soon as one is ready: you&apos;ll get one email
          from us, nothing else.
        </p>
        <p className="auth-recovery-message">
          No waiting required for everything else — <Link href="/">sign in with your email</Link>{" "}
          and tune your board by hand. Spotify just makes the recommendations smarter.
        </p>
        <TesterRequestForm
          defaultEmail={session?.user?.email ?? null}
          source="spotify-access-page"
        />
        <p className="signin-chooser-footnote">
          What we do with your data: <Link href="/privacy">privacy</Link>.
        </p>
      </section>
    </main>
  );
}
