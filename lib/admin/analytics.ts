import "server-only";
import { query } from "@/lib/db";

/**
 * Product Analytics & Usage Visibility (PRD 11 / C6, Outcome 7).
 *
 * Joins Umami web analytics (traffic, top pages, referrers — read server-side via the Umami Cloud
 * API) with the app's own first-party `event_interaction_events` funnel and conversion signals, so
 * product decisions rest on real usage. Degrades gracefully: the first-party half always renders
 * from our DB; the Umami half shows a clear "not configured / unavailable" state if the API key is
 * absent or the call fails. The Umami API key is server-only and never reaches the client.
 */

export type AnalyticsRange = "24h" | "7d" | "30d";

export const ANALYTICS_RANGES: AnalyticsRange[] = ["24h", "7d", "30d"];

// Umami Cloud Hobby free tier event ceiling (per month) — see roadmap scaling milestones.
const UMAMI_FREE_TIER_EVENTS = 100_000;
const CACHE_TTL_MS = 60_000;
const UMAMI_TIMEOUT_MS = 4000;

export type AnalyticsMetric = { label: string; value: number };

export type AnalyticsTraffic = {
  visitors: number;
  visits: number;
  pageviews: number;
  visitorsPrev: number | null;
  pageviewsPrev: number | null;
  bounceRate: number | null;
};

export type AnalyticsFunnelStep = { label: string; source: "umami" | "first-party"; value: number };

export type SystemAnalytics = {
  generatedAt: string;
  range: AnalyticsRange;
  umamiConfigured: boolean;
  umamiAvailable: boolean;
  umamiMessage: string | null;
  traffic: AnalyticsTraffic | null;
  topPages: AnalyticsMetric[];
  referrers: AnalyticsMetric[];
  funnel: AnalyticsFunnelStep[];
  conversions: AnalyticsMetric[];
  scaling: { monthlyEvents: number; ceiling: number; pctOfCeiling: number };
};

const cache = new Map<AnalyticsRange, { at: number; value: SystemAnalytics }>();

export async function loadAnalytics(range: AnalyticsRange = "7d", force = false): Promise<SystemAnalytics> {
  const cached = cache.get(range);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const { startAt, endAt } = rangeWindow(range);

  const [firstParty, conversions, monthlyEvents, umami] = await Promise.all([
    loadFirstPartyFunnel(startAt),
    loadConversions(startAt),
    loadMonthlyEventVolume(),
    loadUmami(startAt, endAt),
  ]);

  const funnel: AnalyticsFunnelStep[] = [];
  if (umami.detailPageviews !== null) {
    funnel.push({ label: "Event detail pageviews", source: "umami", value: umami.detailPageviews });
  }
  funnel.push(
    { label: "Detail opens", source: "first-party", value: firstParty.get("detail_open") ?? 0 },
    { label: "AVLgo clicks", source: "first-party", value: firstParty.get("avlgo_click") ?? 0 },
    { label: "Fire", source: "first-party", value: firstParty.get("fire") ?? 0 },
    { label: "Planning", source: "first-party", value: firstParty.get("planning") ?? 0 }
  );

  const value: SystemAnalytics = {
    generatedAt: new Date().toISOString(),
    range,
    umamiConfigured: umami.configured,
    umamiAvailable: umami.available,
    umamiMessage: umami.message,
    traffic: umami.traffic,
    topPages: umami.topPages,
    referrers: umami.referrers,
    funnel,
    conversions,
    scaling: {
      monthlyEvents,
      ceiling: UMAMI_FREE_TIER_EVENTS,
      pctOfCeiling: Math.round((monthlyEvents / UMAMI_FREE_TIER_EVENTS) * 100),
    },
  };

  cache.set(range, { at: Date.now(), value });
  return value;
}

/* ------------------------------------------------------------------ */
/*  First-party (always available)                                     */
/* ------------------------------------------------------------------ */

async function loadFirstPartyFunnel(startAt: number): Promise<Map<string, number>> {
  try {
    const result = await query<{ action: string; count: number }>(
      `
        select action, count(*)::int as count
        from public.event_interaction_events
        where created_at >= to_timestamp($1)
        group by action
      `,
      [Math.floor(startAt / 1000)]
    );
    const map = new Map<string, number>();
    for (const row of result.rows) map.set(row.action, Number(row.count));
    return map;
  } catch {
    return new Map();
  }
}

async function loadConversions(startAt: number): Promise<AnalyticsMetric[]> {
  const sinceSeconds = Math.floor(startAt / 1000);
  const [contributions, reactions, intents] = await Promise.all([
    safeCount(
      "select count(*)::int as count from public.contributions where created_at >= to_timestamp($1)",
      sinceSeconds
    ),
    safeCount(
      "select count(*)::int as count from public.reactions where created_at >= to_timestamp($1)",
      sinceSeconds
    ),
    safeCount(
      "select count(*)::int as count from public.event_intents where created_at >= to_timestamp($1)",
      sinceSeconds
    ),
  ]);
  return [
    { label: "Contributions", value: contributions },
    { label: "Reactions", value: reactions },
    { label: "Going / ticket intents", value: intents },
  ];
}

