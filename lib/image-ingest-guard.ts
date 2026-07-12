/**
 * Pure guard logic for server-initiated image fetches (PRD 50 / ADR 003 §3). Kept free of
 * network and @vercel/blob imports so the bounds are unit-testable without touching either.
 * `ingestImageToBlob` (lib/blob-storage.ts) is the consumer.
 */

/** Hard ceiling on bytes accepted from a remote image host per ingest. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** How long one remote image fetch may run before it is aborted. */
export const IMAGE_FETCH_TIMEOUT_MS = 10_000;

export type ImageGuardVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Header-level gate: the response must declare an `image/*` content type, and if it declares a
 * length at all, that length must be inside the byte ceiling. A missing content type is rejected —
 * we only ingest bytes a host is willing to call an image.
 */
export function checkImageResponseHeaders(
  contentType: string | null,
  contentLength: string | null,
  maxBytes = MAX_IMAGE_BYTES
): ImageGuardVerdict {
  if (!contentType?.trim().toLowerCase().startsWith("image/")) {
    return { ok: false, reason: `content-type ${contentType ?? "(none)"} is not image/*` };
  }

  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, reason: `content-length ${declared} exceeds ceiling ${maxBytes}` };
    }
  }

  return { ok: true };
}

/**
 * Reads a body stream up to `maxBytes`; returns the collected bytes, or null (cancelling the
 * stream) the moment the ceiling is crossed. The header check alone is not enough — a hostile
 * host can omit or lie about content-length and stream forever.
 */
export async function readBodyWithByteCeiling(
  body: ReadableStream<Uint8Array> | null,
  maxBytes = MAX_IMAGE_BYTES
): Promise<Uint8Array | null> {
  if (!body) {
    return null;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}
