import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — AVL Music Companion",
  description:
    "What AVL Music Companion collects, how it's used for show discovery, and how to remove it. Read-only Spotify scopes, server-side tokens, no selling data, no pay-to-play.",
};

/**
 * Public privacy policy (PRD 45 / Phase 17) — a prerequisite for Spotify's Extended Quota review,
 * and true on its own terms: every claim below was checked against the code before publishing
 * (scopes in auth.ts; server-side tokens per the PRD 27 leak-audit posture; disconnect/removal in
 * lib/music.ts; cookieless Umami analytics in app/layout.tsx). Future PRDs that change data
 * practices must update this page in the same cycle.
 */
export default function PrivacyPage() {
  return (
    <main className="shell auth-recovery-shell">
      <section className="auth-recovery privacy-page">
        <p className="eyebrow">AVL Music Companion</p>
        <h1>Privacy</h1>
        <p className="privacy-updated">Last updated July 2, 2026</p>

        <p>
          AVL Music Companion is a community discovery board for Asheville shows. It works without
          an account; signing in adds persistence and taste-fed recommendations. This page says
          plainly what we collect, why, and how to remove it.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Email address</strong> — if you sign in with an email magic link, or request a
            Spotify beta seat. Used to sign you in, to send the one email a seat request produces,
            and for nothing else.
          </li>
          <li>
            <strong>Spotify profile and listening taste</strong> — only if you connect Spotify:
            your display name, the email on your Spotify account, and your top artists and tracks,
            under read-only scopes (<code>user-read-private</code>, <code>user-read-email</code>,{" "}
            <code>user-top-read</code>). We never see your password.
          </li>
          <li>
            <strong>Your activity here</strong> — saves, going/fire signals, follows, song
            recommendations, and discovery-tuning preferences, tied to your account, or to an
            anonymous browser cookie if you haven&apos;t signed in (so your tuning survives a
            refresh; it migrates to your account when you sign in).
          </li>
          <li>
            <strong>Page analytics</strong> — privacy-friendly, cookieless Umami page counts. No
            cross-site tracking, no ad networks.
          </li>
        </ul>

        <h2>How it&apos;s used</h2>
        <p>
          One purpose: helping you find local shows worth showing up for. Taste signals rank the
          same public listings for you personally. We don&apos;t sell or share personal data, run
          ads, or take payment for placement — no pay-to-play, ever.
        </p>

        <h2>Spotify, specifically</h2>
        <ul>
          <li>
            <strong>Read-only.</strong> We never post, follow, modify playlists, or write anything
            to your Spotify account.
          </li>
          <li>
            <strong>Tokens stay server-side.</strong> Spotify access tokens live in our database
            and never appear in public pages or API responses.
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

        <h2>Retention &amp; deletion</h2>
        <p>
          Account data is kept while your account exists. To delete your account and its data —
          or to ask anything about this page — email{" "}
          <a href="mailto:avlmc@agent828.com">avlmc@agent828.com</a> and we&apos;ll handle it
          promptly. Disconnecting Spotify (above) removes tokens immediately without deleting your
          account.
        </p>

        <h2>Changes</h2>
        <p>
          If our data practices change, this page changes in the same release, with the date above
          updated.
        </p>

        <p className="privacy-footnote">
          <Link href="/">Back to the board</Link> ·{" "}
          <Link href="/spotify-access">Request Spotify access</Link>
        </p>
      </section>
    </main>
  );
}
