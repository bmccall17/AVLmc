import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import type { EventRecord } from "@/lib/events";

export type DiscoveryEventAction =
  | "impression"
  | "detail_open"
  | "avlgo_click"
  | "fire"
  | "planning"
  | "remove"
  | "unremove"
  | "song_contribution"
  | "note_contribution";

export type DiscoveryPersonEventState = {
  eventId: string;
  fire: boolean;
  fireAt: string | null;
  planning: boolean;
  planningAt: string | null;
  removed: boolean;
  removedAt: string | null;
};

export type DiscoveryStateByEvent = Record<string, DiscoveryPersonEventState | undefined>;

export type DiscoveryPreferenceSignal = {
  action: DiscoveryEventAction;
  artistName: string;
  eventId: string;
  eventTitle: string;
  tags: string[];
  venueName: string;
};

type DiscoveryIdentityInput = {
  sessionId?: string | null;
  userId?: string | null;
};

type DiscoveryActionInput = DiscoveryIdentityInput & {
  action: DiscoveryEventAction;
  event: EventRecord;
  source?: string | null;
};

type StateRow = {
  event_id: string;
  fire_at: Date | string | null;
  planning_at: Date | string | null;
  removed_at: Date | string | null;
};

type PreferenceSignalRow = {
  action: DiscoveryEventAction;
  artist_name: string | null;
  event_id: string;
  event_title: string;
  tags: string[] | null;
  venue_name: string | null;
};

const STATE_ACTIONS = new Set<DiscoveryEventAction>(["fire", "planning", "remove", "unremove"]);

export async function listDiscoveryStates(
  eventIds: string[],
  identity: DiscoveryIdentityInput
): Promise<DiscoveryStateByEvent> {
  const uniqueEventIds = Array.from(new Set(eventIds));
  const identityKeys = getIdentityKeys(identity);

  if (uniqueEventIds.length === 0 || identityKeys.length === 0) {
    return {};
  }

  try {
    const result = await query<StateRow>(
      `
        select event_id, fire_at, planning_at, removed_at
        from public.event_person_event_state
        where event_id = any($1::text[])
          and identity_key = any($2::text[])
      `,
      [uniqueEventIds, identityKeys]
    );

    return mergeStateRows(result.rows);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {};
    }
    throw error;
  }
}

