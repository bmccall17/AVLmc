import { NextResponse } from "next/server";
import { cleanupOldEventImages } from "@/lib/events";

export async function GET() {
  try {
    const result = await cleanupOldEventImages(7);

    return NextResponse.json({
      success: true,
      cleanedAt: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error("Cleanup job failed:", error);
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
