import assert from "node:assert/strict";
import test from "node:test";
import {
  describeImageIngestStats,
  emptyImageIngestStats,
  isBlobImageUrl,
  isExpiringImageUrl,
  resolveStoredImageUrl,
} from "../lib/image-resilience";

const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/events/jeremys-ten-171.jpg";
const OTHER_BLOB_URL = "https://abc123.public.blob.vercel-storage.com/events/jeremys-ten-172.jpg";
const FBCDN_URL =
  "https://scontent-atl3-1.xx.fbcdn.net/v/t39.30808-6/photo.jpg?oe=685D2E11&_nc_cat=101";
const FEED_URL = "https://mountainx.com/wp-content/uploads/2026/06/band.jpg";
const OTHER_FEED_URL = "https://www.exploreasheville.com/images/congress-the-band.png";

test("detects expiring Facebook CDN hosts", () => {
  assert.equal(isExpiringImageUrl(FBCDN_URL), true);
  assert.equal(isExpiringImageUrl("https://scontent.xx.fbcdn.net/photo.jpg"), true);
  assert.equal(isExpiringImageUrl(FEED_URL), false);
  assert.equal(isExpiringImageUrl(BLOB_URL), false);
  assert.equal(isExpiringImageUrl(null), false);
  assert.equal(isExpiringImageUrl(undefined), false);
  // Host must actually be fbcdn.net — a lookalike path or unrelated host is not expiring.
  assert.equal(isExpiringImageUrl("https://example.com/fbcdn.net/photo.jpg"), false);
});

test("detects Vercel Blob URLs", () => {
  assert.equal(isBlobImageUrl(BLOB_URL), true);
  assert.equal(isBlobImageUrl(FBCDN_URL), false);
  assert.equal(isBlobImageUrl(FEED_URL), false);
  assert.equal(isBlobImageUrl(null), false);
});

test("a freshly ingested blob URL wins over anything stored", () => {
  assert.equal(resolveStoredImageUrl(null, BLOB_URL), BLOB_URL);
  assert.equal(resolveStoredImageUrl(FEED_URL, BLOB_URL), BLOB_URL);
  assert.equal(resolveStoredImageUrl(FBCDN_URL, BLOB_URL), BLOB_URL);
  assert.equal(resolveStoredImageUrl(BLOB_URL, OTHER_BLOB_URL), OTHER_BLOB_URL);
});

test("a stored blob URL wins over any non-blob incoming value", () => {
  assert.equal(resolveStoredImageUrl(BLOB_URL, FEED_URL), BLOB_URL);
  assert.equal(resolveStoredImageUrl(BLOB_URL, FBCDN_URL), BLOB_URL);
  assert.equal(resolveStoredImageUrl(BLOB_URL, null), BLOB_URL);
});

test("a feed URL wins over NULL", () => {
  assert.equal(resolveStoredImageUrl(null, FEED_URL), FEED_URL);
  assert.equal(resolveStoredImageUrl(undefined, FEED_URL), FEED_URL);
});

test("a fresh feed URL replaces an older non-expiring feed URL", () => {
  assert.equal(resolveStoredImageUrl(FEED_URL, OTHER_FEED_URL), OTHER_FEED_URL);
});

test("a dead ingest never clobbers a working stored image", () => {
  // Incoming expiring URL that could not be ingested: keep whatever non-expiring URL exists.
  assert.equal(resolveStoredImageUrl(FEED_URL, FBCDN_URL), FEED_URL);
  // Nothing better to keep → NULL, never the dead CDN URL.
  assert.equal(resolveStoredImageUrl(null, FBCDN_URL), null);
  assert.equal(resolveStoredImageUrl(FBCDN_URL, FBCDN_URL), null);
});

test("an incoming NULL never erases a working stored image", () => {
  assert.equal(resolveStoredImageUrl(FEED_URL, null), FEED_URL);
  assert.equal(resolveStoredImageUrl(BLOB_URL, undefined), BLOB_URL);
});

test("an incoming NULL clears a stored expiring URL rather than keeping it", () => {
  assert.equal(resolveStoredImageUrl(FBCDN_URL, null), null);
  assert.equal(resolveStoredImageUrl(null, null), null);
});

test("ingest stats summary reads cleanly and is null when nothing happened", () => {
  assert.equal(describeImageIngestStats(emptyImageIngestStats()), null);
  assert.equal(
    describeImageIngestStats({ ingested: 3, reused: 2, failed: 1, deadSkipped: 1 }),
    "images: 3 ingested, 2 reused, 1 failed, 1 dead-skipped"
  );
});
