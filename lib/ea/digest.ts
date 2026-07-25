/**
 * The morning briefing — orchestration.
 *
 * Order of operations, and why it is this order:
 *
 *   1. Gather the payload.
 *   2. Read the calendar (OUTSIDE any transaction — a Google round trip
 *      must not pin a pooled Postgres connection).
 *   3. In ONE transaction: claim the day's digest row, propose blocks,
 *      mint an approve token per block, and store the finished payload.
 *      Blocks and their tokens are written atomically with the digest
 *      they belong to, so a half-written briefing cannot exist.
 *   4. Send, then stamp `sent_at`.
 *
 * The digest row is written BEFORE the send is attempted. A Resend
 * failure therefore loses the email but never the snapshot the approve
 * links resolve against, and `sent_at` staying null is the signal that a
 * retry is warranted.
 *
 * Idempotency is `(user_profile_id, sent_for_date)` UNIQUE. An Inngest
 * retry after a partial failure claims nothing and returns "already
 * sent" rather than mailing Bruce twice.
 *
 * **Working-hours exception.** Everything else in this app refuses to
 * send outside Mon-Fri 08:30-18:00 MT. The digest deliberately sets
 * `bypassWorkingHours` because it is specified to land at 07:00, before
 * the window opens. A briefing that arrives at 08:30 has already missed
 * the morning it was describing.
 */

import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { eaDigests } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { dailyDigestEmail } from "@/lib/email/templates";
import { EA_TIMEZONE, gatherDigest, type DigestPayload } from "./digest-data";
import { gradeSweep, recordJobRun } from "./job-runs";
import { listEaRecipients, type EaRecipient } from "./recipients";
import { loadCalendarWindow, proposeBlocks } from "./time-blocks";

export type DigestRunResult = {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
  details: {
    userProfileId: string;
    outcome: "sent" | "already_sent" | "failed";
    blocks?: number;
    error?: string;
  }[];
};

/** Build and send one recipient's digest. Exported for the manual run. */
export async function runDigestForRecipient(
  recipient: EaRecipient,
  now: Date = new Date(),
): Promise<{ outcome: "sent" | "already_sent" | "failed"; blocks?: number; error?: string }> {
  const forDate = DateTime.fromJSDate(now, { zone: EA_TIMEZONE }).toFormat(
    "yyyy-MM-dd",
  );

  // 1. Gather.
  const { payload } = await withSystemContext((tx) =>
    gatherDigest(tx, recipient, now),
  );

  // 2. Calendar read, outside the transaction. null means "not
  //    connected or unreadable" — we still send the briefing, we just do
  //    not propose blocks into a calendar we cannot see.
  const external = await loadCalendarWindow(recipient.userProfileId, now);

  // 3. Claim the day, propose, mint tokens, store the snapshot.
  const claim = await withSystemContext(async (tx) => {
    const inserted = await tx
      .insert(eaDigests)
      .values({
        orgId: recipient.orgId,
        userProfileId: recipient.userProfileId,
        sentForDate: forDate,
        payload: payload as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: eaDigests.id });

    if (inserted.length === 0) return null; // already sent today
    const digestId = inserted[0].id;

    const blocks =
      external === null
        ? []
        : await proposeBlocks(tx, recipient, payload, now, digestId, external);

    const finalPayload: DigestPayload = { ...payload, proposedBlocks: blocks };

    await tx
      .update(eaDigests)
      .set({ payload: finalPayload as unknown as Record<string, unknown> })
      .where(eq(eaDigests.id, digestId));

    return { digestId, finalPayload };
  });

  if (claim === null) return { outcome: "already_sent" };

  // 4. Send, then stamp.
  const result = await sendEmailQuietly({
    ...dailyDigestEmail({ to: recipient.email, payload: claim.finalPayload }),
    // 07:00 MT is before the working window opens. See the module note.
    bypassWorkingHours: true,
  });

  if (!result.delivered) {
    return {
      outcome: "failed",
      blocks: claim.finalPayload.proposedBlocks.length,
      error: result.reason === "error" ? result.error : result.reason,
    };
  }

  await withSystemContext((tx) =>
    tx
      .update(eaDigests)
      .set({ sentAt: sql`now()` })
      .where(eq(eaDigests.id, claim.digestId)),
  );

  return { outcome: "sent", blocks: claim.finalPayload.proposedBlocks.length };
}

/**
 * Send every Business Builder their briefing.
 *
 * One recipient's failure never stops the sweep — the same rule the
 * nightly series top-up follows. A briefing nobody receives because
 * somebody else's Google token expired would be a silly way to lose the
 * morning.
 */
export async function runDailyDigest(
  now: Date = new Date(),
): Promise<DigestRunResult> {
  const recipients = await listEaRecipients();
  const out: DigestRunResult = {
    recipients: recipients.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  let blocksProposed = 0;
  let blockFailures = 0;

  for (const r of recipients) {
    try {
      const res = await runDigestForRecipient(r, now);
      if (res.outcome === "sent") out.sent++;
      else if (res.outcome === "already_sent") out.skipped++;
      else out.failed++;
      blocksProposed += res.blocks ?? 0;
      if (res.outcome === "failed") blockFailures++;
      out.details.push({ userProfileId: r.userProfileId, ...res });
    } catch (e) {
      out.failed++;
      blockFailures++;
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[ea] digest failed for ${r.userProfileId}:`, e);
      out.details.push({
        userProfileId: r.userProfileId,
        outcome: "failed",
        error,
      });
    }
  }

  // Focus-time proposals get their own heartbeat even though they run
  // inside this job. They are the piece most likely to fail on its own
  // while the rest of the digest still lands — a Google token that has
  // lost calendar access produces a briefing with no blocks in it, which
  // reads as "a quiet week" rather than as a broken integration. A
  // separate line in the rollup makes that distinguishable.
  await recordJobRun({
    jobId: "ea-time-blocks",
    startedAt: now,
    status: gradeSweep({ succeeded: out.sent, failed: blockFailures }),
    itemsProcessed: blocksProposed,
  });

  return out;
}
