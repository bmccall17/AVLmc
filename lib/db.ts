import "server-only";
import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  pool ??= new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: 1,
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
