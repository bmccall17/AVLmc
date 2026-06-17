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
  share_activity: boolean | null;
  updated_at: Date | string;
  weights: unknown;
};

export async function getListenerDiscoveryPreferences(
  userId: string
): Promise<ListenerDiscoveryPreferences> {
  try {
    const result = await query<ListenerPreferenceRow>(
      `
        select weights, custom_signals, share_activity, updated_at
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
        shareActivity: row.share_activity === true,
        weights: row.weights,
      },
      toIsoString(row.updated_at)
    );
  } catch (error) {
    // No table yet, or the share_activity column predates PRD 23 → fall back to defaults.
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) {
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
  const dbUserId = toDatabaseUserId(userId);

  try {
    const result = await query<ListenerPreferenceRow>(
      `
        insert into public.listener_discovery_preferences (
          id,
          user_id,
          weights,
          custom_signals,
          share_activity
        )
        values ($1, $2, $3::jsonb, $4::jsonb, $5)
        on conflict (user_id) do update
          set weights = excluded.weights,
            custom_signals = excluded.custom_signals,
            share_activity = excluded.share_activity,
            updated_at = now()
        returning weights, custom_signals, share_activity, updated_at
      `,
      [
        randomUUID(),
        dbUserId,
        JSON.stringify(payload.weights),
        JSON.stringify(payload.customSignals),
        payload.shareActivity,
      ]
    );
    const row = result.rows[0];

    return normalizeListenerPreferences(
      {
        customSignals: row?.custom_signals ?? payload.customSignals,
        shareActivity: row?.share_activity ?? payload.shareActivity,
        weights: row?.weights ?? payload.weights,
      },
      row?.updated_at ? toIsoString(row.updated_at) : new Date().toISOString()
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      throw new Error("Listener preferences table is not set up. Apply db/schema.sql before saving.");
    }
    // Pre-PRD-23 database without the share_activity column: persist the rest so saving still works.
    if (isUndefinedColumnError(error)) {
      return saveWithoutShareActivity(dbUserId, payload);
    }
    throw error;
  }
}

async function saveWithoutShareActivity(
  dbUserId: number,
  payload: ReturnType<typeof serializeListenerPreferences>
): Promise<ListenerDiscoveryPreferences> {
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
    [randomUUID(), dbUserId, JSON.stringify(payload.weights), JSON.stringify(payload.customSignals)]
  );
  const row = result.rows[0];

  return normalizeListenerPreferences(
    {
      customSignals: row?.custom_signals ?? payload.customSignals,
      shareActivity: false,
      weights: row?.weights ?? payload.weights,
    },
    row?.updated_at ? toIsoString(row.updated_at) : new Date().toISOString()
  );
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
  return hasErrorCode(error, "42P01");
}

function isUndefinedColumnError(error: unknown) {
  return hasErrorCode(error, "42703");
}

function hasErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === code
  );
}
