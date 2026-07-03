import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — AVL Music Companion",
  description:
    "What AVL Music Companion collects, how it's used, and what we never do: no Spotify writes, no selling data, no pay-to-play.",
};

/**
 * Public privacy policy (PRD 45 / Phase 17 — Extended Quota Readiness). A prerequisite for
 * Spotify's Extended Quota review, but written for listeners first: every claim below maps to an
 * actual code path (the PRD 27 leak-audit tests are the evidence base for the "never public"
 * claims). Future PRDs that change data practices must update this page in the same cycle.
 * Renders in the auth-recovery shell so the dark route tokens apply.
 */
export default function PrivacyPage() {
  return (
    <main className="shell auth-recovery-shell">
      <section className="auth-recovery auth-recovery-limitation">
        <p className="eyebrow">Privacy</p>
        <h1>Privacy at AVL Music Companion</h1>
        <p className="auth-recovery-message">
          <em>Last updated July 2, 2026.</em> AVL Music Companion is a free, community-powered
          discovery board for Asheville shows. The short version: we collect the minimum needed to
          make discovery personal, we never write to your Spotify account, we never sell your data,
          and nothing you do privately is ever shown publicly.
        </p>

        <h2>What we collect</h2>
        <p className="auth-recovery-message">
          <strong>Browsing without an account</strong> — an anonymous session cookie remembers your
          taste signals (what you tap, save, or skip) so the board can improve for you. It is not
          tied to your name or email until you sign in, at which point it hands off to your account
          and the anonymous trail is migrated, not duplicated.
        </p>
        <p className="auth-recovery-message">
          <strong>Email sign-in</strong> — your email address, used to send one-tap magic links (via
          Resend) and to keep your saves, follows, and tuning on one account. No passwords are
          stored, because there are none.
        </p>
        <p className="auth-recovery-message">
          <strong>Spotify connection (optional)</strong> — if you connect Spotify, we read your
          profile, email, and top artists and tracks under Spotify&apos;s read-only scopes
          (user-read-private, user-read-email, user-top-read). That taste snapshot feeds your
          personal recommendations. OAuth tokens are stored server-side only and never appear in any
          public response — a claim our test suite enforces, not just a promise.
        </p>
        <p className="auth-recovery-message">
          <strong>Spotify access requests</strong> — while Spotify caps our beta at 25 connected
          listeners, requesting a seat stores the email you give us and your optional note, used
          only to notify you when your seat is ready.
        </p>
        <p className="auth-recovery-message">
          <strong>Usage analytics</strong> — anonymous, cookie-less page analytics (Umami) that
          tell us which surfaces get used. No cross-site tracking, no ad networks.
        </p>

        <h2>What we never do</h2>
        <p className="auth-recovery-message">
          We never write to your Spotify account — no playlist changes, no follows, nothing; our
          scopes physically don&apos;t allow it. We never sell or share your data with advertisers.
          No one can pay for ranking — &ldquo;no money buys rank&rdquo; is an invariant our tests
          assert. Your private activity (saves, going/fire signals, who you follow) is never shown
          publicly: community counts are anonymous crowd totals, and &ldquo;your people&rdquo;
          attribution is visible only to followers each person has explicitly opted into sharing
          with. Regular listeners never get a public profile.
        </p>

        <h2>Control and deletion</h2>
        <p className="auth-recovery-message">
          You can disconnect Spotify any time from your listener profile — that removes our stored
          connection tokens — and additionally revoke AVL Music Companion at{" "}
          <a href="https://www.spotify.com/account/apps/" rel="noreferrer" target="_blank">
            spotify.com/account/apps
          </a>
          . Taste tuning is directly editable (every dial is yours), and signing out ends the
          session. For account deletion or any privacy question, email{" "}
          <a href="mailto:brett@betterthanunicorns.com">brett@betterthanunicorns.com</a> and
          we&apos;ll handle it promptly.
        </p>

        <h2>Changes</h2>
        <p className="auth-recovery-message">
          If our data practices change, this page changes in the same release, with the date above
          updated. Questions welcome — this product runs on trust with a small local community, and
          we intend to keep it.
        </p>

        <p className="auth-recovery-message">
          <Link href="/">← Back to the board</Link>
        </p>
      </section>
    </main>
  );
}
