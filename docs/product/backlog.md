# AVL Music Companion Backlog

Updated: June 18, 2026

## Urgent

* **Finalize & live-validate the PRD 35 authenticated OAuth-link (Phase 15 follow-up).** The merge-safe
  spine and the **`getUserByEmail` multi-email resolution are now wired** (`lib/auth-adapter.ts` →
  `auth.ts`), so a magic link to any recorded email lands on the one account. One piece remains: the
  explicit authenticated OAuth-link-onto-current-session callback applying `resolveAccountLink` (attach the
  second provider's `accounts` row to the current session user; route a different-account collision to the
  PRD 37 `duplicate_account` recovery — `allowDangerousEmailAccountLinking` stays off). Auth.js v5 may
  already link a second OAuth provider to a signed-in session; **confirm this live first**, then finalize
  the callback only if needed, add the profile-menu "Connect Spotify / Add email" entry points, and validate
  with [`account-signin-linking-reliability-checklist.md`](account-signin-linking-reliability-checklist.md)
  under live OAuth across the supported matrix — running `checkAccountIntegrity` on the resulting rows. `$0`,
  no Spotify writes, Snyk-clean.

* _Otherwise none open._ The analytics/WAU‑MAU dependency below is resolved. Active focus is the Phase 15 follow-up above and the Personalized Discovery follow-ups tracked in [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md).

## Scheduled

* **Decommission Aiven — unhook completely (trigger: on/after June 23, 2026, once Neon has run stable ≈1 week).** Production migrated Aiven → Neon on June 16, 2026 (see [Deployment and Auth Investigation](deployment-auth-investigation.md)); Aiven is being kept **only** as a rollback safety net for one week. Once Neon is confirmed healthy under real traffic, fully retire Aiven:
  * Confirm Neon stability: no `53300`/connection errors, funnel writes landing, sign-in working, admin Health probe green for the week.
  * Remove any lingering Aiven connection string from Vercel (all envs: Production/Preview/Development) and from any local `.env`.
  * Delete / power down the Aiven PostgreSQL service so it can't be accidentally re-pointed.
  * Rotate or invalidate the old Aiven credentials.
  * Confirm no code/docs still reference Aiven as live (only the intentional historical notes in ADR 0001 and launch PRDs 04/05 should remain).
  * Take a final Aiven `pg_dump` to cold storage before deleting, just in case.

## Parked

* **YouTube (Google) sign-in & account-linking provider** — Parked for a future sprint, after Phase 15 (Spotify) account linking ships. Phase 15's [`account-signin-linking-prd.md`](account-signin-linking-prd.md) builds the linking + multi-email model **generically**: the `googleYouTube` flag already exists (`lib/auth-flags.ts`, off) and `user_emails.source = 'google_youtube'` is a reserved value. Remaining work: register a Google/YouTube provider in `auth.ts`, wire its read-only scopes + a `music_connections` provider, surface "Connect YouTube / add this email" through the PRD 35 `me/account-links` surface, and add it to the PRD 38 cross-browser test. No new `users` row — the returned email associates to the existing account like Spotify's. `$0`, no writes, Snyk-clean.

* **Apple Music sign-in & account-linking provider** — Parked for a future sprint, after Phase 15 (Spotify) account linking ships. Same shape as the YouTube stem: the `appleMusic` flag exists (`lib/auth-flags.ts`, off) and `user_emails.source = 'apple_music'` is reserved. Remaining work: register an Apple provider in `auth.ts` (Sign in with Apple / MusicKit), wire read-only access + a `music_connections` provider, expose linking through the PRD 35 `me/account-links` surface, and extend the PRD 38 test. Associates the Apple-returned email to the existing account; no duplicate identity. `$0`, no writes, Snyk-clean. *(Flag any Apple Developer Program cost before starting — must stay within `$0` or be explicitly approved.)*

* **Vercel Caching for OG Image Generation**: Add Next.js route segment caching (`export const revalidate = 3600;`) to the dynamic per-event `app/event/[id]/opengraph-image.tsx` and `twitter-image.tsx`. This will cache the expensive Satori/WebAssembly image generation on Vercel's CDN, preventing runaway compute costs (GB-Hours) if an event link goes viral and is scraped thousands of times. Parked while WAU < 10.

## Done

* **Support link — "buy me a coffee" (humble)** — Shipped (June 17, 2026). A quiet, on-brand support ask while the service is pre-revenue. Delivered:
  * `components/SupportButton.tsx` — a gold `Coffee` (lucide) icon in the topbar linking to `https://buymeacoffee.com/bmccall17` (new tab), with an accessible hover/focus tooltip (`aria-label`, `role="tooltip"`, keyboard-focusable).
  * `app/page.tsx` — `<SupportButton />` placed in `sandbox-topbar-actions`, after `ListenerProfileButton`.
  * `app/globals.css` — `.sandbox-support` button + `.sandbox-support-tooltip`, modeled on the existing `.sandbox-action-tooltip` pattern and tinted with `--gold`; right-aligned and viewport-capped so it never overflows the bar on mobile.
  * Tooltip copy (intentionally lowercase/humble): "a project fueled by a love for music… and coffee! if it's useful and you want to see it keep growing, consider buying me a coffee."
  * No PRD/admin cycle — standalone UI. Typecheck, `test:registry`, and Snyk code scan all green.

* **Analytics & Tracking for WAU/MAU** — Resolved (June 2026). **Umami Cloud** is the chosen lightweight, low-cookie tracker; the script is wired in `app/layout.tsx` (gated on `NEXT_PUBLIC_UMAMI_WEBSITE_ID`). The Admin Portal's **Analytics** tab (Cycle C6 / [PRD 11](prds/prd-11-product-analytics-umami.md)) reads Umami back **server-side** — unique visitors (the WAU/MAU proxy) over 24h/7d/30d, top pages, and referrers — joined with a first-party event funnel and conversions, plus a **free-tier scaling-milestone indicator** that flags when usage nears the Umami ceiling (the trigger for un-parking items like the OG caching above and Vercel compute protections).
  * On-site tracking already collects without extra config; to read traffic *into* the portal, set the server-only `UMAMI_API_KEY` (and optional `UMAMI_API_URL`). Until it is set, the Analytics tab shows a clear "not configured" notice and the first-party funnel/conversions still render.
  * Cross-reference: the [master roadmap](master-roadmap.md) Scaling Milestones still own the $0 ceilings; this item only delivered the *visibility* needed to see them coming.
