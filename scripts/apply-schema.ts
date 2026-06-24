/**
 * Applies db/schema.sql to a Postgres database. The schema is idempotent (every statement is
 * `… if not exists` / a `drop … if exists`+`add` pair / a `NOT EXISTS`-guarded back-fill), so this is
 * safe to run repeatedly and pre-emptively.
 *
 * Run this after ANY schema-touching release so production Neon actually gets the new tables/columns —
 * prod does not auto-apply the schema, and missing tables silently break whole features. See the
 * "Schema apply runbook" in docs/product/deployment-auth-investigation.md.
 *
 *   vercel env pull .env.local   # provides the prod DATABASE_URL locally (never commit it)
 *   npm run db:apply
 *
 * Connection: prefers MIGRATION_DATABASE_URL, else DATABASE_URL. DDL is applied against the Neon
 * DIRECT endpoint (the pooled `-pooler` host is stripped) — see db/schema.sql's header. Only the host
 * is ever printed, never the full connection string.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

function resolveConnectionString(): string {
  const raw = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "No connection string set. Provide DATABASE_URL (e.g. `vercel env pull .env.local`) or MIGRATION_DATABASE_URL."
    );
  }
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    // Neon's pooled runtime host carries `-pooler`; DDL should target the direct endpoint.
    url.hostname = url.hostname.replace("-pooler", "");
    return url.toString();
  } catch {
    return raw;
  }
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unknown host)";
  }
}

async function main() {
  const sql = readFileSync(join(process.cwd(), "db/schema.sql"), "utf8");
  const connectionString = resolveConnectionString();
  const host = hostOf(connectionString);

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  // eslint-disable-next-line no-console
  console.log(`Applying db/schema.sql to ${host} …`);

  await client.connect();
  try {
    // The schema is param-free, so the whole file runs as one simple-query batch.
    await client.query(sql);
    const { rows } = await client.query<{ count: number }>(
      "select count(*)::int as count from information_schema.tables where table_schema = 'public'"
    );
    // eslint-disable-next-line no-console
    console.log(`✓ applied db/schema.sql → ${rows[0]?.count ?? "?"} public tables, 0 errors.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("✗ db:apply failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
