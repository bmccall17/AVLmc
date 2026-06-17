import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import {
  shapeCircleActivity,
  type CircleEventActivity,
} from "@/lib/social-activity-core";
import type { PublicSharedSong } from "@/lib/shared-songs-core";

/**
 * Inner-Circle Attribution service (PRD 24 / C2) — "your people, not the crowd".
 *
 * A pure READ layer over the C1 graph: it joins `listener_follows` against the existing activity
 * sources (`event_person_event_state` for going/firing, `event_shared_songs.seeded_by_user_id` for
 * shared songs) and returns ONLY the activity of followees the viewer follows AND who have
 * activity-sharing on. No new per-event social store — attribution is live-computed and gated at the
 * SQL join, so a followee who turns sharing off instantly disappears (no cached attribution outlives
 * the opt-in). `seeded_by_user_id` is resolved to a display name server-side at the gate and never
 * shipped raw. Every read returns empty for anonymous callers and unentitled events; the anonymous /
 * public path (PRD 17's unattributed list, anonymous community heat) is untouched.
 */

type CircleActivityQueryRow = {
  event_id: string;
  user_id: number;
  name: string | null;
  going: boolean;
  firing: boolean;
};

/**
 * Per-event circle activity for a viewer, batched into ONE query for the whole board page (never per
 * card). Returns {} for anonymous callers, an unmigrated DB, or events with no entitled activity.
 *
 * The join IS the C1 gate: an active follow edge (`f`) AND the followee's `share_activity` opt-in
 * (`p.share_activity = true`). "Going" = planning still current; "firing" = fire still current
 * (each not overridden by a later removal). The viewer never sees themselves here.
 */
export async function getCircleEventActivity(
  viewerId: string | null | undefined,
  eventIds: string[]
): Promise<Record<string, CircleEventActivity>> {
  const viewer = toNullableUserId(viewerId);
  const uniqueIds = Array.from(new Set(eventIds)).filter(Boolean);

  if (!viewer || uniqueIds.length === 0) {
    return {};
  }

  try {
    const result = await query<CircleActivityQueryRow>(
      `
        select
          s.event_id,
          s.user_id,
          u.name,
          (s.planning_at is not null and (s.removed_at is null or s.planning_at > s.removed_at)) as going,
          (s.fire_at is not null and (s.removed_at is null or s.fire_at > s.removed_at)) as firing
        from public.event_person_event_state s
        join public.listener_follows f
          on f.followee_user_id = s.user_id and f.follower_user_id = $1 and f.status = 'active'
        join public.listener_discovery_preferences p
          on p.user_id = s.user_id and p.share_activity = true
        join public.users u on u.id = s.user_id
        where s.event_id = any($2::text[])
          and s.user_id is not null
          and s.user_id <> $1
      `,
      [viewer, uniqueIds]
    );

    return shapeCircleActivity(
      result.rows.map((row) => ({
        eventId: row.event_id,
        userId: String(row.user_id),
        displayName: row.name,
        going: Boolean(row.going),
        firing: Boolean(row.firing),
      }))
    );
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return {};
    }
    throw error;
  }
}

/**
 * Attach `sharedBy` to the public shared-song rows the viewer is ENTITLED to see (the seeder is
 * someone they follow who opted into sharing). Every other row stays byte-for-byte the PRD 17
 * unattributed shape. `seeded_by_user_id` never leaves this function — only the resolved name does.
 */
export async function attributeSharedSongs(
  viewerId: string | null | undefined,
  eventId: string,
  songs: PublicSharedSong[]
): Promise<PublicSharedSong[]> {
  const viewer = toNullableUserId(viewerId);

  if (!viewer || songs.length === 0) {
    return songs;
  }

  const songIds = songs.map((song) => song.id);

  try {
    const result = await query<{ id: string; name: string | null }>(
      `
        select s.id, u.name
        from public.event_shared_songs s
        join public.listener_follows f
          on f.followee_user_id = s.seeded_by_user_id and f.follower_user_id = $1 and f.status = 'active'
        join public.listener_discovery_preferences p
          on p.user_id = s.seeded_by_user_id and p.share_activity = true
        join public.users u on u.id = s.seeded_by_user_id
        where s.event_id = $2
          and s.id = any($3::text[])
          and s.seeded_by_user_id is not null
          and s.seeded_by_user_id <> $1
      `,
      [viewer, eventId, songIds]
    );

    if (result.rows.length === 0) {
      return songs;
    }

    const sharedByBySong = new Map<string, string>();
    for (const row of result.rows) {
      const name = (row.name ?? "").trim();
      if (name) {
        sharedByBySong.set(row.id, name);
      }
    }

    return songs.map((song) =>
      sharedByBySong.has(song.id) ? { ...song, sharedBy: sharedByBySong.get(song.id) ?? null } : song
    );
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return songs;
    }
    throw error;
  }
}

export type CircleShareKind = "show" | "song_list";

/**
 * Record a listener's intent to surface a show (and its song list) to their circle. Reuses existing
 * state rather than a new table: it marks the listener as "going" on the event — exactly the state
 * their followers read in `getCircleEventActivity`. Idempotent, best-effort, never blocks; performs
 * NO Spotify write and adds no new ranking pathway (it is the same signal as tapping Going).
 */
export async function shareWithCircle(input: {
  userId: string;
  eventId: string;
  eventTitle?: string;
  kind?: CircleShareKind;
}): Promise<boolean> {
  const userId = toNullableUserId(input.userId);
  const eventId = input.eventId?.trim();

  if (!userId || !eventId) {
    return false;
  }

  try {
    await query(
      `
        insert into public.event_person_event_state (
          id, event_id, event_title, session_id, user_id, identity_key, planning_at
        )
        values ($1, $2, $3, '', $4, $5, now())
        on conflict (event_id, identity_key) do update
          set planning_at = coalesce(public.event_person_event_state.planning_at, now()),
            removed_at = null,
            updated_at = now()
      `,
      [randomUUID(), eventId, input.eventTitle ?? "", userId, `user:${userId}`]
    );
    return true;
  } catch (error) {
    if (isToleratedSchemaError(error)) {
      return false;
    }
    // Best-effort: never let a share failure surface as an error to the caller.
    console.error("shareWithCircle failed:", error);
    return false;
  }
}

function toNullableUserId(userId: string | null | undefined): number | null {
  if (!userId) {
    return null;
  }
  const parsed = Number(userId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Tolerate a not-yet-migrated table (42P01) or a pre-migration missing column (42703). */
function isToleratedSchemaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "42P01" || code === "42703";
}
