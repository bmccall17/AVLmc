/**
 * Local test script for OG image rendering.
 * Run with: npx tsx scripts/test-og-render.tsx
 *
 * This bypasses the database entirely and tests ONLY the Satori rendering
 * pipeline with mock event data. If this script succeeds, the production
 * route will work.
 */
import { writeFileSync } from "node:fs";
import { renderOgImage } from "../lib/og-image-shared";

const mockEvent = {
  eventTitle: "Good Hot Fish at Wicked Weed West",
  artistName: "Good Hot Fish at Wicked Weed West",
  venueName: "Wicked Weed West",
  eventDate: "2026-06-14",
  eventTime: "1:00 PM",
  imageUrl:
    "https://www.exploreasheville.com/sites/default/files/listing_images/eu-west-1-ced5e211-a7c1-ce12-2acc-a5f19b4413ca-w-4501h-3375-e2ea2b-0426-Good_Hot_Fish_x_Wicked_Weed_West-collage-1080x1080-no_date_jpg.png",
  tags: ["Live Music"],
  source: "AVLgo live feed: EXPLORE_ASHEVILLE",
};

const mockEventNoImage = {
  ...mockEvent,
  imageUrl: null,
  eventTitle: "Cosmic Charlie",
  artistName: "Cosmic Charlie",
  venueName: "Grey Eagle Music Hall",
};

async function run() {
  console.log("=== Testing OG image render (with image) ===");
  try {
    const response = await renderOgImage(mockEvent);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync("scripts/test-og-output.png", buffer);
    console.log(
      `✅ Success! ${buffer.length} bytes written to scripts/test-og-output.png`
    );
  } catch (err) {
    console.error("❌ RENDER FAILED:", err);
    process.exit(1);
  }

  console.log("\n=== Testing OG image render (no image / fallback) ===");
  try {
    const response = await renderOgImage(mockEventNoImage);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync("scripts/test-og-output-fallback.png", buffer);
    console.log(
      `✅ Success! ${buffer.length} bytes written to scripts/test-og-output-fallback.png`
    );
  } catch (err) {
    console.error("❌ FALLBACK RENDER FAILED:", err);
    process.exit(1);
  }
}

run();
