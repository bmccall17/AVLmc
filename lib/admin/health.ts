import "server-only";
import { query } from "@/lib/db";
import { getAuthFeatureFlags, isEnabled } from "@/lib/auth-flags";
import { getAvlgoFeedSource, getDateWindow, isUsingCustomAvlgoFeed } from "@/lib/events";
import { getRecentJobRuns, type JobName, type JobRun } from "@/lib/admin/job-runs";

/**
 * System health & connection visibility (PRD 07 / C2, Outcome 4).
 *
 * Live, time-boxed, individually-failing probes for every critical dependency, plus staleness and
 * configuration-conflict detection. Each probe maps (where applicable) to a System Registry node
 * via its `id` === the node's `healthProbeId`, so the architecture graph can show status in
 * context. Results are briefly cached so refreshes don't hammer providers.
 *
 * Security: probes report configuration variable NAMES only — never env values, OAuth tokens, or
 * secrets. The Spotify probe reads connection/expiry METADATA only, never token columns.
 */

export type HealthStatus =
  | "ok"
  | "degraded"
  | "down"
  | "stale"
  | "misconfigured"
  | "not_configured"
  | "unknown";

export type HealthSeverity = "ok" | "info" | "warning" | "critical";

export type HealthProbe = {
  /** Matches the System Registry node's `healthProbeId` where one exists. */
  id: string;
  label: string;
  status: HealthStatus;
  severity: HealthSeverity;
  detail: string;
  checkedAt: string;
  latencyMs?: number;
  /** Short hint on what to do when this needs attention. */
  remediation?: string;
  /** Recent scheduled-job runs, for the cron probes. */
  runs?: JobRun[];
  /** Configured cron schedule (cron expression), for the cron probes. */
  schedule?: string;
};

export type SystemHealth = {
  generatedAt: string;
  probes: HealthProbe[];
  /** Probes needing attention (warning/critical), most severe first. */
  attention: HealthProbe[];
  okCount: number;
};

const CACHE_TTL_MS = 20_000;
let cache: { at: number; value: SystemHealth } | null = null;

const SEVERITY_RANK: Record<HealthSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  ok: 3,
};

/** Cron schedules mirrored from vercel.json so "scheduled but not running" is detectable. */
const CRON_SCHEDULES: Record<JobName, string> = {
  avlgo_sync: "0 10 * * *",
  cleanup: "0 11 * * *",
  image_backfill: "manual",
  artist_match: "manual",
};

export async function loadSystemHealth(force = false): Promise<SystemHealth> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const probes = await runAllProbes();
  const attention = probes
    .filter((probe) => probe.severity === "warning" || probe.severity === "critical")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const value: SystemHealth = {
    generatedAt: new Date().toISOString(),
    probes,
    attention,
    okCount: probes.filter((probe) => probe.severity === "ok").length,
  };

  cache = { at: Date.now(), value };
  return value;
}