export async function listDiscoveryPreferenceSignals(
  identity: DiscoveryIdentityInput
): Promise<DiscoveryPreferenceSignal[]> {
  const identityKeys = getIdentityKeys(identity);

  if (identityKeys.length === 0) {
    return [];
  }

  try {
    const result = await query<PreferenceSignalRow>(
      `
        select action, event_id, event_title, artist_name, venue_name, tags
        from public.event_interaction_events
        where identity_key = any($1::text[])
          and action in (
            'detail_open',
            'avlgo_click',
            'fire',
            'planning',
            'remove',
            'song_contribution',
            'note_contribution'
          )
        order by created_at desc
        limit 240
      `,
      [identityKeys]
    );

    return result.rows.map((row) => ({
      action: row.action,
      artistName: row.artist_name ?? "",
      eventId: row.event_id,
      eventTitle: row.event_title,
      tags: row.tags ?? [],
      venueName: row.venue_name ?? "",
    }));
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

export async function recordDiscoveryEventAction(input: DiscoveryActionInput) {
  const writeIdentityKey = getWriteIdentityKey(input);

  if (!writeIdentityKey) {
    return null;
  }

  try {
    await query(
      `
        insert into public.event_interaction_events (
          id,
          event_id,
          event_title,
          artist_name,
          venue_name,
          event_date,
          event_time,
          tags,
          action,
          source,
          session_id,
          user_id,
          identity_key
        )
        values ($1, $2, $3, $4, $5, $6::date, $7, $8::text[], $9, $10, $11, $12, $13)
      `,
      [
        randomUUID(),
        input.event.id,
        input.event.eventTitle,
        input.event.artistName,
        input.event.venueName,
        input.event.eventDate,
        input.event.eventTime,
        input.event.tags,
        input.action,
        input.source ?? null,
        input.sessionId ?? "",
        toNullableUserId(input.userId),
        writeIdentityKey,
      ]
    );

    if (STATE_ACTIONS.has(input.action)) {
      await writePersonEventState(input);
    }

    const states = await listDiscoveryStates([input.event.id], input);
    return states[input.event.id] ?? emptyDiscoveryState(input.event.id);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

export function emptyDiscoveryState(eventId: string): DiscoveryPersonEventState {
  return {
    eventId,
    fire: false,
    fireAt: null,
    planning: false,
    planningAt: null,
    removed: false,
    removedAt: null,
  };
}

async function writePersonEventState(input: DiscoveryActionInput) {
  const identityKeys = getIdentityKeys(input);

  if (identityKeys.length === 0) {
    return;
  }

  if (input.action === "unremove") {
    await query(
      `
        update public.event_person_event_state
        set removed_at = null,
          event_title = $3,
          session_id = $4,
          user_id = $5,
          updated_at = now()
        where event_id = $1
          and identity_key = any($2::text[])
      `,
      [
        input.event.id,
        identityKeys,
        input.event.eventTitle,
        input.sessionId ?? "",
        toNullableUserId(input.userId),
      ]
    );
    return;
  }

  await Promise.all(
    identityKeys.map((identityKey) =>
      query(
        `
          insert into public.event_person_event_state (
            id,
            event_id,
            event_title,
            session_id,
            user_id,
            identity_key,
            fire_at,
            planning_at,
            removed_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (event_id, identity_key) do update
            set event_title = excluded.event_title,
              session_id = excluded.session_id,
              user_id = excluded.user_id,
              fire_at = coalesce(excluded.fire_at, public.event_person_event_state.fire_at),
              planning_at = coalesce(excluded.planning_at, public.event_person_event_state.planning_at),
              removed_at = coalesce(excluded.removed_at, public.event_person_event_state.removed_at),
              updated_at = now()
        `,
        [
          randomUUID(),
          input.event.id,
          input.event.eventTitle,
          input.sessionId ?? "",
          toNullableUserId(input.userId),
          identityKey,
          input.action === "fire" ? new Date().toISOString() : null,
          input.action === "planning" ? new Date().toISOString() : null,
          input.action === "remove" ? new Date().toISOString() : null,
        ]
      )
    )
  );
}

function mergeStateRows(rows: StateRow[]) {
  const states: DiscoveryStateByEvent = {};

  for (const row of rows) {
    const existing = states[row.event_id] ?? emptyDiscoveryState(row.event_id);
    const fireAt = latestIso(existing.fireAt, row.fire_at);
    const planningAt = latestIso(existing.planningAt, row.planning_at);
    const removedAt = latestIso(existing.removedAt, row.removed_at);

    states[row.event_id] = {
      eventId: row.event_id,
      fire: Boolean(fireAt),
      fireAt,
      planning: Boolean(planningAt),
      planningAt,
      removed: Boolean(removedAt),
      removedAt,
    };
  }

  return states;
}

function getIdentityKeys(identity: DiscoveryIdentityInput) {
  return Array.from(
    new Set(
      [
        identity.userId ? `user:${identity.userId}` : null,
        identity.sessionId ? `session:${identity.sessionId}` : null,
      ].filter((value): value is string => Boolean(value))
    )
  );
}

function getWriteIdentityKey(identity: DiscoveryIdentityInput) {
  if (identity.userId) {
    return `user:${identity.userId}`;
  }
  if (identity.sessionId) {
    return `session:${identity.sessionId}`;
  }
  return null;
}

function latestIso(left: string | null, right: Date | string | null) {
  const rightIso = toIsoStringOrNull(right);

  if (!left) {
    return rightIso;
  }
  if (!rightIso) {
    return left;
  }

  return new Date(rightIso).getTime() > new Date(left).getTime() ? rightIso : left;
}

function toIsoStringOrNull(value: Date | string | null) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableUserId(userId: string | null | undefined) {
  if (!userId) {
    return null;
  }

  const parsed = Number(userId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}
