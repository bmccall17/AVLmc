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
 * actual code path (scopes in auth.ts; server-side tokens per the PRD 27 leak-audit posture, which
 * tests enforce; disconnect/removal in lib/music.ts; anonymous-session hand-off per PRD 20;
 * cookieless Umami analytics in app/layout.tsx). Future PRDs that change data practices must
 * update this page in the same cycle. Renders in the auth-recovery shell (dark route tokens).
 */
export default function PrivacyPage() {
  return (
    <main className="shell auth-recovery-shell">
      <section className="auth-recovery privacy-page">
        <p className="eyebrow">AVL Music Companion</p>
        <h1>Privacy</h1>
        <p className="privacy-updated">Last updated July 2, 2026</p>

        <p>
          AVL Music Companion is a free, community-powered discovery board for Asheville shows.
          The short version: we collect the minimum needed to make discovery personal, we never
          write to your Spotify account, we never sell your data, and nothing you do privately is
          ever shown publicly.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Browsing without an account</strong> — an anonymous session cookie remembers
            your taste signals (what you tap, save, or skip) so the board can improve for you. It
            isn&apos;t tied to your name or email; when you sign in, that trail migrates to your
            account rather than being duplicated.
          </li>
          <li>
            <strong>Email address</strong> — if you sign in with an email magic link (via Resend;
            no passwords are stored, because there are none), or request a Spotify beta seat —
            seat requests store the email you give us and your optional note, used only to notify
            you when your seat is ready.
          </li>
          <li>
            <strong>Spotify profile and listening taste</strong> — only if you connect Spotify:
            your display name, the email on your Spotify account, and your top artists and tracks,
            under read-only scopes (<code>user-read-private</code>, <code>user-read-email</code>,{" "}
            <code>user-top-read</code>). We never see your password.
          </li>
          <li>
            <strong>Your activity here</strong> — saves, going/fire signals, follows, song
            recommendations, and discovery-tuning preferences, tied to your account (or the
            anonymous cookie above until you have one).
          </li>
          <li>
            <strong>Page analytics</strong> — privacy-friendly, cookieless Umami page counts. No
            cross-site tracking, no ad networks.
          </li>
        </ul>

        <h2>How it&apos;s used — and what we never do</h2>
        <p>
          One purpose: helping you find local shows worth showing up for. Taste signals rank the
          same public listings for you personally. We never write to your Spotify account — no
          playlist changes, no follows, nothing; our scopes physically don&apos;t allow it. We
          never sell or share personal data, run ads, or take payment for placement —
          &ldquo;no money buys rank&rdquo; is an invariant our tests assert. Your private activity
          (saves, going/fire signals, who you follow) is never shown publicly: community counts
          are anonymous crowd totals, and &ldquo;your people&rdquo; attribution is visible only to
          followers each person has explicitly opted into sharing with. Regular listeners never
          get a public profile.
        </p>

        <h2>Spotify, specifically</h2>
        <ul>
          <li>
            <strong>Read-only.</strong> We never post, follow, modify playlists, or control
            playback on your Spotify account.
          </li>
          <li>
            <strong>Tokens stay server-side.</strong> Spotify access tokens live in our database
            and never appear in public pages or API responses — a claim our test suite enforces,
            not just a promise.
          </li>
          <li>
            <strong>Revocable both ways.</strong> Disconnect Spotify from your profile here — that
            deletes our copy of your tokens, and &ldquo;remove imported data&rdquo; also deletes
            the imported top artists/tracks. You can additionally revoke access at{" "}
            <a href="https://www.spotify.com/account/apps/" rel="noreferrer noopener" target="_blank">
              spotify.com/account/apps
            </a>
            .
          </li>
        </ul>

        <h2>Where it lives</h2>
        <p>
          Hosting on Vercel, database on Neon (Postgres), sign-in and notification email via
          Resend, listening data from the Spotify Web API, page counts via Umami. Each processes
          data only to provide the service.
        </p>

        <h2>Control, retention &amp; deletion</h2>
        <p>
          Taste tuning is directly editable (every dial is yours) and signing out ends the
          session. Account data is kept while your account exists. To delete your account and its
          data — or to ask anything about this page — email{" "}
          <a href="mailto:avlmc@agent828.com">avlmc@agent828.com</a> and we&apos;ll handle it
          promptly. Disconnecting Spotify (above) removes tokens immediately without deleting your
          account.
        </p>

        <h2>Changes</h2>
        <p>
          If our data practices change, this page changes in the same release, with the date above
          updated. Questions welcome — this product runs on trust with a small local community,
          and we intend to keep it.
        </p>

        <p className="privacy-footnote">
          <Link href="/">Back to the board</Link> ·{" "}
          <Link href="/spotify-access">Request Spotify access</Link>
        </p>
      </section>
    </main>
  );
}
