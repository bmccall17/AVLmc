import { syncUpcomingEvents } from "./lib/events";
import { ingestImageToBlob } from "./lib/blob-storage";
import { put } from "@vercel/blob";

async function runTest() {
  console.log("1. Testing Vercel Blob Configuration...");
  try {
    const testBlob = await put("test-connection.txt", "Hello Vercel Blob!", { access: "public" });
    console.log("✅ Successfully connected to Vercel Blob!");
    console.log("   Test blob URL:", testBlob.url);
  } catch (err: any) {
    console.error("❌ Failed to connect to Vercel Blob.");
    console.error("   Error:", err.message);
    return;
  }

  console.log("\n2. Running manual AVLgo sync to ingest images...");
  try {
    const events = await syncUpcomingEvents();
    console.log(`✅ Sync complete! Processed ${events.length} events.`);
    
    // Check if Modest Mouse is in the list
    const modestMouse = events.find((e: any) => e.title.toLowerCase().includes("modest mouse"));
    if (modestMouse) {
      console.log("\nFound Modest Mouse event:");
      console.log("ID:", modestMouse.id);
      console.log("Image URL:", modestMouse.imageUrl);
      if (modestMouse.imageUrl?.includes("blob.vercel-storage.com")) {
        console.log("✅ Modest Mouse image was successfully ingested to Vercel Blob!");
      } else {
        console.log("⚠️ Modest Mouse image was NOT ingested to Vercel Blob.");
      }
    } else {
      console.log("\n⚠️ Modest Mouse event not found in the upcoming sync window.");
    }
  } catch (err: any) {
    console.error("❌ Failed to run sync.");
    console.error(err);
  }
}

runTest();
