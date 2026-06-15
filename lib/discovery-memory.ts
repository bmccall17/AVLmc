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

export type SpotifyMatchCorrectionAction = "reject" | "replace";

export type SpotifyMatchCorrection = {
  action: SpotifyMatchCorrectionAction;
  eventId: string;
  matchedTerm: string;
  normalizedTerm: string;
  replacementImageUrl: string | null;
  replacementName: string | null;
  replacementProviderItemId: string | null;
  replacementUrl: string | null;
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

type SpotifyMatchCorrectionRow = {
  action: SpotifyMatchCorrectionAction;
  event_id: string;
  matched_term: string;
  normalized_term: string;
  replacement_image_url: string | null;
  replacement_name: string | null;
  replacement_provider_item_id: string | null;
  replacement_url: string | null;
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

export async function listSpotifyMatchCorrections(
  eventIds: string[],
  identity: DiscoveryIdentityInput
): Promise<SpotifyMatchCorrection[]> {
  const uniqueEventIds = Array.from(new Set(eventIds));
  const identityKeys = getIdentityKeys(identity);

  if (uniqueEventIds.length === 0 || identityKeys.length === 0) {
    return [];
  }

  try {
    const result = await query<SpotifyMatchCorrectionRow>(
      `
        select
          event_id,
          matched_term,
          normalized_term,
          action,
          replacement_provider_item_id,
          replacement_name,
          replacement_url,
          replacement_image_url
        from public.spotify_event_match_corrections
        where event_id = any($1::text[])
          and identity_key = any($2::text[])
          and provider = 'spotify'
        order by updated_at desc
      `,
      [uniqueEventIds, identityKeys]
    );

    return result.rows.map(mapSpotifyMatchCorrectionRow);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

export async function recordSpotifyMatchCorrection(input: DiscoveryIdentityInput & {
  action: SpotifyMatchCorrectionAction;
  event: EventRecord;
  matchedTerm: string;
  normalizedTerm: string;
  replacementImageUrl?: string | null;
  replacementName?: string | null;
  replacementProviderItemId?: string | null;
  replacementUrl?: string | null;
}) {
  const identityKey = getWriteIdentityKey(input);

  if (!identityKey) {
    return null;
  }

  try {
    await query(
      `
        insert into public.spotify_event_match_corrections (
          id,
          event_id,
          event_title,
          provider,
          matched_term,
          normalized_term,
          action,
          replacement_provider_item_id,
          replacement_name,
          replacement_url,
          replacement_image_url,
          session_id,
          user_id,
          identity_key
        )
        values ($1, $2, $3, 'spotify', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        on conflict (event_id, identity_key, provider, normalized_term) do update
          set event_title = excluded.event_title,
            matched_term = excluded.matched_term,
            action = excluded.action,
            replacement_provider_item_id = excluded.replacement_provider_item_id,
            replacement_name = excluded.replacement_name,
            replacement_url = excluded.replacement_url,
            replacement_image_url = excluded.replacement_image_url,
            session_id = excluded.session_id,
            user_id = excluded.user_id,
            updated_at = now()
      `,
      [
        randomUUID(),
        input.event.id,
        input.event.eventTitle,
        input.matchedTerm,
        input.normalizedTerm,
        input.action,
        input.action === "replace" ? input.replacementProviderItemId ?? null : null,
        input.action === "replace" ? input.replacementName ?? null : null,
        input.action === "replace" ? input.replacementUrl ?? null : null,
        input.action === "replace" ? input.replacementImageUrl ?? null : null,
        input.sessionId ?? "",
        toNullableUserId(input.userId),
        identityKey,
      ]
    );

    return {
      action: input.action,
      eventId: input.event.id,
      matchedTerm: input.matchedTerm,
      normalizedTerm: input.normalizedTerm,
      replacementImageUrl: input.action === "replace" ? input.replacementImageUrl ?? null : null,
      replacementName: input.action === "replace" ? input.replacementName ?? null : null,
      replacementProviderItemId: input.action === "replace" ? input.replacementProviderItemId ?? null : null,
      replacementUrl: input.action === "replace" ? input.replacementUrl ?? null : null,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

export async function recordDiscoveryEventAction(input: DiscoveryActionInput) {
  const writeIdentityKey = getWriteIdentityKey(input);

  if (!writeIdentityKey) {
    return null;
  }

  // Step 1: Log the interaction event (best-effort, swallow missing-table errors).
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
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }
    // Interaction log table missing — continue so state write can still attempt.
  }

  // Step 2: Write the durable person-event state (must succeed for state actions).
  if (STATE_ACTIONS.has(input.action)) {
    // Let errors propagate — the caller must know if the state write failed.
    await writePersonEventState(input);
  }

  // Step 3: Read back the persisted state.
  try {
    const states = await listDiscoveryStates([input.event.id], input);
    return states[input.event.id] ?? emptyDiscoveryState(input.event.id);
  } catch (error) {
    if (isMissingRelationError(error)) {
      // State table missing for read-back — if this was a state action the write
      // above would have already thrown, so we only reach here for non-state actions.
      return emptyDiscoveryState(input.event.id);
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

function mapSpotifyMatchCorrectionRow(row: SpotifyMatchCorrectionRow): SpotifyMatchCorrection {
  return {
    action: row.action,
    eventId: row.event_id,
    matchedTerm: row.matched_term,
    normalizedTerm: row.normalized_term,
    replacementImageUrl: row.replacement_image_url,
    replacementName: row.replacement_name,
    replacementProviderItemId: row.replacement_provider_item_id,
    replacementUrl: row.replacement_url,
  };
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
