/**
 * Follow-up-due scan — shared by the daily Netlify cron and the on-demand
 * "Check now" button on the notifications page.
 *
 * Finds OPEN prospects whose scheduled follow-up date has arrived (due today
 * in Mountain Time, or overdue) and drops an in-app notification on the owner
 * (or the master-admin triage inbox if unowned — shared rule in
 * lib/notifications/prospect-recipients.ts), then best-effort desktop push.
 * Idempotent within ~20h per (prospect, user) so repeat runs don't spam.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { notifications, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendPushToUser } from "@/lib/push/web-push";
import {
  loadInternalUsers,
  recipientIdsForProspect,
} from "@/lib/notifications/prospect-recipients";

export async function scanFollowupsDue(): Promise<{
  scanned: number;
  created: number;
}> {
  const result = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return { scanned: 0, created: 0, pushTargets: [] };

    const internal = await loadInternalUsers(tx, master.id);
    if (internal.all.length === 0) {
      return { scanned: 0, created: 0, pushTargets: [] };
    }

    // "Due" = the follow-up moment is before the start of TOMORROW in
    // Mountain Time — i.e. due today or overdue.
    const dueCutoff = sql`(date_trunc('day', (now() AT TIME ZONE 'America/Edmonton')) + interval '1 day') AT TIME ZONE 'America/Edmonton'`;
    const candidates = await tx
      .select({
        id: prospects.id,
        orgId: prospects.orgId,
        ownerUserProfileId: prospects.ownerUserProfileId,
        companyName: prospects.companyName,
      })
      .from(prospects)
      .where(
        and(
          eq(prospects.orgId, master.id),
          isNotNull(prospects.nextActionDate),
          sql`${prospects.archivedAt} IS NULL`,
          sql`${prospects.status} NOT IN ('onboarded','lost','not_qualified')`,
          sql`${prospects.nextActionDate} < ${dueCutoff}`,
        ),
      );

    if (candidates.length === 0) {
      return { scanned: 0, created: 0, pushTargets: [] };
    }

    // Don't re-nudge the same (prospect, user) within ~20h.
    const recent = await tx
      .select({
        prospectId: notifications.parentEntityId,
        userProfileId: notifications.userProfileId,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.parentEntityType, "prospect_followup_due"),
          sql`${notifications.createdAt} > now() - interval '20 hours'`,
        ),
      );
    const alreadyNotified = new Set(
      recent.map((r) => `${r.prospectId}:${r.userProfileId}`),
    );

    const toInsert: (typeof notifications.$inferInsert)[] = [];
    const pushTargets: { uid: string; prospectId: string; name: string }[] = [];
    for (const c of candidates) {
      const recipients = recipientIdsForProspect(
        c.ownerUserProfileId,
        internal,
      );
      for (const uid of recipients) {
        if (alreadyNotified.has(`${c.id}:${uid}`)) continue;
        toInsert.push({
          orgId: c.orgId,
          userProfileId: uid,
          type: "message",
          parentEntityType: "prospect_followup_due",
          parentEntityId: c.id,
          sentVia: "both",
        });
        pushTargets.push({ uid, prospectId: c.id, name: c.companyName });
      }
    }

    if (toInsert.length > 0) {
      await tx.insert(notifications).values(toInsert);
    }
    return {
      scanned: candidates.length,
      created: toInsert.length,
      pushTargets,
    };
  });

  await Promise.all(
    (result.pushTargets ?? []).map((t) =>
      sendPushToUser(t.uid, {
        title: "Follow-up due",
        body: `Time to follow up with ${t.name}.`,
        url: `/business-builder/pipeline/${t.prospectId}`,
        tag: `followup-due-${t.prospectId}`,
      }),
    ),
  );

  return { scanned: result.scanned, created: result.created };
}
