import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "@/lib/db";

/**
 * Schema drift detection (Health panel).
 *
 * db/schema.sql is the declared schema, but prod Neon is never auto-migrated — when a deploy ships
 * code that expects a column the live database lacks, the store layers degrade silently (their
 * 42703 fallbacks keep saves "working" while dropping fields). This module diffs the schema the
 * code ships against information_schema so that failure mode is visible instead of silent.
 *
 * The expected schema is parsed from db/schema.sql itself (create table + additive alter
 * statements), so new tables/columns are covered automatically — no hand-kept manifest to drift.
 */

export type SchemaDrift = {
  expectedTables: number;
  expectedColumns: number;
  /** Tables declared in db/schema.sql that do not exist in the live database. */
  missingTables: string[];
  /** "table.column" pairs declared in db/schema.sql but absent from an existing live table. */
  missingColumns: string[];
};

/**
 * Words that start constraint lines or wrapped continuation lines inside a create-table body —
 * anything that isn't the first token of a column definition.
 */
const NON_COLUMN_KEYWORDS = new Set([
  "primary",
  "unique",
  "check",
  "constraint",
  "foreign",
  "references",
  "on",
  "not",
  "null",
  "default",
  "exclude",
  "like",
  "deferrable",
]);

export async function detectSchemaDrift(): Promise<SchemaDrift> {
  const expected = await readExpectedSchema();
  const live = await readLiveSchema();

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  let expectedColumns = 0;

  for (const [table, columns] of expected) {
    expectedColumns += columns.size;
    const liveColumns = live.get(table);

    if (!liveColumns) {
      missingTables.push(table);
      continue;
    }

    for (const column of columns) {
      if (!liveColumns.has(column)) {
        missingColumns.push(`${table}.${column}`);
      }
    }
  }

  return {
    expectedTables: expected.size,
    expectedColumns,
    missingTables: missingTables.sort(),
    missingColumns: missingColumns.sort(),
  };
}

/** Parses db/schema.sql into table → declared columns. Exported for the parser test. */
export async function readExpectedSchema(): Promise<Map<string, Set<string>>> {
  const filePath = path.join(process.cwd(), "db", "schema.sql");
  const sql = await readFile(filePath, "utf8");
  const tables = new Map<string, Set<string>>();

  // create table if not exists public.<name> ( ...body... );  — body ends at a line-start ")".
  for (const match of sql.matchAll(
    /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi
  )) {
    const [, table, body] = match;
    const columns = tables.get(table) ?? new Set<string>();

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("--")) {
        continue;
      }
      // First token, unquoted (NextAuth columns are declared as "userId" etc.). Anything that
      // isn't a plain identifier — string literals and closing parens from multi-line check
      // lists, wrapped constraint fragments — is not a column definition.
      const word = (line.split(/[\s(]/, 1)[0] ?? "").replace(/"/g, "").toLowerCase();
      if (!/^[a-z_][a-z0-9_]*$/.test(word) || NON_COLUMN_KEYWORDS.has(word)) {
        continue;
      }
      columns.add(word);
    }
    tables.set(table, columns);
  }

  // Additive migrations for databases provisioned before the column existed.
  for (const match of sql.matchAll(
    /alter table public\.(\w+)\s+add column if not exists (\w+)/gi
  )) {
    const [, table, column] = match;
    const columns = tables.get(table) ?? new Set<string>();
    columns.add(column.toLowerCase());
    tables.set(table, columns);
  }

  return tables;
}

async function readLiveSchema(): Promise<Map<string, Set<string>>> {
  const result = await query<{ table_name: string; column_name: string }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `
  );

  const tables = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = tables.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name.toLowerCase());
    tables.set(row.table_name, columns);
  }
  return tables;
}
