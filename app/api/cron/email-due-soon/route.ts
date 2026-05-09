/**
 * Due-soon nudge endpoint.
 *
 * Sends a "your action item is due tomorrow" email + in-app notification
 * for every action item whose due_date falls inside (now, now+30h] AND
 * has an assignee AND isn't done/draft AND hasn't already been nudged.
 *
 * Auth: Bearer `CRON_SECRET`. Two callers:
 *   - The Netlify Scheduled Function (`netlify/functions/email-due-soon.mts`)
 *     which fires once daily inside Bruce's working window.
 *   - Manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * Cross-tenant scan: this is a SYSTEM operation (we want EVERY tenant's
 * due items in one pass), so it uses `withSystemContext`. The 30h window
 * gives a one-day-long safety margin against schedule drift / DST hops.
 *
 * Idempotency: a row in `notifications` of type `action_item_due_soon`
 * for this `(action_item_id, user_profile_id)` pair is the marker. We
 * skip any item that already has one. Re-scheduling an item past the
 * window and back creates a fresh row → fresh nudge, which is fine.
 */

import { and, eq, gt, isNotNull, lte, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { actionItems, notifications, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  isWithinWorkingHours,
  sendEmailQuietly,
} from "@/lib/email/send";
import { actionItemDueSoonEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured." },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The action: we send mails immediately when this endpoint runs.
  // The Netlify Scheduled Function only fires inside the working
  // window, but a manual curl could hit this any time of day. Bypass
  // the working-hours guard inside `sendEmailQuietly` so manual runs
  // don't silently no-op — operator chose to run it now.
  const bypassWorkingHours = !isWithinWorkingHours();

  const result = await withSystemContext(async (tx) => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 60 * 60 * 1000);

    // Find candidates: due in window, has assignee, not done/draft, no
    // existing due_soon notification for this assignee on this item.
    const rows = await tx
      .select({
        id: actionItems.id,
        title: actionItems.title,
        dueDate: actionItems.dueDate,
        orgId: actionItems.orgId,
        assigneeUserProfileId: actionItems.assigneeUserProfileId,
        assigneeEmail: userProfiles.email,
        assigneeName: userProfiles.fullName,
      })
      .from(actionItems)
      .innerJoin(
        userProfiles,
        eq(userProfiles.id, actionItems.assigneeUserProfileId),
      )
      .where(
        and(
          isNotNull(actionItems.dueDate),
          isNotNull(actionItems.assigneeUserProfileId),
          gt(actionItems.dueDate, now),
          lte(actionItems.dueDate, horizon),
          ne(actionItems.status, "done"),
          ne(actionItems.status, "draft"),
          // No existing due_soon notification for this user+item.
          sql`NOT EXISTS (
            SELECT 1 FROM ${notifications} n
            WHERE n.parent_entity_type = 'action_item'
              AND n.parent_entity_id = ${actionItems.id}
              AND n.user_profile_id = ${actionItems.assigneeUserProfileId}
              AND n.type = 'action_item_due_soon'
          )`,
        ),
      );

    return rows;
  });

  let sent = 0;
  let failed = 0;
  for (const row of result) {
    if (!row.dueDate || !row.assigneeUserProfileId) continue;

    // Insert the notification first so a slow send + retry doesn't
    // double-fire. RLS requires we set the org context for the insert.
    try {
      await withSystemContext(async (tx) => {
        await tx.insert(notifications).values({
          orgId: row.orgId,
          userProfileId: row.assigneeUserProfileId!,
          type: "action_item_due_soon",
          parentEntityType: "action_item",
          parentEntityId: row.id,
          sentVia: "both",
        });
      });
    } catch (e) {
      console.error("[due-soon] failed to insert notification:", e);
      failed += 1;
      continue;
    }

    const emailResult = await sendEmailQuietly({
      ...actionItemDueSoonEmail({
        to: row.assigneeEmail,
        recipientName: row.assigneeName,
        itemTitle: row.title,
        dueDate: row.dueDate,
        url: `/portal/action-items/${row.id}`,
      }),
      bypassWorkingHours,
    });
    if (emailResult.delivered) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    scanned: result.length,
    sent,
    failed,
    bypassWorkingHours,
  });
}
