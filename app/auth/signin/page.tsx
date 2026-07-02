import type { Metadata } from "next";
import Link from "next/link";
import { SignInChooser } from "@/components/SignInChooser";
import { resolveAuthFailure } from "@/lib/auth-failures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — AVLmc",
  description:
    "Sign in to AVL Music Companion with email or Spotify. One account either way — your saves, follows, and tuning stay put.",
};

type SignInPageProps = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

/**
 * Custom `pages.signIn` (PRD 43 / Phase 17): the product's own sign-in surface — the same
 * three-door chooser the in-page nudges use — replacing NextAuth's unstyled default (the page the
 * July 2 audit caught in the funnel). Auth.js lands here with `?callbackUrl=` (preserved through
 * the chooser) and sometimes `?error=`, which renders as honest taxonomy copy above the doors.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const failure = params.error ? resolveAuthFailure(params.error) : null;

  return (
    <main className="shell auth-recovery-shell">
      <section className="auth-recovery">
        {failure ? <p className="form-message error">{failure.message}</p> : null}
        <SignInChooser callbackUrl={callbackUrl} source="signin-page" />
        <p className="signin-chooser-footnote">
          Just browsing? <Link href="/">The board works without an account</Link> — sign-in only
          adds persistence and taste-fed picks.
        </p>
      </section>
    </main>
  );
}

/** Only same-origin relative paths pass through — anything else degrades to home. */
function safeCallbackUrl(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}
