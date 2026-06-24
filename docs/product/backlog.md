# AVL Music Companion Backlog

Updated: June 24, 2026

## Urgent

* **Make `db/schema.sql` application part of the deploy/migration runbook (prevent schema drift).**
  Root-cause follow-up to the Jun 18, 2026 incident below: prod schema drift had silently disabled whole
  features. Add a deploy/CI step (or a documented manual step) that runs the idempotent `db/schema.sql`
  against the prod Neon DB on every schema-touching release, so new `create table if not exists` /
  `add column if not exists` statements always reach prod. *(Defensive code option, secondary: have
  `applyForCurator` / `submitMySpotifyAccessRequest` tolerate `42P01` with a clearer message.)*

  > **RESOLVED (Jun 18, 2026):** the immediate drift was fixed by applying `db/schema.sql` to the Neon
  > `avlmc` project (`long-violet-36681196`). The prod DB (from the Jun 16 Aiven→Neon migration) had been
  > **missing five tables** — `curators`, `curator_picks` (Phase 13), `listener_follows` (Phase 12),
  > `user_emails` (Phase 15 C1), `spotify_access_requests` (Phase 15 C2) — which caused the
  > "Curator application unavailable." 500 (INSERT → `42P01`) and left the follow graph + Phase 15
  > multi-email linking + Spotify access requests inert. The idempotent/additive apply created all five
  > (18 → 23 tables) with no data loss; the `user_emails` back-fill populated existing users' primary
  > emails (2 users → 2 rows). Curator apply + Phase 15 features are now live on prod. This runbook item
  > remains so it can't recur.
  >
  > **Recurred (and re-applied) Jun 18, 2026:** the new `feedback` table (404 detour) was also missing on
  > prod after its release — applied via the same idempotent path (23 → 24 tables, prod now matches
  > `db/schema.sql`). Two manual applies in one day is the signal this runbook item is needed.

* **Run the PRD 38 live cross-browser proof (Phase 15 — the only non-autonomous step).** The account loop
  is wired and live in code: signed-in OAuth linking is native Auth.js v5 behavior (verified in
  `next-auth@5.0.0-beta.31` source), the `getUserByEmail` multi-email resolution is wired
  (`lib/auth-adapter.ts` → `auth.ts`), and email collisions route to the PRD 37 recovery. What remains is
  **proof**, which needs a human + live Spotify credentials: walk
  [`account-signin-linking-reliability-checklist.md`](account-signin-linking-reliability-checklist.md)
  across the supported browser/device matrix (all six legs), and run `checkAccountIntegrity`
  (`lib/account-integrity.ts`) on the resulting rows after linking + reconnection. `$0`, no Spotify writes,
  Snyk-clean.

  **Done (Jun 18, 2026):** the profile-menu "Email me a sign-in link" entry point for Spotify-first users
  (sends a magic link to an email already verified on their account → resolves back to it; no backend
  change). **Tier 2 (deferred):** linking a **brand-new/different** email while signed in needs a
  session-bound signed-token + confirm route (the email-provider path doesn't auto-link to the session like
  OAuth does), plus hardening `findUserIdByEmail` to `verified`-only — security-sensitive, lower urgency.

* _Otherwise none open._ The analytics/WAU‑MAU dependency below is resolved. Active focus is the Phase 15 follow-up above and the Personalized Discovery follow-ups tracked in [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md).

## Planned Next / Up Next

- **Nested Comments on Contributions**: Allow users to comment specifically on a listed song or note.
- **Permanent Curator Fixtures**: Songs added by a curator should become permanent fixtures on their profile, so they never roll off even if the event is in the past.

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

