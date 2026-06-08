import { put } from "@vercel/blob";
import { ingestImageToBlob } from "./lib/blob-storage";

async function run() {
  console.log("1. Testing raw Vercel Blob connection...");
  try {
    const testBlob = await put("test-connection.txt", "Hello Vercel Blob!", { access: "public" });
    console.log("✅ Successfully connected! Test file:", testBlob.url);
  } catch (err: any) {
    console.error("❌ Failed to connect to Vercel Blob. Did you restart your dev server?");
    console.error(err.message);
    return;
  }

  console.log("\n2. Testing Image Ingestion with a KNOWN GOOD image URL...");
  try {
    // A known working image from mountainx.com
    const workingUrl = "https://mountainx.com/wp-content/uploads/2026/02/Screenshot-2026-02-24-at-7.41.49-PM.png";
    const blobUrl = await ingestImageToBlob(workingUrl, "test-event-123");
    if (blobUrl) {
      console.log("✅ Successfully ingested image to Vercel Blob!");
      console.log("   New URL:", blobUrl);
    } else {
      console.log("❌ Failed to ingest image. (Check fetch logs)");
    }
  } catch (err: any) {
    console.error("❌ Failed to ingest image.");
    console.error(err.message);
  }
}

run();
