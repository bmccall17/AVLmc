# AVL Music Companion Backlog

Updated: June 15, 2026

## Urgent

* _None open._ The analytics/WAU‑MAU dependency below is resolved. Active focus has moved to the Personalized Discovery follow-ups tracked in [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md).

## Parked

* **Vercel Caching for OG Image Generation**: Add Next.js route segment caching (`export const revalidate = 3600;`) to the dynamic per-event `app/event/[id]/opengraph-image.tsx` and `twitter-image.tsx`. This will cache the expensive Satori/WebAssembly image generation on Vercel's CDN, preventing runaway compute costs (GB-Hours) if an event link goes viral and is scraped thousands of times. Parked while WAU < 10.

## Done

* **Analytics & Tracking for WAU/MAU** — Resolved (June 2026). **Umami Cloud** is the chosen lightweight, low-cookie tracker; the script is wired in `app/layout.tsx` (gated on `NEXT_PUBLIC_UMAMI_WEBSITE_ID`). The Admin Portal's **Analytics** tab (Cycle C6 / [PRD 11](prds/prd-11-product-analytics-umami.md)) reads Umami back **server-side** — unique visitors (the WAU/MAU proxy) over 24h/7d/30d, top pages, and referrers — joined with a first-party event funnel and conversions, plus a **free-tier scaling-milestone indicator** that flags when usage nears the Umami ceiling (the trigger for un-parking items like the OG caching above and Vercel compute protections).
  * On-site tracking already collects without extra config; to read traffic *into* the portal, set the server-only `UMAMI_API_KEY` (and optional `UMAMI_API_URL`). Until it is set, the Analytics tab shows a clear "not configured" notice and the first-party funnel/conversions still render.
  * Cross-reference: the [master roadmap](master-roadmap.md) Scaling Milestones still own the $0 ceilings; this item only delivered the *visibility* needed to see them coming.
