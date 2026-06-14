import { getEventById } from "@/lib/events";
import { OG_IMAGE_SIZE, OG_IMAGE_CONTENT_TYPE, renderOgImage } from "@/lib/og-image-shared";

export const runtime = "nodejs";
export const alt = "Event details";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  return renderOgImage(event);
}
