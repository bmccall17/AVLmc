import { NextResponse } from "next/server";
import { getUpcomingEvents } from "@/lib/events";

export async function GET() {
  const events = await getUpcomingEvents();

  return NextResponse.json({
    source: process.env.AVLGO_API_URL ? "custom AVLGO_API_URL" : "AVLgo public JSON export",
    syncedAt: new Date().toISOString(),
    windowDays: 21,
    eventCount: events.length,
    events
  });
}
