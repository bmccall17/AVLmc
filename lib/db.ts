import "server-only";
import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;

/**
 * Is a database connection configured at all? This is deliberately narrow: it is true whenever
 * `DATABASE_URL` is set (even to a wrong/unreachable value), and false only when it is entirely
 * absent. Missing-entirely is a **local/dev** signal (prod always has it set on Vercel), so it is
 * safe to degrade reads to empty in that case — while a *set-but-unreachable* URL still throws a
 * real connection error that production Health probes must keep surfacing.
 */
export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let warnedMissingDatabase = false;

function degradedEmptyResult<Row extends QueryResultRow>(): QueryResult<Row> {
  if (!warnedMissingDatabase) {
    warnedMissingDatabase = true;
    console.warn(
      "[db] DATABASE_URL is not set — degrading DB reads to empty results so the app renders " +
        "without a database (PRD 41). Set DATABASE_URL (e.g. `vercel env pull`) for live data; " +
        "writes cannot persist in this mode."
    );
  }
  return { command: "", rowCount: 0, oid: 0, rows: [], fields: [] };
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Serverless connection hygiene: one connection per warm Lambda (`max: 1`), released quickly
  // when idle so concurrent Lambdas do not pin connection slots; `allowExitOnIdle` lets the pool
  // drop its socket between bursts, which is what allows Neon compute to autosuspend once the
  // PRD 51 read caches leave real idle windows. DATABASE_URL points at the Neon **-pooler**
  // endpoint (validated Jul 12, 2026); migrations use the direct endpoint via
  // DATABASE_URL_UNPOOLED (`npm run db:apply`) because they need a real session.
  pool ??= new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  return pool;
}

function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<Row>> {
  // Local/dev degradation (PRD 41): with no DATABASE_URL, reads resolve to an empty result instead
  // of throwing "DATABASE_URL is not set" into the route error boundary. Callers already treat an
  // empty result set as "no data yet" (empty states; the events feed falls back to seed data), so
  // every audited route renders readably without a database. This never triggers in production,
  // where DATABASE_URL is always set.
  if (!isDatabaseConfigured()) {
    return Promise.resolve(degradedEmptyResult<Row>());
  }
  return getPool().query<Row>(text, params);
}
