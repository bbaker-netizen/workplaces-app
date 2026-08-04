/**
 * The receipt for a "Draft from this meeting" run.
 *
 * Drafting happens in a Netlify Background Function: it answers 202 the
 * moment it is queued, then runs alone for up to fifteen minutes. Every
 * way it can fail — Fireflies returning no transcript, the Claude call
 * erroring, the extractor's JSON failing to parse — reached a
 * `console.error` in a Netlify log and nothing else. From the Business
 * Builder's side all of those look identical to "this session produced
 * no commitments": press the button, wait, get nothing.
 *
 * Crown and Ember's 30 July session is the case that surfaced it —
 * synced, 66 minutes, summary present, zero drafts, and no record
 * anywhere of why.
 *
 * NO `"use server"` directive, deliberately. These are called from a
 * background function and from server actions, and they write rows with
 * no authorization of their own — the caller is the gate. Same rule as
 * `lib/meetings/transcript.ts` and `lib/integrations/fireflies-sync.ts`.
 */

import { desc, eq } from "drizzle-orm";
import { meetingDraftRuns } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type DraftRunStatus = "running" | "succeeded" | "failed";

export type DraftRun = {
  id: string;
  status: DraftRunStatus;
  itemsCreated: number;
  documentsQueued: number;
  errorText: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

/**
 * Open a run. Returns its id, or null if the row couldn't be written.
 *
 * Never throws. A bookkeeping failure must not stop the drafting it only
 * observes — the same rule `withHeartbeat` follows for the EA jobs. A
 * null id simply means the finish call becomes a no-op.
 */
export async function startDraftRun(input: {
  meetingId: string;
  orgId: string;
  startedByUserProfileId?: string | null;
}): Promise<string | null> {
  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .insert(meetingDraftRuns)
        .values({
          orgId: input.orgId,
          engagementMeetingId: input.meetingId,
          status: "running",
          startedByUserProfileId: input.startedByUserProfileId ?? null,
        })
        .returning({ id: meetingDraftRuns.id });
      return row?.id ?? null;
    });
  } catch (e) {
    console.error("[draft-runs] could not open a run", e);
    return null;
  }
}

/** Close a run. Never throws, for the same reason as `startDraftRun`. */
export async function finishDraftRun(
  runId: string | null,
  outcome:
    | { status: "succeeded"; itemsCreated: number; documentsQueued: number }
    | { status: "failed"; error: string },
): Promise<void> {
  if (!runId) return;
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(meetingDraftRuns)
        .set(
          outcome.status === "succeeded"
            ? {
                status: "succeeded",
                itemsCreated: outcome.itemsCreated,
                documentsQueued: outcome.documentsQueued,
                finishedAt: new Date(),
              }
            : {
                status: "failed",
                // Truncated: some upstream errors carry an entire
                // response body, and the column feeds a UI panel.
                errorText: outcome.error.slice(0, 2000),
                finishedAt: new Date(),
              },
        )
        .where(eq(meetingDraftRuns.id, runId));
    });
  } catch (e) {
    console.error("[draft-runs] could not close run", runId, e);
  }
}

/**
 * The most recent run for a meeting, for the workspace to render.
 *
 * A run left `running` for more than 20 minutes is reported as failed:
 * the background function's own ceiling is 15, so past that it is not
 * still going — it died without getting to its own error handler (an
 * out-of-memory kill, a deploy mid-run). Without this the UI would show
 * a spinner for ever on exactly the failures that never got to speak.
 */
const STALE_AFTER_MS = 20 * 60 * 1000;

export async function latestDraftRun(
  meetingId: string,
): Promise<DraftRun | null> {
  try {
    return await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          id: meetingDraftRuns.id,
          status: meetingDraftRuns.status,
          itemsCreated: meetingDraftRuns.itemsCreated,
          documentsQueued: meetingDraftRuns.documentsQueued,
          errorText: meetingDraftRuns.errorText,
          startedAt: meetingDraftRuns.startedAt,
          finishedAt: meetingDraftRuns.finishedAt,
        })
        .from(meetingDraftRuns)
        .where(eq(meetingDraftRuns.engagementMeetingId, meetingId))
        .orderBy(desc(meetingDraftRuns.startedAt))
        .limit(1);
      if (!row) return null;

      const stalled =
        row.status === "running" &&
        Date.now() - new Date(row.startedAt).getTime() > STALE_AFTER_MS;

      return {
        id: row.id,
        status: (stalled ? "failed" : row.status) as DraftRunStatus,
        itemsCreated: row.itemsCreated,
        documentsQueued: row.documentsQueued,
        errorText: stalled
          ? "The drafting job stopped without reporting back. Press Draft again."
          : row.errorText,
        startedAt: new Date(row.startedAt),
        finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
      };
    });
  } catch (e) {
    console.error("[draft-runs] could not read latest run", meetingId, e);
    return null;
  }
}
