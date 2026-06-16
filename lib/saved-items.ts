import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { normalizeText } from "@/lib/discovery";

/**
 * Saved/Favorites service (PRD 12 / C1, Track A).
 *
 * Owns all reads/writes of the private, polymorphic `saved_items` table. A signed-in listener
 * can save events, venues, and artists; saves are private, durable, and instantly reversible.
 *
 * Identity rule: for events, `item_key` is the stable event id (and `event_id` mirrors it). For
 * venues and artists — which have no canonical entity table — `item_key` is the normalized name
 * from the same `normalizeText` used by discovery scoring, so a saved venue/artist matches event
 * fields consistently downstream (C3). `label` snapshots the human-readable name at save time.
 */

export type SavedItemType = "event" | "venue" | "artist";

export type SavedItem = {
  id: string;
  itemType: SavedItemType;
  itemKey: string;
  label: string;
  eventId: string | null;
  createdAt: string;
};

export type SavedItemsByType = {
  event: SavedItem[];
  venue: SavedItem[];
  artist: SavedItem[];
};

export type SavedKey = {
  itemType: SavedItemType;
  itemKey: string;
};

export type SaveItemInput = {
  itemType: SavedItemType;
  itemKey: string;
  label: string;
  eventId?: string | null;
};

const ITEM_TYPES: readonly SavedItemType[] = ["event", "venue", "artist"];
const MAX_KEY_LENGTH = 512;
const MAX_LABEL_LENGTH = 512;

type SavedItemRow = {
  id: string;
  item_type: string;
  item_key: string;
  label: string;
  event_id: string | null;
  created_at: Date | string;
};

export function isSavedItemType(value: unknown): value is SavedItemType {
  return typeof value === "string" && (ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * Derive the canonical `item_key` for a save. Events key on the stable event id; venues and
 * artists key on the normalized display name so saving and scoring share one normalization.
 */
export function deriveItemKey(itemType: SavedItemType, rawKey: string): string {
  const trimmed = rawKey.trim();

  if (itemType === "event") {
    return trimmed.slice(0, MAX_KEY_LENGTH);
  }

  return normalizeText(trimmed).slice(0, MAX_KEY_LENGTH);
}

/**
 * Idempotent save. Returns the canonical stored row (existing row on conflict). Throws on
 * invalid input so the API can surface a 400.
 */
export async function saveItem(userId: string, input: SaveItemInput): Promise<SavedItem> {
  if (!isSavedItemType(input.itemType)) {
    throw new Error("Invalid item type.");
  }

  const itemKey = deriveItemKey(input.itemType, input.itemKey ?? "");
  const label = (input.label ?? "").trim().slice(0, MAX_LABEL_LENGTH);

  if (!itemKey) {
    throw new Error("A non-empty item key is required.");
  }
  if (!label) {
    throw new Error("A non-empty label is required.");
  }

  const eventId =
    input.itemType === "event" ? itemKey : input.eventId ? input.eventId.trim().slice(0, MAX_KEY_LENGTH) || null : null;

  const result = await query<SavedItemRow>(
    `
      insert into public.saved_items (id, user_id, item_type, item_key, label, event_id)
      values ($1, $2, $3, $4, $5, $6)
      on conflict (user_id, item_type, item_key) do nothing
      returning id, item_type, item_key, label, event_id, created_at
    `,
    [randomUUID(), toDatabaseUserId(userId), input.itemType, itemKey, label, eventId]
  );

  const row = result.rows[0];
  if (row) {
    return mapRow(row);
  }

  // Already saved (conflict) — return the canonical existing row.
  const existing = await query<SavedItemRow>(
    `
      select id, item_type, item_key, label, event_id, created_at
      from public.saved_items
      where user_id = $1 and item_type = $2 and item_key = $3
      limit 1
    `,
    [toDatabaseUserId(userId), input.itemType, itemKey]
  );

  return mapRow(existing.rows[0]);
}

/** Idempotent un-save: removes the row if present. Returns true if a row was deleted. */
export async function removeSavedItem(
  userId: string,
  input: { itemType: SavedItemType; itemKey: string }
): Promise<boolean> {
  if (!isSavedItemType(input.itemType)) {
    throw new Error("Invalid item type.");
  }

  const itemKey = deriveItemKey(input.itemType, input.itemKey ?? "");
  if (!itemKey) {
    return false;
  }

  const result = await query(
    `
      delete from public.saved_items
      where user_id = $1 and item_type = $2 and item_key = $3
    `,
    [toDatabaseUserId(userId), input.itemType, itemKey]
  );

  return (result.rowCount ?? 0) > 0;
}

/** All of a user's saves, grouped by type, newest first. Degrades to empty if the table is absent. */
export async function listSavedItems(userId: string): Promise<SavedItemsByType> {
  const grouped: SavedItemsByType = { event: [], venue: [], artist: [] };

  try {
    const result = await query<SavedItemRow>(
      `
        select id, item_type, item_key, label, event_id, created_at
        from public.saved_items
        where user_id = $1
        order by created_at desc
      `,
      [toDatabaseUserId(userId)]
    );

    for (const row of result.rows) {
      const item = mapRow(row);
      if (isSavedItemType(item.itemType)) {
        grouped[item.itemType].push(item);
      }
    }
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }
  }

  return grouped;
}

/**
 * Lightweight set of saved keys for hydrating "is saved" state on the board in one cheap query.
 * Degrades to an empty set if the table is absent or the id is unusable.
 */
export async function getSavedKeys(userId: string): Promise<SavedKey[]> {
  try {
    const result = await query<{ item_type: string; item_key: string }>(
      `
        select item_type, item_key
        from public.saved_items
        where user_id = $1
      `,
      [toDatabaseUserId(userId)]
    );

    return result.rows
      .filter((row) => isSavedItemType(row.item_type))
      .map((row) => ({ itemType: row.item_type as SavedItemType, itemKey: row.item_key }));
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

function mapRow(row: SavedItemRow): SavedItem {
  return {
    id: row.id,
    itemType: row.item_type as SavedItemType,
    itemKey: row.item_key,
    label: row.label,
    eventId: row.event_id,
    createdAt: toIsoString(row.created_at),
  };
}

function toDatabaseUserId(userId: string) {
  const parsed = Number(userId);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid user id.");
  }

  return parsed;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}
