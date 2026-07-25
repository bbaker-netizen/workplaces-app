/**
 * The weekly nudge to the CLIENT about their own overdue commitments.
 *
 * This exists so that chasing is not done by hand. An overdue
 * client-owned item appearing in Bruce's morning digest tells him
 * something is late; it does not move it. Being the chase mechanism
 * personally is unpaid labour, and it is the kind of labour that scales
 * linearly with the number of clients.
 *
 * Deliberate limits:
 *
 *   - **Weekly, not daily.** A daily nudge from a coaching practice
 *     reads as nagging and gets filtered. Weekly reads as a rhythm.
 *   - **Only the assignee.** Each person hears about their own
 *     commitments. Copying the client lead on everyone's list turns a
 *     reminder into a report card.
 *   - **Working hours respected.** Unlike the 07:00 digest, this is
 *     outbound to a client, so it goes through the normal send path and
 *     waits for the window if it has to.
 *   - **Draft items excluded.** Same rule as the recap: an item Bruce
 *     has not published is a proposal, not a commitment, and chasing
 *     somebody for one would be indefensible.
 */

import { and, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { actionItems, notifications, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { clientOverdueNudgeEmail } from "@/lib/email/templates";
import { EA_TIMEZONE } from "./digest-data";
import { listEaRecipients, listEngagementsForRecipient } from "./recipients";

export type NudgeResult = {
  recipientsEmailed: number;
  itemsChased: number;
  failed: number;
};

/**
 * The in-app half of the nudge.
 *
 * Best-effort: a notification that fails to write must not stop the
 * email going out, because the email is the part that actually reaches
 * most people.
 *
 * Guarded against re-notifying within three days. The job runs weekly,
 * so a fresh bell each Monday is the intent — but an Inngest retry after
 * a partial failure would otherwise ring twice in one morning.
 */
async function writeNudgeNotification(
  assigneeId: string,
  person: {
    orgId: string;
    items: { id: string; title: string; dueDate: Date | null }[];
  },
  now: Date,
): Promise<void> {
  if (person.items.length === 0) return;

  // Most overdue first — no date sorts last, since an item with no date
  // is not the one to open first.
  const worst = [...person.items].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  })[0];

  const recentCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  try {
    await withSystemContext(async (tx) => {
      const [already] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userProfileId, assigneeId),
            eq(notifications.type, "action_item_overdue"),
            gte(notifications.createdAt, recentCutoff),
          ),
        )
        .limit(1);
      if (already) return;

      await tx.insert(notifications).values({
        orgId: person.orgId,
        userProfileId: assigneeId,
        type: "action_item_overdue",
        parentEntityType: "action_item",
        parentEntityId: worst.id,
        sentVia: "both",
      });
    });
  } catch (e) {
    console.error(`[ea] could not write nudge notification for ${assigneeId}:`, e);
  }
}

export async function runClientNudge(
  now: Date = new Date(),
): Promise<NudgeResult> {
  const out: NudgeResult = { recipientsEmailed: 0, itemsChased: 0, failed: 0 };
  const builders = await listEaRecipients();
  const startOfToday = DateTime.fromJSDate(now, { zone: EA_TIMEZONE })
    .startOf("day")
    .toJSDate();

  // A person can sit on more than one Business Builder's book. Collect
  // across all of them first so nobody gets two emails in one morning.
  const byAssignee = new Map<
    string,
    {
      email: string;
      fullName: string;
      orgId: string;
      items: { id: string; title: string; dueDate: Date | null }[];
    }
  >();

  for (const builder of builders) {
    const rows = await withSystemContext(async (tx) => {
      const owned = await listEngagementsForRecipient(tx, builder);
      const ids = owned.map((e) => e.id);
      if (ids.length === 0) return [];

      return tx
        .select({
          itemId: actionItems.id,
          title: actionItems.title,
          dueDate: actionItems.dueDate,
          assigneeId: userProfiles.id,
          assigneeEmail: userProfiles.email,
          assigneeName: userProfiles.fullName,
          assigneeRole: userProfiles.role,
          // The CLIENT's org, which is where their notification row
          // belongs — not the Business Builder's master org.
          assigneeOrgId: userProfiles.orgId,
        })
        .from(actionItems)
        .innerJoin(
          userProfiles,
          eq(userProfiles.id, actionItems.assigneeUserProfileId),
        )
        .where(
          and(
            inArray(actionItems.engagementId, ids),
            isNotNull(actionItems.dueDate),
            lt(actionItems.dueDate, startOfToday),
            ne(actionItems.status, "done"),
            // Never chase somebody for a draft. See the module note.
            ne(actionItems.status, "draft"),
          ),
        );
    });

    for (const r of rows) {
      // Client-side owners only. Business Builders have the digest.
      if (r.assigneeRole !== "client_lead" && r.assigneeRole !== "client_manager" && r.assigneeRole !== "client_employee") {
        continue;
      }
      if (!r.assigneeEmail || !r.assigneeEmail.includes("@")) continue;

      const bucket = byAssignee.get(r.assigneeId) ?? {
        email: r.assigneeEmail,
        fullName: r.assigneeName,
        orgId: r.assigneeOrgId,
        items: [],
      };
      bucket.items.push({
        id: r.itemId,
        title: r.title,
        dueDate: r.dueDate,
      });
      byAssignee.set(r.assigneeId, bucket);
    }
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );

  for (const [assigneeId, person] of Array.from(byAssignee.entries())) {
    // In-app notification alongside the email, so a client who works out
    // of the portal rather than their inbox still sees it. The existing
    // due-soon reminder does both; this brings the overdue chase in line.
    //
    // ONE row per person per nudge, not one per item: five overdue
    // commitments producing five bells trains someone to ignore the
    // bell. It points at their most overdue item, which is the one worth
    // opening first.
    await writeNudgeNotification(assigneeId, person, now);

    const items = person.items.map((i) => ({
      title: i.title,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      daysOverdue: i.dueDate
        ? Math.floor(
            DateTime.fromJSDate(now, { zone: EA_TIMEZONE })
              .startOf("day")
              .diff(
                DateTime.fromJSDate(i.dueDate, { zone: EA_TIMEZONE }).startOf("day"),
                "days",
              ).days,
          )
        : null,
    }));

    const result = await sendEmailQuietly(
      clientOverdueNudgeEmail({
        to: person.email,
        recipientName: person.fullName,
        items,
        portalUrl: `${base}/portal/action-items`,
      }),
    );

    if (result.delivered) {
      out.recipientsEmailed++;
      out.itemsChased += items.length;
    } else {
      out.failed++;
    }
  }

  return out;
}
