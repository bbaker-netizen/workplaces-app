/**
 * Send the mail the working-hours guard held back.
 *
 * NO `"use server"` — this is called by a cron route with no signed-in
 * user, and an unguarded function that sends mail must not also be a
 * browser-reachable POST endpoint. Same rule as
 * `lib/integrations/fireflies-sync.ts`.
 */

import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { emailOutbox } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmail, type EmailAttachment } from "./send";

/** Per-run cap. Enough to clear an overnight backlog in one pass. */
const MAX_PER_RUN = 50;
/**
 * Give up after this many tries.
 *
 * A dead address must not be retried for ever — it would fill every run
 * with the same failure and starve the mail behind it, which is exactly
 * how a queue turns into a second outage. The row is kept with its last
 * error rather than deleted, so a bounced client address stays findable.
 */
const MAX_ATTEMPTS = 5;

export type OutboxFlushResult = {
  sent: number;
  failed: number;
  abandoned: number;
  firstError: string | null;
};

export async function flushEmailOutbox(): Promise<OutboxFlushResult> {
  const due = await withSystemContext(async (tx) =>
    tx
      .select()
      .from(emailOutbox)
      .where(
        and(isNull(emailOutbox.sentAt), lte(emailOutbox.sendAfter, new Date())),
      )
      .orderBy(asc(emailOutbox.sendAfter))
      .limit(MAX_PER_RUN),
  );

  let sent = 0;
  let failed = 0;
  let abandoned = 0;
  let firstError: string | null = null;

  for (const row of due) {
    if (row.attempts >= MAX_ATTEMPTS) {
      abandoned += 1;
      continue;
    }

    // `bypassWorkingHours` because the flusher only ever runs INSIDE the
    // window — without it every row would be deferred again by the same
    // guard that queued it, and the queue would never drain.
    const result = await sendEmail({
      to: row.toEmail,
      subject: row.subject,
      html: row.html,
      text: row.textBody,
      attachments: (row.attachments as EmailAttachment[] | null) ?? undefined,
      bypassWorkingHours: true,
    });

    await withSystemContext(async (tx) => {
      if (result.delivered) {
        await tx
          .update(emailOutbox)
          .set({ sentAt: new Date(), attempts: row.attempts + 1 })
          .where(eq(emailOutbox.id, row.id));
      } else {
        await tx
          .update(emailOutbox)
          .set({
            attempts: row.attempts + 1,
            lastError:
              result.reason === "error" ? result.error : result.reason,
          })
          .where(eq(emailOutbox.id, row.id));
      }
    });

    if (result.delivered) {
      sent += 1;
    } else {
      failed += 1;
      if (!firstError) {
        firstError =
          result.reason === "error" ? result.error : String(result.reason);
      }
    }
  }

  return { sent, failed, abandoned, firstError };
}
