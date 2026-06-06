/**
 * Prospects queries — Coach Pipeline + per-prospect detail.
 * Phase 5 — CRM expansion.
 */

import { desc, eq } from "drizzle-orm";
import {
  engagements,
  orgs,
  prospectActivities,
  prospects,
  userProfiles,
  type Prospect,
  type ProspectActivity,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type PipelineProspect = Prospect & {
  ownerName: string | null;
  /** Lifetime payments received (cents) from the converted client's
   *  QuickBooks customer, when this prospect has become an engagement.
   *  Null for prospects not yet linked to a QBO customer — the UI falls
   *  back to expected_value_cents in that case. */
  qboLifetimePaymentsCents: number | null;
};

export async function listProspects(): Promise<PipelineProspect[]> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];
    // Left join the owner profile so the list can render the owner name
    // without a per-row lookup.
    const rows = await tx
      .select({
        prospect: prospects,
        ownerName: userProfiles.fullName,
        qboLifetimePaymentsCents: engagements.qboLifetimePaymentsCents,
      })
      .from(prospects)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, prospects.ownerUserProfileId),
      )
      .leftJoin(
        engagements,
        eq(engagements.id, prospects.convertedEngagementId),
      )
      .where(eq(prospects.orgId, master.id))
      .orderBy(desc(prospects.updatedAt));
    return rows.map((r) => ({
      ...r.prospect,
      ownerName: r.ownerName,
      qboLifetimePaymentsCents: r.qboLifetimePaymentsCents,
    }));
  });
}

export async function getProspect(id: string): Promise<PipelineProspect | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        prospect: prospects,
        ownerName: userProfiles.fullName,
        qboLifetimePaymentsCents: engagements.qboLifetimePaymentsCents,
      })
      .from(prospects)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, prospects.ownerUserProfileId),
      )
      .leftJoin(
        engagements,
        eq(engagements.id, prospects.convertedEngagementId),
      )
      .where(eq(prospects.id, id))
      .limit(1);
    if (!row) return null;
    return {
      ...row.prospect,
      ownerName: row.ownerName,
      qboLifetimePaymentsCents: row.qboLifetimePaymentsCents,
    };
  });
}

export type ProspectActivityWithAuthor = ProspectActivity & {
  authorName: string | null;
};

export async function listProspectActivities(
  prospectId: string,
): Promise<ProspectActivityWithAuthor[]> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        activity: prospectActivities,
        authorName: userProfiles.fullName,
      })
      .from(prospectActivities)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, prospectActivities.createdByUserProfileId),
      )
      .where(eq(prospectActivities.prospectId, prospectId))
      .orderBy(desc(prospectActivities.occurredAt));
    return rows.map((r) => ({ ...r.activity, authorName: r.authorName }));
  });
}
