export const LISTENER_PREFERENCE_STORAGE_KEY = "avlmc:listener-preferences:v1";
export const LISTENER_PREFERENCE_CHANGE_EVENT = "avlmc:listener-preferences-change";

export type ListenerPreferenceKey =
  | "artistAffinity"
  | "genreMatch"
  | "venuePreference"
  | "dateAvailability"
  | "socialHeat"
  | "localRelevance"
  | "novelty"
  | "freePaidPreference"
  | "outdoorIndoorPreference";

export type ListenerPreferenceWeights = Record<ListenerPreferenceKey, number>;
export type ListenerCustomSignalKind = "artist" | "venue" | "tag" | "keyword";
export type ListenerCustomSignalDirection = "boost" | "lower";

export type ListenerCustomSignal = {
  direction: ListenerCustomSignalDirection;
  id: string;
  kind: ListenerCustomSignalKind;
  label: string;
  weight: number;
};

export type ListenerDiscoveryPreferences = {
  customSignals: ListenerCustomSignal[];
  /**
   * Social / Curator Graph activity-sharing opt-in (PRD 23 / C1). Off by default. When false the
   * listener is absent from every "your people" read in later cycles; the public community counts
   * everyone already sees are unaffected. This is the single consent gate the graph checks.
   */
  shareActivity: boolean;
  updatedAt: string | null;
  weights: ListenerPreferenceWeights;
};

export type ListenerPreferenceControl = {
  description: string;
  key: ListenerPreferenceKey;
  label: string;
};

const PREFERENCE_KEYS: ListenerPreferenceKey[] = [
  "artistAffinity",
  "genreMatch",
  "venuePreference",
  "dateAvailability",
  "socialHeat",
  "localRelevance",
  "novelty",
  "freePaidPreference",
  "outdoorIndoorPreference",
];

export const LISTENER_PREFERENCE_CONTROLS: ListenerPreferenceControl[] = [
  {
    description: "How much synced Spotify artists and custom artist boosts should lift a show.",
    key: "artistAffinity",
    label: "Artist affinity",
  },
  {
    description: "How much event tags, styles, and genre words should matter.",
    key: "genreMatch",
    label: "Genre match",
  },
  {
    description: "How much familiar or preferred venues should shape the list.",
    key: "venuePreference",
    label: "Venue preference",
  },
  {
    description: "How strongly soon and weekend timing should matter.",
    key: "dateAvailability",
    label: "Date availability",
  },
  {
    description: "How much planning, fire, songs, notes, and voice activity should lift a show.",
    key: "socialHeat",
    label: "Social heat",
  },
  {
    description: "How much local context and Asheville-specific signals should matter.",
    key: "localRelevance",
    label: "Local relevance",
  },
  {
    description: "How much quieter, less obvious listings should get a chance.",
    key: "novelty",
    label: "Novelty",
  },
  {
    description: "How much free, no-cover, or paid-ticket wording should matter.",
    key: "freePaidPreference",
    label: "Free/paid preference",
  },
  {
    description: "How much patio, outdoor, indoor, or room-setting wording should matter.",
    key: "outdoorIndoorPreference",
    label: "Outdoor/indoor preference",
  },
];

export const DEFAULT_LISTENER_WEIGHTS: ListenerPreferenceWeights = {
  artistAffinity: 100,
  genreMatch: 100,
  venuePreference: 100,
  dateAvailability: 100,
  socialHeat: 100,
  localRelevance: 100,
  novelty: 100,
  freePaidPreference: 100,
  outdoorIndoorPreference: 100,
};

export const DEFAULT_LISTENER_DISCOVERY_PREFERENCES: ListenerDiscoveryPreferences = {
  customSignals: [],
  shareActivity: false,
  updatedAt: null,
  weights: DEFAULT_LISTENER_WEIGHTS,
};

export function normalizeListenerPreferences(
  value: unknown,
  updatedAt: string | null = null
): ListenerDiscoveryPreferences {
  const input = isRecord(value) ? value : {};
  const inputWeights = isRecord(input.weights) ? input.weights : input;

  return {
    customSignals: normalizeCustomSignals(input.customSignals),
    shareActivity: input.shareActivity === true,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : updatedAt,
    weights: normalizeWeights(inputWeights),
  };
}

export function serializeListenerPreferences(preferences: ListenerDiscoveryPreferences) {
  const normalized = normalizeListenerPreferences(preferences, preferences.updatedAt);

  return {
    customSignals: normalized.customSignals,
    shareActivity: normalized.shareActivity,
    weights: normalized.weights,
  };
}

export function isListenerPreferenceKey(value: string): value is ListenerPreferenceKey {
  return PREFERENCE_KEYS.includes(value as ListenerPreferenceKey);
}

function normalizeWeights(value: Record<string, unknown>) {
  return PREFERENCE_KEYS.reduce<ListenerPreferenceWeights>((weights, key) => {
    weights[key] = clampNumber(value[key], DEFAULT_LISTENER_WEIGHTS[key], 0, 200);
    return weights;
  }, { ...DEFAULT_LISTENER_WEIGHTS });
}

function normalizeCustomSignals(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((signal, index): ListenerCustomSignal[] => {
    if (!isRecord(signal)) {
      return [];
    }

    const label = typeof signal.label === "string" ? signal.label.trim().slice(0, 80) : "";
    const kind = signal.kind;
    const direction = signal.direction;

    if (
      !label ||
      !["artist", "venue", "tag", "keyword"].includes(String(kind)) ||
      !["boost", "lower"].includes(String(direction))
    ) {
      return [];
    }

    return [
      {
        direction: direction as ListenerCustomSignalDirection,
        id:
          typeof signal.id === "string" && signal.id.trim()
            ? signal.id.trim().slice(0, 80)
            : `signal-${index}`,
        kind: kind as ListenerCustomSignalKind,
        label,
        weight: clampNumber(signal.weight, 24, 1, 80),
      },
    ];
  }).slice(0, 24);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
