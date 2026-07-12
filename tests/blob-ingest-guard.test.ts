import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMAGE_BYTES,
  checkImageResponseHeaders,
  readBodyWithByteCeiling,
} from "../lib/image-ingest-guard";
import { ingestImageToBlob } from "../lib/blob-storage";

/**
 * PRD 50 / ADR 003 §3: server-initiated image fetches are size-, type-, and time-bounded. The
 * guard logic is pure (lib/image-ingest-guard.ts); the abort behavior is exercised end-to-end
 * through ingestImageToBlob with a stubbed global fetch. Runs via tsx from the repo root.
 */

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

test("non-image content type is rejected", () => {
  const verdict = checkImageResponseHeaders("text/html", "123");
  assert.equal(verdict.ok, false);
});

test("missing content type is rejected", () => {
  const verdict = checkImageResponseHeaders(null, "123");
  assert.equal(verdict.ok, false);
});

test("oversized declared content-length is rejected", () => {
  const verdict = checkImageResponseHeaders("image/jpeg", String(MAX_IMAGE_BYTES + 1));
  assert.equal(verdict.ok, false);
});

test("image within the ceiling passes, with or without content-length", () => {
  assert.equal(checkImageResponseHeaders("image/jpeg", "2048").ok, true);
  assert.equal(checkImageResponseHeaders("image/png; charset=binary", null).ok, true);
});

test("body under the ceiling is collected intact", async () => {
  const bytes = await readBodyWithByteCeiling(
    streamOf([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]),
    10
  );
  assert.deepEqual(Array.from(bytes ?? []), [1, 2, 3, 4, 5]);
});

test("body crossing the ceiling mid-stream is refused", async () => {
  const bytes = await readBodyWithByteCeiling(
    streamOf([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)]),
    8
  );
  assert.equal(bytes, null);
});

test("slow fetch aborts: ingestImageToBlob returns null instead of hanging", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation timed out.", "TimeoutError"))
      );
    })) as typeof fetch;

  // AbortSignal.timeout's timer is unref'd, so with fetch mocked nothing else holds the event
  // loop open — without a ref'd keepalive, Node 20's test runner drains the loop and cancels
  // this (and every later) test before the 50ms abort ever fires.
  const keepAlive = setTimeout(() => undefined, 5_000);
  try {
    const result = await ingestImageToBlob("https://example.com/slow.jpg", "evt-slow", {
      timeoutMs: 50,
    });
    assert.equal(result, null);
  } finally {
    clearTimeout(keepAlive);
    globalThis.fetch = originalFetch;
  }
});

test("hostile stream that lies about content-length is refused before upload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(streamOf([new Uint8Array(64), new Uint8Array(64)]), {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": "10" },
    })) as typeof fetch;

  try {
    const result = await ingestImageToBlob("https://example.com/liar.jpg", "evt-liar", {
      maxBytes: 100,
    });
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("non-image response is refused before upload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<html>not an image</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

  try {
    const result = await ingestImageToBlob("https://example.com/page.html", "evt-html");
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
