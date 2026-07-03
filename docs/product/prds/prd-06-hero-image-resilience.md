# PRD 06: Hero Image Resilience for Facebook-Sourced Events

## Goal

Every event with an image in the AVLgo feed displays a working hero image for the full life of the event — including Facebook-sourced events — because the app persists images to its own durable storage at first sight and never replaces a working stored image with a URL that could expire. Placeholder initials appear only for events that truly have no image upstream.

## Summary

Facebook CDN (`scontent-*.xx.fbcdn.net`) URLs are signed with an expiry (`oe` param, ~30 days). AVLgo's export re-serves these URLs long after they expire, so all `source: FACEBOOK` events lose their hero images at once (most recently on 2026-06-29). The existing blob-ingestion safeguard fails in practice for two reasons, both fixed by this work.

## Background (audit findings, 2026-07-03)

- DB rows for Facebook-sourced events hold raw, expired fbcdn URLs (verified: Jeremy's Ten `947a0dcf`, Somewhat Petty `0e4f9a48`).
- Zero `blob.vercel-storage.com` images exist on the live homepage; all 17 fbcdn images fail; every other source host (mountainx, exploreasheville, evbuc, avlgo, etc.) loads fine.
- AVLgo's own export serves fbcdn URLs already expired at scrape time, so `ingestImageToBlob` gets a non-OK fetch → returns `null` → the dead URL is upserted anyway.
- Even a successful past ingestion is destroyed on the next sync: the upsert sets `image_url = excluded.image_url` unconditionally (`lib/events.ts:435`), clobbering a good blob URL with the feed's dead fbcdn URL.
- Blob credentials are configured; this is not an env/token issue.
- UI: `EventImage` renders any non-null src, `onError` swaps to initials fallback — masking the data problem as a cosmetic one.

## Deliverables (definition of done)

1. **Ingest-once, keep-forever.** During sync, expiring-CDN images (fbcdn at minimum) are copied to Vercel Blob on first successful fetch. Once an event's `image_url` points at blob storage, subsequent syncs do not overwrite it with a feed URL.
2. **Never persist a known-dead URL.** If ingestion of an expiring URL fails, the upsert preserves the existing stored `image_url` (blob or otherwise); it stores `NULL` only when there is nothing better to keep.
3. **No repeat uploads.** A re-sync of an already-ingested event does not create a duplicate blob (no per-sync blob churn / orphans).
4. **Backfill.** A one-time pass (or admin endpoint) repairs existing rows holding dead fbcdn URLs — re-ingesting where a live source can be found, otherwise nulling so the fallback renders intentionally.
5. **Observability.** Sync job run records include counts: images ingested, ingestion failures, dead URLs skipped — visible in the admin job-runs view.
6. **Tests.** Unit coverage for the upsert precedence rule (blob URL wins over feed URL; feed URL wins over NULL; dead-ingest never clobbers).

## Acceptance checks

- All `source: FACEBOOK` events in the current 21-day window render hero images (or an intentional NULL fallback when upstream has none).
- `SELECT count(*) FROM events WHERE image_url LIKE '%fbcdn.net%'` trends to zero after two sync cycles.
- Waiting past a Facebook `oe` expiry date does not break any previously-rendered hero image.

## Non-Goals

- No change to non-expiring source hosts (they hotlink fine today).
- No scraping of Facebook event pages for fresh images (possible follow-up).
- No redesign of the `EventImage` fallback UI.
- No fix on AVLgo's side (upstream serves stale URLs; assume that continues).

## Key files

- `lib/events.ts` — `ingestImagesForEvents` (line ~362), `upsertEventBatch` image_url clobber (line ~435)
- `lib/blob-storage.ts` — `ingestImageToBlob`, `deleteImageBlob`
- `components/EventImage.tsx` — fallback behavior (unchanged, reference only)
- `app/api/sync/avlgo/route.ts`, `app/api/sync/cleanup/route.ts` — job wiring
