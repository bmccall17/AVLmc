import { put, del } from "@vercel/blob";

/**
 * Downloads an image from an external URL and uploads it to Vercel Blob.
 * Used to ingest expiring CDN URLs (like Facebook fbcdn.net) into persistent storage.
 */
export async function ingestImageToBlob(url: string, eventId: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = contentType.split("/")[1] || "jpg";
    const filename = `events/${eventId}-${Date.now()}.${extension}`;

    const blobResponse = await put(filename, response.body as ReadableStream, {
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
