/**
 * Follow-up-due reminder endpoint.
 *
 * Finds OPEN prospects (not won / lost / not_qualified, not archived) whose
 * scheduled follow-up date has arrived (due today in Mountain Time, or
 * overdue) and drops an in-app notification so the owner actually gets
 * reminded — which then also surfaces as an in-app toast and, when enabled,
 * a desktop push. Fills the gap where scheduling a follow-up set a date but
 * never pinged anyone.
 *
 * Recipient: the prospect's owner if set, otherwise every Business Builder.
 *
 * Auth: Bearer `CRON_SECRET`. Callers:
 *   - the Netlify Scheduled Function (`netlify/functions/followups-due.mts`)
 *   - manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * Cross-tenant SYSTEM scan. Idempotency: we don't re-notify the same
 * (prospect, user) pair within ~20h, so a still-open follow-up nudges once
 * a day rather than on every run.
 */

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { notifications, orgs, prospects, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendPushToUser } from "@/lib/push/web-push";

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

  const result = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return { scanned: 0, created: 0, pushTargets: [] };

    const bbs = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, master.id),
          inArray(userProfiles.role, ["master_admin", "coach"]),
        ),
      );
    const bbIds = bbs.map((b) => b.id);
    if (bbIds.length === 0) return { scanned: 0, created: 0, pushTargets: [] };

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
      const recipients = c.ownerUserProfileId ? [c.ownerUserProfileId] : bbIds;
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

  // Desktop push (best-effort), outside the DB transaction.
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

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    created: result.created,
  });
}
