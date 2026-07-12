import { put, del } from "@vercel/blob";
import {
  IMAGE_FETCH_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  checkImageResponseHeaders,
  readBodyWithByteCeiling,
} from "@/lib/image-ingest-guard";

type IngestImageOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

/**
 * Downloads an image from an external URL and uploads it to Vercel Blob.
 * Used to ingest expiring CDN URLs (like Facebook fbcdn.net) into persistent storage.
 *
 * Bounded per PRD 50 / ADR 003 §3: the fetch is time-limited, the response must declare an
 * `image/*` content type, and the body is read under a hard byte ceiling — a hostile or broken
 * host can neither hang a sync job nor stream unbounded bytes into Blob storage.
 */
export async function ingestImageToBlob(
  url: string,
  eventId: string,
  options: IngestImageOptions = {}
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? IMAGE_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      console.error(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const verdict = checkImageResponseHeaders(
      response.headers.get("content-type"),
      response.headers.get("content-length"),
      maxBytes
    );
    if (!verdict.ok) {
      console.error(`Refusing image ingest from ${url}: ${verdict.reason}`);
      return null;
    }

    const bytes = await readBodyWithByteCeiling(response.body, maxBytes);
    if (!bytes) {
      console.error(`Refusing image ingest from ${url}: body exceeded ${maxBytes} bytes`);
      return null;
    }

    const extension = contentType.split("/")[1]?.split(";")[0] || "jpg";
    const filename = `events/${eventId}-${Date.now()}.${extension}`;

    const blobResponse = await put(filename, Buffer.from(bytes), {
      access: "public",
      contentType,
    });

    return blobResponse.url;
  } catch (error) {
    console.error(`Error ingesting image to blob for event ${eventId}:`, error);
    return null;
  }
}

/**
 * Deletes an image from Vercel Blob by its URL.
 */
export async function deleteImageBlob(url: string): Promise<void> {
  if (!url.includes("public.blob.vercel-storage.com")) {
    return;
  }

  try {
    await del(url);
  } catch (error) {
    console.error(`Error deleting blob image ${url}:`, error);
  }
}