* **Design-spec alignment pass for the new Phase 15 / account surfaces.** Audit the surfaces added across
  Phase 15 + the onboarding/sign-in work against [`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md)
  (dark monochrome, zinc surfaces/borders, glassmorphism, uppercase-tracked metadata, orange/rose accents
  reserved for interaction): the `app/auth/error` recovery page + `components/AuthRecovery.tsx`, the
  `components/SpotifyAccessRequest.tsx` + admin `SpotifyAccessSection`, and the listener-profile email
  sign-in / Spotify-access additions in `components/ListenerProfileButton.tsx`. Bring the ad-hoc `.form-message`
  / `.listener-spotify-optional` styling and the recovery page's inline border colors into line with the spec.
  `$0`, no behavior change. *(Reported Jun 18, 2026.)*

* **"Recommend a curator" — replace the `mailto:` with a minimal in-app form.** Today the recommend-a-curator
  action opens a manual email (`mailto:`), which is high-friction. Replace it with a short form (minimal
  required fields — e.g. who they're recommending + an optional why/link) that submits without the user
  composing an email. Reuse the Phase 13 request-queue pattern: a `requireUserId()`-gated (or anonymous-OK?)
  `app/api/me/*` submit feeding an admin review surface (`app/api/admin/*` + a `*Section.tsx` panel), like
  the curator-application and Spotify-access queues. Decide auth requirement (allow anonymous recommendations
  vs. signed-in only) and whether to notify the admin in-panel only or also via Resend. Private to
  submitter + admin; `$0`; Snyk-clean. *(Reported Jun 18, 2026.)*

* **Admin viewer for listener feedback.** The 404 detour (`app/not-found.tsx`) + `POST /api/feedback`
  now persist feedback to the `feedback` table (additive; `db-feedback` node), but there's **no admin
  surface to read it yet**. Add a simple admin-cookie-gated read (`app/api/admin/feedback` + a
  `components/admin/*Section.tsx` panel, or a column in an existing tab) listing recent notes (message,
  optional email, path, when). Reuses the admin-review pattern. *(Shipped Jun 18, 2026: the 404 detour +
  capture; the viewer is the fast-follow.)*

* **Vercel Caching for OG Image Generation**: Add Next.js route segment caching (`export const revalidate = 3600;`) to the dynamic per-event `app/event/[id]/opengraph-image.tsx` and `twitter-image.tsx`. This will cache the expensive Satori/WebAssembly image generation on Vercel's CDN, preventing runaway compute costs (GB-Hours) if an event link goes viral and is scraped thousands of times. Parked while WAU < 10.

## Done

* **Admin │ Architecture — implementation-detail hover tooltips** — Shipped (June 24, 2026).
  Enhancement to the PRD 06 / C1 architecture surface (which had only a macro service→table view):
  the graph now exposes per-node micro-detail on hover. An additive, optional `implementationNotes`
  field on `RegistryNode` (`lib/system-registry.ts`) — typed by `ImplementationNoteKind`
  (`sql_fallback` / `param_mapping` / `runtime_gotcha` / `note`, with `IMPLEMENTATION_NOTE_KIND_LABELS`)
  — drives a styled HTML tooltip overlay (`ImplementationTooltip` in
  `components/admin/ArchitectureSection.tsx`, design-spec zinc/glass in `app/globals.css`) anchored to
  the hovered/focused node (flips below when it would overflow), after a **1.1s hover-intent delay**
  (`HOVER_INTENT_MS`, tunable) so it doesn't flicker while sweeping the graph (keyboard focus shows
  immediately), with a `ⓘ` affordance on nodes that carry notes; the same notes also render in the click
  `NodeDetail` (covers List view, touch, keyboard). Because the field lives on the one drift-guarded
  registry, the notes flow automatically into the JSON export (`GET /api/admin/system-map`) and the
  generated markdown (`docs/product/system-map.generated.md`, regenerated) agents read — one source of
  truth. **All 70 registry nodes** now carry **code-verified** notes (harvested from the backing files —
  e.g. `db-events` window-read param mapping; `db-music-connections` `null::timestamptz` / `db-music-profile-items`
  `'{}'::text[]` missing-column fallbacks; `svc-discovery-memory` `make_interval(days => $2::int)` + GREATEST
  hand-off; `svc-curators` no-FK snapshot; the `42P01/42703` brownfield-tolerance pattern across services;
  `ui-community-panel` flags the tracked Snyk DOM-XSS). Drift guard extended with a note-kind invariant (`test:registry`, 7).
  `typecheck` / `test:registry` / `lint` green; new code Snyk-clean; `$0`; no change to the public product.
  *(This consolidates the duplicate "Admin/Architecture Hover Tooltips" (Planned Next) and "Admin
  Architecture Graph — Implementation Tooltips" (Parked) entries.)*

* **404 "detour" page + listener feedback capture** — Shipped (June 18, 2026). A broken link is treated as
  a missed connection, not a dead end: `app/not-found.tsx` apologizes, shows three shows happening soon
  (next 24h, else soonest upcoming, via `getUpcomingEvents`; resilient if events can't load), explains in
  plain language how the board personalizes (with a tune-it link), offers a feedback form
  (`components/FeedbackForm.tsx` → public `POST /api/feedback`) that returns to the board on send, a
  "Skip & go home", and an "explore & recommend curators" link. Feedback persists to an additive `feedback`
  table via `lib/feedback(-core).ts` (submit is `42P01`-tolerant so the form never errors before
  provisioning); pure validation unit-tested (`test:feedback`, 5 cases); registered (`db-feedback`,
  `api-feedback`); cross-browser e2e (`e2e/not-found.spec.ts`, Chromium + Firefox). Admin feedback viewer is
  the parked fast-follow. `$0`, anonymous-first, Snyk-clean.

* **Transactional / magic-link email design pass** — Shipped (June 18, 2026). The Auth.js Resend magic-link
  email is now a branded dark-mode template (`lib/auth-email.ts`: `renderMagicLinkEmail` →
  `{ subject, html, text }` with an HTML-escaped, deliverability-safe inline-styled body + a plain-text
  fallback; `sendMagicLinkEmail` posts to Resend), wired via a `sendVerificationRequest` on the `Resend`
  provider in `auth.ts`, aligned to [`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md).
  Unit-tested (`test:auth-email`, 4 cases). `$0` (Resend free tier). *(The broader Phase 15 surfaces design
  pass — recovery page, Spotify-access UI, profile additions — remains parked above.)*

* **Support link — "buy me a coffee" (humble)** — Shipped (June 17, 2026). A quiet, on-brand support ask while the service is pre-revenue. Delivered:
  * `components/SupportButton.tsx` — a gold `Coffee` (lucide) icon in the topbar linking to `https://buymeacoffee.com/bmccall17` (new tab), with an accessible hover/focus tooltip (`aria-label`, `role="tooltip"`, keyboard-focusable).
  * `app/page.tsx` — `<SupportButton />` placed in `sandbox-topbar-actions`, after `ListenerProfileButton`.
  * `app/globals.css` — `.sandbox-support` button + `.sandbox-support-tooltip`, modeled on the existing `.sandbox-action-tooltip` pattern and tinted with `--gold`; right-aligned and viewport-capped so it never overflows the bar on mobile.
  * Tooltip copy (intentionally lowercase/humble): "a project fueled by a love for music… and coffee! if it's useful and you want to see it keep growing, consider buying me a coffee."
  * No PRD/admin cycle — standalone UI. Typecheck, `test:registry`, and Snyk code scan all green.

* **Analytics & Tracking for WAU/MAU** — Resolved (June 2026). **Umami Cloud** is the chosen lightweight, low-cookie tracker; the script is wired in `app/layout.tsx` (gated on `NEXT_PUBLIC_UMAMI_WEBSITE_ID`). The Admin Portal's **Analytics** tab (Cycle C6 / [PRD 11](prds/prd-11-product-analytics-umami.md)) reads Umami back **server-side** — unique visitors (the WAU/MAU proxy) over 24h/7d/30d, top pages, and referrers — joined with a first-party event funnel and conversions, plus a **free-tier scaling-milestone indicator** that flags when usage nears the Umami ceiling (the trigger for un-parking items like the OG caching above and Vercel compute protections).
  * On-site tracking already collects without extra config; to read traffic *into* the portal, set the server-only `UMAMI_API_KEY` (and optional `UMAMI_API_URL`). Until it is set, the Analytics tab shows a clear "not configured" notice and the first-party funnel/conversions still render.
  * Cross-reference: the [master roadmap](master-roadmap.md) Scaling Milestones still own the $0 ceilings; this item only delivered the *visibility* needed to see them coming.
