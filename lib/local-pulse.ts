import type { EventRecord } from "@/lib/events";

export const AVLGO_TOP_30_URL = "https://www.avlgo.com/events/top30";

const TOP_30_LIMIT = 30;

type Top30Seed = {
  id: string | null;
  sourceId: string | null;
  url: string | null;
};

export async function getAvlgoTop30EventIds(events: EventRecord[]) {
  if (events.length === 0) {
    return [];
  }

  try {
    const response = await fetch(AVLGO_TOP_30_URL, {
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const top30Seeds = parseTop30Seeds(html);

    if (top30Seeds.length === 0) {
      return [];
    }

    const top30Ids = new Set(top30Seeds.flatMap((seed) => (seed.id ? [seed.id] : [])));
    const top30SourceIds = new Set(top30Seeds.flatMap((seed) => (seed.sourceId ? [seed.sourceId] : [])));
    const top30Urls = new Set(top30Seeds.flatMap((seed) => (seed.url ? [normalizeUrlKey(seed.url)] : [])));

    return events
      .filter(
        (event) =>
          top30Ids.has(event.id) ||
          top30Ids.has(event.avlgoEventId) ||
          top30SourceIds.has(event.avlgoEventId) ||
          top30Urls.has(normalizeUrlKey(event.eventUrl))
      )
      .map((event) => event.id);
  } catch {
    return [];
  }
}

function parseTop30Seeds(html: string): Top30Seed[] {
  const ids = extractFlightStrings(html, "id");
  const sourceIds = extractFlightStrings(html, "sourceId");
  const urls = extractFlightStrings(html, "url");
  const seeds: Top30Seed[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index] ?? null;
    const sourceId = sourceIds[index] ?? null;
    const url = urls[index] ?? null;
    const key = id ?? sourceId ?? url;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    seeds.push({ id, sourceId, url });

    if (seeds.length === TOP_30_LIMIT) {
      break;
    }
  }

  return seeds;
}

function extractFlightStrings(html: string, key: string) {
  const pattern = new RegExp(`\\\\\\\"${key}\\\\\\\":\\\\\\\"((?:\\\\\\\\.|[^\\\\\\\\\\\"])*)\\\\\\\"`, "g");

  return Array.from(html.matchAll(pattern), (match) => decodeFlightString(match[1]));
}

function decodeFlightString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function normalizeUrlKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.replace(/\/$/, "").toLowerCase();
  }
}
