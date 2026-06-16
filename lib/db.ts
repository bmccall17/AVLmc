import "server-only";
import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;

export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Serverless connection hygiene: one connection per warm Lambda (`max: 1`), but release it
  // quickly when idle so a traffic spike of many concurrent Lambdas does not pin every slot of
  // a small Postgres connection cap (Aiven free tier) and trigger `53300 too_many_connections`.
  // `allowExitOnIdle` lets the pool drop its socket between bursts. The durable fix is a
  // server-side connection pooler (PgBouncer) — point DATABASE_URL at the Aiven pooler endpoint.
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
  return getPool().query<Row>(text, params);
}
