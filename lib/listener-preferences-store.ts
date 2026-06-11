import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import {
  DEFAULT_LISTENER_DISCOVERY_PREFERENCES,
  normalizeListenerPreferences,
  serializeListenerPreferences,
  type ListenerDiscoveryPreferences,
} from "@/lib/listener-preferences";

type ListenerPreferenceRow = {
  custom_signals: unknown;
  updated_at: Date | string;
  weights: unknown;
};

export async function getListenerDiscoveryPreferences(
  userId: string
): Promise<ListenerDiscoveryPreferences> {
  try {
    const result = await query<ListenerPreferenceRow>(
      `
        select weights, custom_signals, updated_at
        from public.listener_discovery_preferences
        where user_id = $1
        limit 1
      `,
      [toDatabaseUserId(userId)]
    );
    const row = result.rows[0];

    if (!row) {
      return DEFAULT_LISTENER_DISCOVERY_PREFERENCES;
    }

    return normalizeListenerPreferences(
      {
        customSignals: row.custom_signals,
        weights: row.weights,
      },
      toIsoString(row.updated_at)
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      return DEFAULT_LISTENER_DISCOVERY_PREFERENCES;
    }
    throw error;
  }
}

export async function saveListenerDiscoveryPreferences(
  userId: string,
  preferences: unknown
): Promise<ListenerDiscoveryPreferences> {
  const normalized = normalizeListenerPreferences(preferences);
  const payload = serializeListenerPreferences(normalized);

  try {
    const result = await query<ListenerPreferenceRow>(
      `
        insert into public.listener_discovery_preferences (
          id,
          user_id,
          weights,
          custom_signals
        )
        values ($1, $2, $3::jsonb, $4::jsonb)
        on conflict (user_id) do update
          set weights = excluded.weights,
            custom_signals = excluded.custom_signals,
            updated_at = now()
        returning weights, custom_signals, updated_at
      `,
      [
        randomUUID(),
        toDatabaseUserId(userId),
        JSON.stringify(payload.weights),
        JSON.stringify(payload.customSignals),
      ]
    );
    const row = result.rows[0];

    return normalizeListenerPreferences(
      {
        customSignals: row?.custom_signals ?? payload.customSignals,
        weights: row?.weights ?? payload.weights,
      },
      row?.updated_at ? toIsoString(row.updated_at) : new Date().toISOString()
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new Error("Listener preferences table is not set up. Apply db/schema.sql before saving.");
    }
    throw error;
  }
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
