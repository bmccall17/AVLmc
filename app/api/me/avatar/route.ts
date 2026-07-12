import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { deleteCustomAvatarBlob, getUserImage, setUserImage } from "@/lib/user-image";
import { RATE_LIMIT_MESSAGE, createWriteRateLimiter, getClientIp } from "@/lib/write-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keyed per IP and per signed-in user — caps Blob churn per account; the 429 fires before the
// body read so a flood never pays the 4 MB buffer or the Blob put.
const limiter = createWriteRateLimiter({ route: "avatar", maxPerIp: 5, maxPerIdentity: 5 });

const MAX_AVATAR_BYTES = 4_000_000; // 4 MB — generous for a profile photo, safe for Blob upload.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Listener-uploaded profile photo. A signed-in listener PUTs raw image bytes (any sign-in method —
 * this is the universal path that doesn't depend on a provider avatar). We store the file in Vercel
 * Blob and point `users.image` at it; because it lives on the Blob host, a later Spotify/Google
 * sign-in won't overwrite it (see `isCustomAvatarUrl`). DELETE reverts to the initials fallback.
 */
export async function POST(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (limiter.check({ ip: getClientIp(request), identity: userId })) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Photo upload isn't configured yet. Connect a Vercel Blob store to enable it." },
      { status: 503 }
    );
  }

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) {
    return NextResponse.json(
      { error: "Upload a JPG, PNG, WEBP, or GIF image." },
      { status: 415 }
    );
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "That file was empty." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "That image is too large — keep it under 4 MB." },
      { status: 413 }
    );
  }

  const previousImage = await getUserImage(userId);

  // Random suffix gives each upload a fresh URL, so the CDN never serves a stale cached photo.
  const blob = await put(`avatars/${userId}.${extension}`, bytes, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });

  await setUserImage(userId, blob.url);
  // Best-effort: reclaim the previous custom blob (no-op for provider URLs).
  await deleteCustomAvatarBlob(previousImage);

  return NextResponse.json({ image: blob.url });
}

export async function DELETE() {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const previousImage = await getUserImage(userId);
  await setUserImage(userId, null);
  await deleteCustomAvatarBlob(previousImage);

  return NextResponse.json({ image: null });
}

async function getSignedInUserId() {
  if (!getAuthFeatureFlags().auth) {
    return null;
  }
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
