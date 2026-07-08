import "server-only";
import { del } from "@vercel/blob";
import { query } from "@/lib/db";

/**
 * Custom-uploaded avatars live in Vercel Blob (`*.blob.vercel-storage.com`). We use the host to tell
 * a listener's own upload apart from a provider CDN URL (Spotify/Google), so provider sign-ins never
 * clobber a photo the listener deliberately set. This is the precedence rule without a schema flag.
 */
export function isCustomAvatarUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function getUserImage(userId: string): Promise<string | null> {
  const result = await query<{ image: string | null }>(
    `select image from public.users where id = $1`,
    [userId]
  );
  return result.rows[0]?.image ?? null;
}

export async function setUserImage(userId: string, image: string | null): Promise<void> {
  await query(`update public.users set image = $1 where id = $2`, [image, userId]);
}

/**
 * Best-effort cleanup of a previous custom avatar blob. Only deletes URLs we own (Vercel Blob) so we
 * never try to delete a provider CDN URL, and never let a cleanup failure fail the request.
 */
export async function deleteCustomAvatarBlob(url: string | null | undefined): Promise<void> {
  if (!isCustomAvatarUrl(url)) {
    return;
  }
  try {
    await del(url as string);
  } catch (error) {
    console.error("Failed to delete previous avatar blob.", error);
  }
}