async function loadMonthlyEventVolume(): Promise<number> {
  return safeCount(
    "select count(*)::int as count from public.event_interaction_events where created_at >= now() - interval '30 days'"
  );
}

async function safeCount(sql: string, param?: number): Promise<number> {
  try {
    const result = await query<{ count: number }>(sql, param === undefined ? undefined : [param]);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Umami Cloud API (optional, graceful)                               */
/* ------------------------------------------------------------------ */

type UmamiResult = {
  configured: boolean;
  available: boolean;
  message: string | null;
  traffic: AnalyticsTraffic | null;
  topPages: AnalyticsMetric[];
  referrers: AnalyticsMetric[];
  detailPageviews: number | null;
};

async function loadUmami(startAt: number, endAt: number): Promise<UmamiResult> {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const apiKey = process.env.UMAMI_API_KEY;
  const baseUrl = (process.env.UMAMI_API_URL ?? "https://api.umami.is").replace(/\/$/, "");

  const empty: UmamiResult = {
    configured: false,
    available: false,
    message: null,
    traffic: null,
    topPages: [],
    referrers: [],
    detailPageviews: null,
  };

  if (!websiteId || !apiKey) {
    return {
      ...empty,
      message: !websiteId
        ? "Umami website id not set (NEXT_PUBLIC_UMAMI_WEBSITE_ID)."
        : "Umami API access not configured — set UMAMI_API_KEY (server-only) to read web traffic into the portal.",
    };
  }

  try {
    const headers = { "x-umami-api-key": apiKey, accept: "application/json" };
    const qs = `startAt=${startAt}&endAt=${endAt}`;

    const [statsRes, urlRes, referrerRes] = await Promise.all([
      umamiFetch(`${baseUrl}/v1/websites/${websiteId}/stats?${qs}`, headers),
      umamiFetch(`${baseUrl}/v1/websites/${websiteId}/metrics?type=url&${qs}&limit=8`, headers),
      umamiFetch(`${baseUrl}/v1/websites/${websiteId}/metrics?type=referrer&${qs}&limit=8`, headers),
    ]);

    if (!statsRes) {
      return { ...empty, configured: true, message: "Umami API unreachable or returned an error." };
    }

    const traffic: AnalyticsTraffic = {
      visitors: statValue(statsRes, "visitors"),
      visits: statValue(statsRes, "visits"),
      pageviews: statValue(statsRes, "pageviews"),
      visitorsPrev: statPrev(statsRes, "visitors"),
      pageviewsPrev: statPrev(statsRes, "pageviews"),
      bounceRate: bounceRate(statsRes),
    };

    const topPages = toMetrics(urlRes);
    const referrers = toMetrics(referrerRes);
    const detailPageviews = topPages
      .filter((page) => /\/event\//.test(page.label))
      .reduce((sum, page) => sum + page.value, 0);

    return {
      configured: true,
      available: true,
      message: null,
      traffic,
      topPages,
      referrers,
      detailPageviews: detailPageviews || null,
    };
  } catch {
    return { ...empty, configured: true, message: "Umami API request failed; showing first-party data only." };
  }
}

async function umamiFetch(url: string, headers: Record<string, string>): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UMAMI_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Umami stats fields are either `{ value, prev }` objects or plain numbers depending on version. */
function statValue(stats: unknown, key: string): number {
  const field = (stats as Record<string, unknown>)?.[key];
  if (typeof field === "number") return field;
  if (field && typeof field === "object" && typeof (field as { value?: unknown }).value === "number") {
    return (field as { value: number }).value;
  }
  return 0;
}

function statPrev(stats: unknown, key: string): number | null {
  const field = (stats as Record<string, unknown>)?.[key];
  if (field && typeof field === "object" && typeof (field as { prev?: unknown }).prev === "number") {
    return (field as { prev: number }).prev;
  }
  return null;
}

function bounceRate(stats: unknown): number | null {
  const bounces = statValue(stats, "bounces");
  const visits = statValue(stats, "visits");
  if (visits <= 0) return null;
  return Math.round((bounces / visits) * 100);
}

function toMetrics(raw: unknown): AnalyticsMetric[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const label = typeof (row as { x?: unknown }).x === "string" ? (row as { x: string }).x : null;
      const value = Number((row as { y?: unknown }).y ?? 0);
      return label ? { label: label || "(direct)", value } : null;
    })
    .filter((metric): metric is AnalyticsMetric => metric !== null);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rangeWindow(range: AnalyticsRange): { startAt: number; endAt: number } {
  const endAt = Date.now();
  const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
  return { startAt: endAt - days * 24 * 60 * 60 * 1000, endAt };
}

export function parseRange(value: string | null | undefined): AnalyticsRange {
  return value === "24h" || value === "7d" || value === "30d" ? value : "7d";
}
