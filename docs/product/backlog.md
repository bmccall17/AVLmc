# AVL Music Companion Backlog

## Urgent

* **Set up Analytics & Tracking for WAU/MAU**: Implement a lightweight tracking solution (e.g., Vercel Web Analytics, Plausible, or PostHog) to monitor Weekly Active Users (WAU) and Monthly Active Users (MAU). This is a critical dependency to know when the app is hitting scaling milestones that would require moving items out of the "Parked" backlog (such as Vercel compute protections).

## Parked

* **Vercel Caching for OG Image Generation**: Add Next.js route segment caching (`export const revalidate = 3600;`) to `opengraph-image.tsx` and `twitter-image.tsx`. This will cache the expensive Satori/WebAssembly image generation on Vercel's CDN, preventing runaway compute costs (GB-Hours) if an event link goes viral and is scraped thousands of times. Parked while WAU < 10.