/** A compact id→status map for overlaying health badges on the architecture graph. */
export function healthByProbeId(
  health: SystemHealth
): Record<string, { status: HealthStatus; severity: HealthSeverity }> {
  const map: Record<string, { status: HealthStatus; severity: HealthSeverity }> = {};
  for (const probe of health.probes) {
    map[probe.id] = { status: probe.status, severity: probe.severity };
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Probe runner                                                       */
/* ------------------------------------------------------------------ */

async function runAllProbes(): Promise<HealthProbe[]> {
  const probeFns: Array<() => Promise<HealthProbe>> = [
    probeDatabase,
    probeEventData,
    probeAvlgoFeed,
    probeAuthProvider,
    probeSpotify,
    () => probeCron("avlgo_sync", "cron-avlgo-sync", "AVLgo Sync job"),
    () => probeCron("cleanup", "cron-cleanup", "Image Cleanup job"),
    probeBlob,
    probeUmami,
  ];

  const settled = await Promise.allSettled(probeFns.map((fn) => fn()));
  return settled.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // A probe threw despite its own guards — surface it instead of breaking the page.
    return {
      id: `probe-${index}`,
      label: "Health probe",
      status: "unknown",
      severity: "warning",
      detail: "Probe failed unexpectedly.",
      checkedAt: new Date().toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Individual probes                                                  */
/* ------------------------------------------------------------------ */

async function probeDatabase(): Promise<HealthProbe> {
  const start = Date.now();
  try {
    // Generous timeout: this `select 1` shares the app's single-connection pool with every other
    // loader on the admin page, so its measured latency includes queue-wait, not just DB round-trip.
    await withTimeout(query("select 1 as ok"), 9000, "db");
    const latencyMs = Date.now() - start;
    // Reachable is reachable — never flag "slow" purely from pool-queue time on this busy page.
    return base("database", "Database (Postgres)", {
      status: "ok",
      severity: "ok",
      detail:
        latencyMs > 3000
          ? `Connected — ${latencyMs}ms (includes connection-pool queue time while the admin page loads its data).`
          : `Connected — ${latencyMs}ms round-trip.`,
      latencyMs,
    });
  } catch (error) {
    // A timeout here means the check was starved by pool contention, NOT that the DB is down — the
    // rest of this page's data still loaded. Only a thrown connection error is a real outage.
    if (error instanceof Error && /timed out/i.test(error.message)) {
      return base("database", "Database (Postgres)", {
        status: "degraded",
        severity: "warning",
        detail:
          "Reachable, but the health check was starved by connection-pool contention while the admin page loaded (single-connection pool). The database is up — the rest of this page's data loaded from it.",
        remediation: "If persistent, raise the DB pool size or reduce concurrent admin loaders; this is contention, not an outage.",
      });
    }
    return base("database", "Database (Postgres)", {
      status: "down",
      severity: "critical",
      detail: messageFrom(error, "select 1 round-trip failed."),
      remediation: "Check DATABASE_URL and Aiven Postgres availability.",
    });
  }
}

async function probeEventData(): Promise<HealthProbe> {
  const { start, end } = getDateWindow();
  try {
    const result = await withTimeout(
      query<{ total: number; newest: Date | string | null }>(
        `
          select count(*)::int as total, max(updated_at) as newest
          from public.events
          where event_date >= $1::date and event_date <= $2::date
        `,
        [ymd(start), ymd(end)]
      ),
      8000,
      "events"
    );

    const total = Number(result.rows[0]?.total ?? 0);
    const newest = result.rows[0]?.newest ?? null;

    if (total === 0) {
      return base("event-data", "Event Data Freshness", {
        status: "stale",
        severity: "critical",
        detail: "The rolling 21-day window is EMPTY — there are no events to show.",
        remediation: "Trigger /api/sync/avlgo to ingest events.",
      });
    }

    const ageHours = newest ? hoursSince(newest) : Infinity;
    if (ageHours > 30) {
      return base("event-data", "Event Data Freshness", {
        status: "stale",
        severity: "warning",
        detail: `${total} events in window, but the newest update was ${relativeTime(newest)} — ingest may be stalled.`,
        remediation: "Check the AVLgo Sync job; run /api/sync/avlgo.",
      });
    }

    return base("event-data", "Event Data Freshness", {
      status: "ok",
      severity: "ok",
      detail: `${total} events in the window; freshest update ${relativeTime(newest)}.`,
    });
  } catch (error) {
    return base("event-data", "Event Data Freshness", {
      status: "unknown",
      severity: "info",
      detail: messageFrom(error, "Events table unavailable."),
    });
  }
}

async function probeAvlgoFeed(): Promise<HealthProbe> {
  const custom = isUsingCustomAvlgoFeed();
  const url = getAvlgoFeedSource();
  const label = "AVLgo Feed";
  const start = Date.now();
  try {
    // Reachability only — read status, then discard the body (no full ingest), time-boxed. The
    // probe bypasses the cache the daily sync uses, so it talks to the slow origin directly.
    const response = await fetchWithTimeout(url, 8000);
    const latencyMs = Date.now() - start;
    const ok = response.ok;
    const httpStatus = response.status;
    void response.body?.cancel().catch(() => {});

    if (ok) {
      return base("avlgo-feed", label, {
        status: "ok",
        severity: "ok",
        detail: `${custom ? "Custom feed" : "AVLgo export"} reachable — HTTP ${httpStatus}, ${latencyMs}ms.`,
        latencyMs,
      });
    }
    return base("avlgo-feed", label, {
      status: "degraded",
      severity: "warning",
      detail: `Feed responded HTTP ${httpStatus} (${latencyMs}ms). Seed events fall back; see Event Data Freshness for whether ingest is actually current.`,
      remediation: custom ? "Verify AVLGO_API_URL is correct." : "Usually transient on AVLgo's side.",
      latencyMs,
    });
  } catch (error) {
    // A probe timeout/abort does NOT mean the feed is down — the daily sync uses a cached fetch and
    // seed events as fallback. Event Data Freshness is the authoritative staleness signal, so keep
    // a slow probe informational and only flag an actual network failure for attention.
    const aborted = error instanceof Error && /abort|timed out/i.test(error.message);
    return base("avlgo-feed", label, {
      status: aborted ? "degraded" : "down",
      severity: aborted ? "info" : "warning",
      detail: aborted
        ? "Liveness probe didn't complete within 8s — the export endpoint is slow to a direct (uncached) request. The daily sync uses a cached fetch with seed fallback; check Event Data Freshness for whether data is actually current."
        : `Could not reach the feed host (${messageFrom(error, "network error")}). Seed events fall back; check Event Data Freshness for actual staleness.`,
      remediation: custom
        ? "Check the AVLGO_API_URL host only if Event Data Freshness is also stale."
        : "If Event Data Freshness is green, the feed is fine — this is just a slow probe.",
    });
  }
}

async function probeAuthProvider(): Promise<HealthProbe> {
  const flags = getAuthFeatureFlags();
  const label = "Auth (Auth.js)";

  if (!flags.auth) {
    return base("auth-provider", label, {
      status: "not_configured",
      severity: "info",
      detail: "Auth is disabled (NEXT_PUBLIC_AUTH_ENABLED off) — the app runs fully anonymously.",
    });
  }

  const missing: string[] = [];
  if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");

  // Auth is on but no provider is configured at all.
  const anyProvider = flags.spotify || flags.googleYouTube || flags.appleMusic;
  if (!anyProvider) {
    return base("auth-provider", label, {
      status: "misconfigured",
      severity: "warning",
      detail: "Auth is enabled but no sign-in provider is configured, so sign-in cannot complete.",
      remediation: "Enable and configure at least one provider (e.g. Spotify).",
    });
  }

  if (missing.length > 0) {
    return base("auth-provider", label, {
      status: "misconfigured",
      severity: "critical",
      detail: `Auth enabled but missing required config: ${missing.join(", ")}.`,
      remediation: `Set ${missing.join(", ")}.`,
    });
  }

  return base("auth-provider", label, {
    status: "ok",
    severity: "ok",
    detail: "Auth.js enabled with a configured secret and provider.",
  });
}

async function probeSpotify(): Promise<HealthProbe> {
  const label = "Spotify Integration";
  const enabledFlag = isEnabled(process.env.AUTH_SPOTIFY_ENABLED);
  const hasId = Boolean(process.env.AUTH_SPOTIFY_ID);
  const hasSecret = Boolean(process.env.AUTH_SPOTIFY_SECRET);

  // Configuration conflict: turned on but credentials missing (names only — never values).
  if (enabledFlag && (!hasId || !hasSecret)) {
    const missing = [!hasId ? "AUTH_SPOTIFY_ID" : null, !hasSecret ? "AUTH_SPOTIFY_SECRET" : null].filter(
      (name): name is string => Boolean(name)
    );
    return base("spotify-api", label, {
      status: "misconfigured",
      severity: "critical",
      detail: `Spotify is enabled but missing: ${missing.join(", ")}.`,
      remediation: `Set ${missing.join(", ")}.`,
    });
  }

  const flags = getAuthFeatureFlags();
  if (!flags.spotify) {
    return base("spotify-api", label, {
      status: "not_configured",
      severity: "info",
      detail: "Spotify integration is off — taste personalization and artist matching are disabled.",
    });
  }

  // 1) LIVE credential check — a real round-trip to Spotify's token endpoint, not env presence.
  //    This is the difference between "config looks set" and "sign-in can actually work".
  const cred = await checkSpotifyAppCredentials();
  if (cred.state === "rejected") {
    return base("spotify-api", label, {
      status: "down",
      severity: "critical",
      detail: cred.detail,
      remediation:
        "The client ID/secret is wrong, was rotated, or the app was revoked. Re-check them in the Spotify Developer Dashboard and update AUTH_SPOTIFY_ID / AUTH_SPOTIFY_SECRET.",
    });
  }
  if (cred.state === "unreachable") {
    return base("spotify-api", label, {
      status: "degraded",
      severity: "warning",
      detail: cred.detail,
      remediation: "Usually transient on Spotify's side; if it persists, Spotify auth is unavailable and no one can connect.",
    });
  }

  // 2) MIRROR-DRIFT + connection freshness. The gate is a hand-kept mirror of Spotify's dashboard
  //    allowlist, so its worst failure is silent: a listener who successfully authorized Spotify
  //    (therefore was on the dashboard) but has no seat row here — the gate will block them on their
  //    next sign-in while Spotify would allow them. That is the "broken again" class; surface it.
  try {
    const drift = await withTimeout(query<SpotifyDriftRow>(SPOTIFY_DRIFT_SQL), 8000, "spotify");
    const connected = Number(drift.rows[0]?.connected_users ?? 0);
    const unseated = Number(drift.rows[0]?.unseated_users ?? 0);
    const active = Number(drift.rows[0]?.active_connections ?? 0);
    const stale = Number(drift.rows[0]?.stale_connections ?? 0);

    // Open access collapses the gate — drift can't block anyone, so it isn't an issue then.
    if (!flags.spotifyOpenAccess && unseated > 0) {
      return base("spotify-api", label, {
        status: "degraded",
        severity: "warning",
        detail: `Credentials live, but ${unseated} Spotify-connected listener(s) are NOT seated in the allowlist mirror — the pre-redirect gate will block them on next sign-in even though Spotify allows them (mirror drift vs the Developer Dashboard).`,
        remediation:
          "Reconcile the mirror: seat those listeners in Admin → Spotify tester access (or set SPOTIFY_OPEN_ACCESS=true to let the dashboard be the sole gate).",
      });
    }

    if (stale > 0) {
      return base("spotify-api", label, {
        status: "stale",
        severity: "warning",
        detail: `Credentials live; ${stale} of ${active} active connection(s) have profile data older than 30 days.`,
        remediation: "Affected listeners refresh on next sign-in; no action usually required.",
      });
    }

    const seatNote = connected > 0 ? `${connected} connected listener(s), all seated in the mirror` : "no connected listeners yet";
    return base("spotify-api", label, {
      status: "ok",
      severity: "ok",
      detail: `Credentials live (client-credentials token issued); ${active} active connection(s); ${seatNote}.`,
    });
  } catch (error) {
    // Creds are proven live above; only the drift/metadata read failed. Say exactly that — don't
    // claim a blanket "Healthy" when we couldn't verify the gate mirror.
    return base("spotify-api", label, {
      status: "degraded",
      severity: "warning",
      detail: `Credentials live, but the allowlist-mirror check could not run (${messageFrom(error, "connection tables unavailable")}), so gate drift can't be verified.`,
      remediation: "Check the tester_requests / spotify_access_requests tables and the DB connection.",
    });
  }
}

type SpotifyDriftRow = {
  connected_users: number;
  unseated_users: number;
  active_connections: number;
  stale_connections: number;
};

/**
 * One query, four counts:
 *  - connected_users: distinct users who have ever authorized Spotify (an `accounts` row exists) —
 *    under Development Mode, authorizing at all means they were on the dashboard allowlist.
 *  - unseated_users: of those, how many hold NO seat in either gate mirror table (by any of their
 *    emails). These are exactly who the gate will wrongly block — the drift signal.
 *  - active_connections / stale_connections: live connection freshness, as before.
 */
const SPOTIFY_DRIFT_SQL = `
  with spotify_users as (
    select distinct a."userId" as user_id from public.accounts a where a.provider = 'spotify'
  ),
  emails as (
    select su.user_id, lower(u.email) as email
      from spotify_users su join public.users u on u.id = su.user_id
    union
    select su.user_id, lower(ue.email) as email
      from spotify_users su join public.user_emails ue on ue.user_id = su.user_id
  ),
  seated as (
    select distinct e.user_id
      from emails e
     where exists (
             select 1 from public.tester_requests tr
              where lower(tr.email) = e.email and tr.status in ('approved', 'invited')
           )
        or exists (
             select 1 from public.spotify_access_requests sar
              where (sar.user_id = e.user_id or lower(sar.spotify_email) = e.email)
                and sar.status in ('slot_added', 'approved')
           )
  )
  select
    (select count(*) from spotify_users)::int as connected_users,
    (select count(*) from spotify_users su
       where not exists (select 1 from seated s where s.user_id = su.user_id))::int as unseated_users,
    (select count(*) from public.music_connections
       where provider = 'spotify' and disconnected_at is null)::int as active_connections,
    (select count(*) from public.music_connections
       where provider = 'spotify' and disconnected_at is null
         and (last_synced_at is null or last_synced_at < now() - interval '30 days'))::int as stale_connections
`;

/**
 * Live client-credentials token fetch — proves AVLmc's Spotify app ID/secret are actually valid,
 * not merely present. HTTP 400/401 means Spotify rejected the credentials (the app is broken);
 * a network/timeout error is treated as transient/unreachable, not a credential fault. Never logs
 * or returns the token or the secret.
 */
async function checkSpotifyAppCredentials(): Promise<{
  state: "ok" | "rejected" | "unreachable";
  detail: string;
}> {
  const clientId = process.env.AUTH_SPOTIFY_ID as string;
  const clientSecret = process.env.AUTH_SPOTIFY_SECRET as string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.ok) {
      void response.body?.cancel().catch(() => {});
      return { state: "ok", detail: "Spotify issued a live client-credentials token." };
    }
    void response.body?.cancel().catch(() => {});
    return {
      state: "rejected",
      detail: `Spotify rejected the app credentials — HTTP ${response.status} from the token endpoint.`,
    };
  } catch (error) {
    const aborted = error instanceof Error && /abort|timed out/i.test(error.message);
    return {
      state: "unreachable",
      detail: aborted
        ? "Spotify's token endpoint did not respond within 6s — could not verify credentials."
        : `Could not reach Spotify's token endpoint (${messageFrom(error, "network error")}).`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeCron(job: JobName, probeId: string, label: string): Promise<HealthProbe> {
  const schedule = CRON_SCHEDULES[job];
  try {
    const runs = await getRecentJobRuns(job, 5);
    const last = runs[0];

    if (!last) {
      return base(probeId, label, {
        status: "unknown",
        severity: "info",
        detail: `No runs recorded yet (scheduled ${schedule}). Observability begins once the job next runs.`,
        schedule,
        runs,
      });
    }

    if (last.status === "failure") {
      return base(probeId, label, {
        status: "down",
        severity: "critical",
        detail: `Last run FAILED ${relativeTime(last.finishedAt)}: ${last.detail ?? "unknown error"}.`,
        remediation: "Check the cron endpoint logs; re-run manually to confirm.",
        schedule,
        runs,
      });
    }

    const overdueHours = job === "avlgo_sync" ? 26 : 26;
    const age = hoursSince(last.finishedAt);
    if (age > overdueHours) {
      return base(probeId, label, {
        status: "stale",
        severity: "warning",
        detail: `Last success ${relativeTime(last.finishedAt)} — overdue for its daily ${schedule} schedule.`,
        remediation: "Verify the Vercel cron is firing.",
        schedule,
        runs,
      });
    }

    const items = typeof last.itemsProcessed === "number" ? `, ${last.itemsProcessed} items` : "";
    return base(probeId, label, {
      status: "ok",
      severity: "ok",
      detail: `Last success ${relativeTime(last.finishedAt)}${items}.`,
      schedule,
      runs,
    });
  } catch (error) {
    return base(probeId, label, {
      status: "unknown",
      severity: "info",
      detail: messageFrom(error, "Job-run history unavailable."),
      schedule,
    });
  }
}

async function probeBlob(): Promise<HealthProbe> {
  const configured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return base("blob-storage", "Vercel Blob", {
    status: configured ? "ok" : "not_configured",
    severity: configured ? "ok" : "info",
    detail: configured
      ? "Blob storage configured — cached event images and voice memos can be stored."
      : "Blob not configured (voice memos deferred). Event images fall back to source URLs.",
  });
}

async function probeUmami(): Promise<HealthProbe> {
  const configured = Boolean(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID);
  return base("umami", "Umami Analytics", {
    status: configured ? "ok" : "not_configured",
    severity: configured ? "ok" : "info",
    detail: configured
      ? "Umami tracking script wired (NEXT_PUBLIC_UMAMI_WEBSITE_ID set). In-portal analytics arrive in PRD 11."
      : "Umami not configured — no usage analytics are being collected.",
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function base(
  id: string,
  label: string,
  rest: Omit<HealthProbe, "id" | "label" | "checkedAt">
): HealthProbe {
  return { id, label, checkedAt: new Date().toISOString(), ...rest };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    // Match the app's own feed fetch (plain GET, no custom user-agent) so a CDN/WAF doesn't treat
    // the probe differently. `no-store` keeps it a genuine liveness check, not a cached 200.
    return await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function hoursSince(value: Date | string): number {
  const then = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return (Date.now() - then) / (1000 * 60 * 60);
}

function relativeTime(value: Date | string | null): string {
  if (!value) return "never";
  const hours = hoursSince(value);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
