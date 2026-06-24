/**
 * Raised by a write path when its backing table/column is missing (Postgres 42P01 undefined_table /
 * 42703 undefined_column) — the signature of a prod schema that hasn't been applied yet. Routes map
 * this to a 503 + a clear, actionable message instead of an opaque 500, so the failure mode that bit
 * us (missing tables → "unavailable" 500s) tells an operator exactly what to do.
 *
 * The fix is to run `npm run db:apply` — see docs/product/deployment-auth-investigation.md.
 */
export class SchemaNotProvisionedError extends Error {
  constructor(feature: string) {
    super(`${feature} isn't set up yet — the database schema needs applying. Run \`npm run db:apply\`.`);
    this.name = "SchemaNotProvisionedError";
  }
}
