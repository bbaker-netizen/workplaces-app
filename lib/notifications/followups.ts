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

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { notifications, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendPushToUser } from "@/lib/push/web-push";
import {
  loadInternalUsers,
  recipientIdsForProspect,
} from "@/lib/notifications/prospect-recipients";

/**
 * How long an already-announced follow-up stays quiet before nudging
 * again, while it remains overdue. Per Bruce: weekly. Long enough that
 * the bell stays worth reading, short enough that a lead can't rot
 * unnoticed between its due date and the 14-day gone-quiet sweep.
 */
export const FOLLOWUP_RENUDGE_DAYS = 7;

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
        nextActionDate: prospects.nextActionDate,
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

    // Nudge once per follow-up, then weekly while it stays overdue.
    //
    // This used to suppress only within a 20-hour window, which meant an
    // overdue lead nobody had actioned produced a brand-new notification
    // every single weekday, forever — one lead left overdue for a
    // fortnight generated ten identical rows. That trains you to ignore
    // the bell, which is the opposite of the point.
    //
    // A follow-up's identity is (prospect, next_action_date). If a
    // notification for this pair already exists created at or after the
    // CURRENT due date, this follow-up has been announced — it then goes
    // quiet for FOLLOWUP_RENUDGE_DAYS before nudging again, so a lead
    // left overdue resurfaces weekly rather than every weekday.
    // Reschedule the lead and next_action_date moves past that
    // notification, so the new follow-up nudges promptly when it comes
    // due. No new column needed — the timestamps already encode it.
    const renudgeCutoff = new Date(
      Date.now() - FOLLOWUP_RENUDGE_DAYS * 24 * 60 * 60 * 1000,
    );
    const prospectIds = candidates.map((c) => c.id);
    const priorRows = await tx
      .select({
        prospectId: notifications.parentEntityId,
        userProfileId: notifications.userProfileId,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.parentEntityType, "prospect_followup_due"),
          inArray(notifications.parentEntityId, prospectIds),
        ),
      );
    // Latest announcement per (prospect, user).
    const lastNotifiedAt = new Map<string, Date>();
    for (const r of priorRows) {
      const key = `${r.prospectId}:${r.userProfileId}`;
      const prev = lastNotifiedAt.get(key);
      if (!prev || r.createdAt > prev) lastNotifiedAt.set(key, r.createdAt);
    }

    const toInsert: (typeof notifications.$inferInsert)[] = [];
    const pushTargets: { uid: string; prospectId: string; name: string }[] = [];
    for (const c of candidates) {
      const recipients = recipientIdsForProspect(
        c.ownerUserProfileId,
        internal,
      );
      for (const uid of recipients) {
        const last = lastNotifiedAt.get(`${c.id}:${uid}`);
        // Has this particular follow-up — prospect plus its CURRENT due
        // date — already been announced?
        const announced = Boolean(
          last && c.nextActionDate && last >= c.nextActionDate,
        );
        // Announced already: stay quiet for a week, then nudge again so
        // an overdue lead can't slip away silently. Not yet announced
        // (brand new, or rescheduled to a date that has now arrived):
        // nudge immediately rather than waiting out the weekly cadence.
        if (announced && last && last >= renudgeCutoff) continue;
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
