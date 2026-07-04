import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

/**
 * Cron observability (PRD 07 / C2).
 *
 * Append-only record of scheduled-job outcomes, written by the sync routes and read by the health
 * probes so the portal can show "last run / last success / last error" next to the configured
 * schedule. Both write and read degrade gracefully: if the `system_job_runs` table does not exist
 * yet (fresh DB / migration not applied), recording is a no-op and reads return empty — a job must
 * never fail because observability is off.
 */

export type JobName = "avlgo_sync" | "cleanup" | "image_backfill" | "artist_match";
export type JobRunStatus = "success" | "failure";

export type JobRun = {
  id: string;
  job: JobName;
  status: JobRunStatus;
  detail: string | null;
  itemsProcessed: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number | null;
};

export async function recordJobRun(input: {
  job: JobName;
  status: JobRunStatus;
  detail?: string | null;
  itemsProcessed?: number | null;
  startedAt: Date;
}): Promise<void> {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - input.startedAt.getTime();

  try {
    await query(
      `
        insert into public.system_job_runs
          (id, job, status, detail, items_processed, started_at, finished_at, duration_ms)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        input.job,
        input.status,
        input.detail ? input.detail.slice(0, 500) : null,
        input.itemsProcessed ?? null,
        input.startedAt.toISOString(),
        finishedAt.toISOString(),
        durationMs,
      ]
    );
  } catch {
    // Table may not exist yet — never break the job because observability is unavailable.
  }
}

export async function getRecentJobRuns(job: JobName, limit = 5): Promise<JobRun[]> {
  try {
    const result = await query<{
      id: string;
      job: JobName;
      status: JobRunStatus;
      detail: string | null;
      items_processed: number | null;
      started_at: Date | string;
      finished_at: Date | string;
      duration_ms: number | null;
    }>(
      `
        select id, job, status, detail, items_processed, started_at, finished_at, duration_ms
        from public.system_job_runs
        where job = $1
        order by finished_at desc
        limit $2
      `,
      [job, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      job: row.job,
      status: row.status,
      detail: row.detail,
      itemsProcessed: row.items_processed,
      startedAt: toIso(row.started_at),
      finishedAt: toIso(row.finished_at),
      durationMs: row.duration_ms,
    }));
  } catch {
    return [];
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
