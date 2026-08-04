/**
 * Telling the Business Builder that a client moved their own commitment.
 *
 * **The gap this closes.** A client assignee could always change the
 * status of their own item, and nothing anywhere recorded that they had.
 * No notification row, no email, no entry in the bell. So "they finished
 * it last week", "they are stuck on it" and "they have not opened the
 * portal since March" were the same observation from our side: silence.
 * That is the same failure shape as every dead cron in CLAUDE.md, except
 * the thing going quiet is a paying client working the plan.
 *
 * The due date is new here. It used to be in `updateActionItem`'s
 * restricted-field list, so an assignee who needed another week had no
 * way to say so except a message that was not attached to the item.
 * Bruce's call: the client changes it and we are told — the same
 * "straight on, not a request queue" decision as client-raised agenda
 * points. A queue would mean a client watching a date they know is wrong
 * while waiting for someone to approve reality.
 *
 * Only CLIENT-driven changes notify. A Business Builder editing their
 * own client's item must not raise a bell on their own desk, and telling
 * the other Builder about a client that is not theirs is the cross-book
 * noise own-book-by-default exists to prevent.
 *
 * NO `"use server"` directive, deliberately. Every export of a
 * `"use server"` module becomes a browser-reachable POST endpoint, and
 * this one writes notifications and sends mail with no authorization of
 * its own — the calling server action is the gate. Same rule as
 * `lib/notifications/action-item-assigned.ts`.
 */

import { notifications } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { resolveEngagementBuilders } from "@/lib/db/queries/engagement-builders";
import { sendEmailQuietly } from "@/lib/email/send";
import { actionItemProgressEmail } from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/push/web-push";
import { STATUS_LABEL, type ActionItemStatus } from "@/components/action-items/utils";

export type ProgressNotice = {
  actionItemId: string;
  engagementId: string;
  itemTitle: string;
  /** Who made the change. Excluded from the recipients. */
  actorUserProfileId: string;
  actorName: string;
  /** Set when the status moved. Null when only the date did. */
  statusChange: { from: ActionItemStatus; to: ActionItemStatus } | null;
  /** Set when the due date moved. Null when only the status did. */
  dueDateChange: { from: Date | null; to: Date | null } | null;
};

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Edmonton",
};

function formatDue(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("en-CA", DATE_FMT) : "no date";
}

/**
 * One sentence describing what moved. Used as the push body, the email
 * subject line's tail, and the notification's own summary, so all three
 * say the same thing about the same event.
 */
export function describeProgress(notice: ProgressNotice): string {
  const parts: string[] = [];
  if (notice.statusChange) {
    parts.push(
      `moved it from ${STATUS_LABEL[notice.statusChange.from]} to ` +
        `${STATUS_LABEL[notice.statusChange.to]}`,
    );
  }
  if (notice.dueDateChange) {
    parts.push(
      `changed the due date from ${formatDue(notice.dueDateChange.from)} ` +
        `to ${formatDue(notice.dueDateChange.to)}`,
    );
  }
  return parts.join(", and ");
}

/**
 * Write the in-app rows, email and push the engagement's Business
 * Builder.
 *
 * Best-effort throughout: this runs AFTER the item is committed, and a
 * mail failure must never unwind a status change the client correctly
 * made. Returns nothing; failures are logged.
 */
export async function notifyBuildersOfProgress(
  notice: ProgressNotice,
): Promise<void> {
  // Nothing moved — don't manufacture a notification out of a save that
  // changed nothing.
  if (!notice.statusChange && !notice.dueDateChange) return;

  try {
    const recipients = await withSystemContext(async (tx) => {
      const builders = await resolveEngagementBuilders(tx, notice.engagementId);
      const targets = builders.filter(
        (b) => b.userProfileId !== notice.actorUserProfileId,
      );
      if (targets.length === 0) return [];

      await tx.insert(notifications).values(
        targets.map((b) => ({
          // The RECIPIENT's own org (master), never the client's — the
          // bell reads under the signed-in user's tenant, so a row
          // carrying the client's org is invisible rather than
          // wrong-looking. Same rule as every other Builder-bound notice.
          orgId: b.orgId,
          userProfileId: b.userProfileId,
          type: "action_item_progress" as const,
          parentEntityType: "action_item",
          parentEntityId: notice.actionItemId,
          sentVia: "both" as const,
        })),
      );
      return targets;
    });

    if (recipients.length === 0) return;

    const summary = describeProgress(notice);
    const url = `/business-builder/action-items/${notice.actionItemId}`;

    for (const b of recipients) {
      await sendEmailQuietly({
        ...actionItemProgressEmail({
          to: b.email,
          recipientName: b.fullName,
          actorName: notice.actorName,
          itemTitle: notice.itemTitle,
          summary,
          url,
        }),
        // Builder-bound mail ignores the working-hours window. The guard
        // exists to keep US out of a CLIENT's inbox at 9pm; a client
        // marking something done at 8pm is exactly when we want to know,
        // and `sendEmail` DROPS an out-of-hours message rather than
        // queueing it, so without this the notice would reach nobody.
        bypassWorkingHours: true,
      });

      await sendPushToUser(b.userProfileId, {
        title: `${notice.actorName} updated a commitment`,
        body: notice.itemTitle,
        url,
        tag: `action-item-${notice.actionItemId}`,
      });
    }
  } catch (e) {
    console.error("[action-items] progress notification failed", e);
  }
}
