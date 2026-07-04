/**
 * Stale-lead nudge endpoint.
 *
 * Finds OPEN prospects (not won / lost / not_qualified, not archived)
 * that haven't been contacted in STALE_DAYS and drops an in-app
 * notification so a Business Builder acts on them — follow up, or move
 * the lead to Lost so it doesn't rot in the pipeline.
 *
 * Recipient: the prospect's owner if one is set, otherwise every
 * Business Builder (so an unowned stale lead doesn't fall through).
 *
 * Auth: Bearer `CRON_SECRET`. Callers:
 *   - the Netlify Scheduled Function (`netlify/functions/stale-leads.mts`)
 *   - manual `curl -H "Authorization: Bearer …"` for verification.
 *
 * Cross-tenant SYSTEM scan. Idempotency: we don't re-notify the same
 * (prospect, user) pair within STALE_RENOTIFY_DAYS, so a lingering stale
 * lead nudges roughly every ~10 days rather than daily.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { notifications, orgs, prospects, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { STALE_DAYS, STALE_RENOTIFY_DAYS } from "@/lib/pipeline/staleness";

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
    if (!master) return { scanned: 0, created: 0 };

    // Every internal user — the fallback recipients for unowned leads.
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
    if (bbIds.length === 0) return { scanned: 0, created: 0 };

    // Candidate stale prospects.
    const staleCutoff = sql`now() - ${`${STALE_DAYS} days`}::interval`;
    const candidates = await tx
      .select({
        id: prospects.id,
        orgId: prospects.orgId,
        ownerUserProfileId: prospects.ownerUserProfileId,
      })
      .from(prospects)
      .where(
        and(
          eq(prospects.orgId, master.id),
          sql`${prospects.archivedAt} IS NULL`,
          sql`${prospects.status} NOT IN ('onboarded','lost','not_qualified')`,
          sql`COALESCE(${prospects.lastContactAt}, ${prospects.createdAt}) < ${staleCutoff}`,
        ),
      );

    if (candidates.length === 0) return { scanned: 0, created: 0 };

    // Existing recent stale notifications, so we don't re-nudge too soon.
    const recent = await tx
      .select({
        prospectId: notifications.parentEntityId,
        userProfileId: notifications.userProfileId,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.parentEntityType, "prospect_stale"),
          sql`${notifications.createdAt} > now() - ${`${STALE_RENOTIFY_DAYS} days`}::interval`,
        ),
      );
    const alreadyNotified = new Set(
      recent.map((r) => `${r.prospectId}:${r.userProfileId}`),
    );

    const toInsert: (typeof notifications.$inferInsert)[] = [];
    for (const c of candidates) {
      const recipients = c.ownerUserProfileId
        ? [c.ownerUserProfileId]
        : bbIds;
      for (const uid of recipients) {
        if (alreadyNotified.has(`${c.id}:${uid}`)) continue;
        toInsert.push({
          orgId: c.orgId,
          userProfileId: uid,
          type: "message",
          parentEntityType: "prospect_stale",
          parentEntityId: c.id,
          sentVia: "in_app",
        });
      }
    }

    if (toInsert.length > 0) {
      await tx.insert(notifications).values(toInsert);
    }
    return { scanned: candidates.length, created: toInsert.length };
  });

  return NextResponse.json({ ok: true, ...result });
}
