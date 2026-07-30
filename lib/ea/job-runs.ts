/**
 * Heartbeat — recording that a background job ran, and reading back when
 * each one last worked.
 *
 * The failure mode this exists for is silence. Every EA job is a cron
 * nobody watches. It can stop firing, lose its Google token, or throw on
 * every run, and the only symptom is an email that does not arrive — and
 * a missing email is indistinguishable from a quiet week. Without a
 * heartbeat, "the assistant has been dead for a month" and "nothing
 * needed saying" look identical from the outside.
 *
 * So every job records a row on completion, INCLUDING failures. A run
 * that processed nothing is healthy; a job with no row at all is not.
 *
 * Writes never throw. A heartbeat that can fail a job it is only
 * supposed to observe would be worse than no heartbeat, so every path
 * here swallows and logs.
 *
 * `withSystemContext` throughout, same as the rest of the module: there
 * is no signed-in user in a cron run, and the table is deliberately
 * unreachable from a tenant-bound query (migration 0088 enables RLS with
 * no policy).
 */

import { desc, eq, inArray } from "drizzle-orm";
import { eaJobRuns } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type JobRunStatus = "success" | "partial" | "failed";

/**
 * Every job that reports a heartbeat, in the order the rollup lists
 * them. Registered here rather than derived from rows, so a job that has
 * NEVER run still appears — which is the case that matters most, since a
 * job that never fired writes no rows to derive from.
 */
export const EA_JOBS: { id: string; label: string; cadence: string }[] = [
  { id: "ea-daily-digest", label: "Morning briefing", cadence: "Weekday mornings" },
  { id: "ea-time-blocks", label: "Focus time proposals", cadence: "Weekday mornings" },
  { id: "ea-inbox-sweep", label: "Inbox triage", cadence: "Hourly" },
  { id: "ea-recap-sweep", label: "Session recaps", cadence: "Hourly" },
  { id: "ea-client-nudge", label: "Client chasing", cadence: "Monday mornings" },
  { id: "ea-friday-rollup", label: "Friday rollup", cadence: "Friday afternoons" },
  // Not an EA job, but it belongs on the same watch list: it is a
  // scheduled job whose only failure mode is silence. It had never fired
  // at all until 2026-07-28, and nothing surfaced that — a series quietly
  // running out of dates looks identical to a series nobody uses.
  {
    id: "session-series-top-up",
    label: "Recurring meeting horizon",
    cadence: "Nightly",
  },
];

/** A job is stale once nothing has succeeded for this long. */
export const STALE_AFTER_DAYS = 8;

/* ---------------------------- writing ---------------------------- */

export async function recordJobRun(args: {
  jobId: string;
  startedAt: Date;
  status: JobRunStatus;
  itemsProcessed: number;
  errorText?: string | null;
  userProfileId?: string | null;
}): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx.insert(eaJobRuns).values({
        jobId: args.jobId,
        userProfileId: args.userProfileId ?? null,
        startedAt: args.startedAt,
        completedAt: new Date(),
        status: args.status,
        itemsProcessed: args.itemsProcessed,
        // Long stack traces are useless in an email. Keep enough to
        // recognise the failure and go looking.
        errorText: args.errorText ? args.errorText.slice(0, 1000) : null,
      }),
    );
  } catch (e) {
    console.error(`[ea] could not record heartbeat for ${args.jobId}:`, e);
  }
}

/**
 * Run `fn`, record the outcome, return whatever it returned.
 *
 * A throw is recorded as `failed` and then RE-THROWN: Inngest's retry
 * and alerting should still see a failure, the heartbeat is an observer
 * and not a catch-all. `countItems` extracts the "what did it do" number
 * from the job's own result shape.
 *
 * `extractError` is what makes a graded failure legible. Most EA jobs
 * loop over recipients and CATCH per-item errors so one bad recipient
 * cannot stop the sweep — which means the job returns normally with a
 * failure count and never throws. Without this callback those runs
 * recorded `status: failed, error_text: null`, and a failure with no
 * reason is barely better than no heartbeat at all: it says something is
 * broken and refuses to say what. That is exactly how the inbox sweep
 * failed 29 times running from 28 Jul 2026 with nothing to point at.
 * Jobs that swallow per-item errors must surface the first one here.
 */
export async function withHeartbeat<T>(
  jobId: string,
  fn: () => Promise<T>,
  countItems: (result: T) => number,
  gradeResult?: (result: T) => JobRunStatus,
  extractError?: (result: T) => string | null | undefined,
): Promise<T> {
  const startedAt = new Date();
  try {
    const result = await fn();
    const status = gradeResult ? gradeResult(result) : "success";
    await recordJobRun({
      jobId,
      startedAt,
      status,
      itemsProcessed: countItems(result),
      // Only on a non-clean run: a success carrying an error string would
      // read as a fault in the rollup's job table.
      errorText: status === "success" ? null : extractError?.(result) ?? null,
    });
    return result;
  } catch (e) {
    await recordJobRun({
      jobId,
      startedAt,
      status: "failed",
      itemsProcessed: 0,
      errorText: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/**
 * Grade a sweep-shaped result. Most EA jobs loop over recipients and
 * report per-item counts, so the same rule applies to all of them:
 * nothing failed is a success, everything failed is a failure, and a
 * mix is partial rather than being rounded to either.
 */
export function gradeSweep(args: {
  succeeded: number;
  failed: number;
}): JobRunStatus {
  if (args.failed === 0) return "success";
  if (args.succeeded === 0) return "failed";
  return "partial";
}

/* ---------------------------- reading ---------------------------- */

export type JobHeartbeat = {
  jobId: string;
  label: string;
  cadence: string;
  /** Most recent run of any outcome. Null if the job has never run. */
  lastRunAt: Date | null;
  lastStatus: JobRunStatus | null;
  lastItems: number | null;
  /** Most recent run that actually worked. Drives the stale check. */
  lastSuccessAt: Date | null;
  lastSuccessItems: number | null;
  /** Error from the most recent failure, shown only when stale. */
  lastError: string | null;
  stale: boolean;
};

/**
 * One row per registered job: when it last ran, when it last worked, and
 * what it did.
 *
 * Reads every job's history in two queries rather than two per job. The
 * table is small (a handful of rows an hour) so a bounded scan is
 * cheaper than six round trips.
 */
export async function loadHeartbeats(
  now: Date = new Date(),
): Promise<JobHeartbeat[]> {
  const jobIds = EA_JOBS.map((j) => j.id);

  const rows = await withSystemContext((tx) =>
    tx
      .select({
        jobId: eaJobRuns.jobId,
        completedAt: eaJobRuns.completedAt,
        status: eaJobRuns.status,
        itemsProcessed: eaJobRuns.itemsProcessed,
        errorText: eaJobRuns.errorText,
      })
      .from(eaJobRuns)
      .where(inArray(eaJobRuns.jobId, jobIds))
      .orderBy(desc(eaJobRuns.completedAt))
      .limit(2000),
  );

  const staleCutoff = new Date(
    now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  );

  return EA_JOBS.map((job) => {
    const mine = rows.filter((r) => r.jobId === job.id);
    const last = mine[0] ?? null;
    const lastSuccess =
      mine.find((r) => r.status === "success" || r.status === "partial") ?? null;
    const lastFailure = mine.find((r) => r.status === "failed") ?? null;

    const stale =
      lastSuccess === null || lastSuccess.completedAt < staleCutoff;

    return {
      jobId: job.id,
      label: job.label,
      cadence: job.cadence,
      lastRunAt: last ? last.completedAt : null,
      lastStatus: last ? last.status : null,
      lastItems: last ? last.itemsProcessed : null,
      lastSuccessAt: lastSuccess ? lastSuccess.completedAt : null,
      lastSuccessItems: lastSuccess ? lastSuccess.itemsProcessed : null,
      // Only surfaced when stale — a single failure that later recovered
      // is noise in a weekly report.
      lastError: stale ? (lastFailure?.errorText ?? null) : null,
      stale,
    };
  });
}

/** Narrow read used by anything that just wants "is the EA alive". */
export async function anyJobStale(now: Date = new Date()): Promise<boolean> {
  const beats = await loadHeartbeats(now);
  return beats.some((b) => b.stale);
}

/** Kept for callers that record a run for one Builder specifically. */
export async function lastRunForJob(jobId: string): Promise<Date | null> {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({ completedAt: eaJobRuns.completedAt })
      .from(eaJobRuns)
      .where(eq(eaJobRuns.jobId, jobId))
      .orderBy(desc(eaJobRuns.completedAt))
      .limit(1),
  );
  return row ? row.completedAt : null;
}
