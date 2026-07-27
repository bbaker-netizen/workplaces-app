/**
 * Prospects queries — Coach Pipeline + per-prospect detail.
 * Phase 5 — CRM expansion.
 */

import { and, desc, eq, isNull, or, type SQL } from "drizzle-orm";
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
import { ensureUserProfile } from "@/lib/db/provisioning";
import { getClientScope } from "@/lib/db/queries/business-builder-cross-engagement";
import {
  canCurrentBbAccessEngagement,
  getCurrentBbAccess,
} from "@/lib/db/queries/bb-access";

export type PipelineProspect = Prospect & {
  ownerName: string | null;
  /** Lifetime payments (cents) from the converted engagement's QBO
   *  customer, if any. The prospect's own `qboLifetimePaymentsCents`
   *  (a direct link) takes precedence; this is the fallback for clients
   *  linked via an engagement instead. */
  engagementQboLifetimePaymentsCents: number | null;
  /** The converted engagement's program/type ("accelerator" |
   *  "implementer"), used as the fallback for the Program column when the
   *  prospect's own programType isn't set. */
  engagementType: string | null;
};

/**
 * Owner predicate for the pipeline list.
 *
 * "Mine" means prospects I own OR prospects nobody owns yet. The second
 * half is load-bearing: the lead webhooks (`/api/leads`, `/api/leads/
 * [token]` — the website contact form and the Meta / Google ad forms)
 * never set `owner_user_profile_id`; only a hand-created prospect gets
 * one. Scoping strictly to `owner = me` would therefore hide every
 * inbound lead from BOTH Business Builders until somebody claimed it —
 * and nobody would, because nobody could see it. Unowned leads are up
 * for grabs and stay visible to everyone.
 *
 * Returns `undefined` when the caller is looking at all clients.
 */
async function prospectScopeWhere(): Promise<SQL | undefined> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return undefined;
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return undefined;
  }
  if ((await getClientScope()) === "all") return undefined;
  return or(
    eq(prospects.ownerUserProfileId, profile.userProfileId),
    isNull(prospects.ownerUserProfileId),
  );
}

export async function listProspects(): Promise<PipelineProspect[]> {
  const ownerWhere = await prospectScopeWhere();
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
        engagementQboLifetimePaymentsCents:
          engagements.qboLifetimePaymentsCents,
        engagementType: engagements.type,
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
      .where(and(eq(prospects.orgId, master.id), ownerWhere))
      .orderBy(desc(prospects.updatedAt));
    return rows.map((r) => ({
      ...r.prospect,
      ownerName: r.ownerName,
      engagementQboLifetimePaymentsCents: r.engagementQboLifetimePaymentsCents,
      engagementType: r.engagementType,
    }));
  });
}

/**
 * Fetch one prospect by id — access-checked.
 *
 * The list is scoped by `prospectScopeWhere`, but a scoped LIST is not a
 * boundary on its own: without this check a Business Builder reaches any
 * lead in the practice by pasting its id into the URL. A coach may open a
 * prospect they own, one nobody has claimed (same rule as the list — unowned
 * inbound leads are up for grabs, and the lead webhooks never set an owner),
 * or one whose converted engagement they can already access. The master
 * admin, and any Builder explicitly granted practice-wide reach, sees all.
 */
export async function getProspect(id: string): Promise<PipelineProspect | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  const isBb =
    profile.role === "master_admin" || profile.role === "coach";
  if (!isBb) return null;
  const access = await getCurrentBbAccess();
  const unrestricted = access.isMasterAdmin || access.allClientsAccess;

  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        prospect: prospects,
        ownerName: userProfiles.fullName,
        engagementQboLifetimePaymentsCents:
          engagements.qboLifetimePaymentsCents,
        engagementType: engagements.type,
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

    if (!unrestricted) {
      const owner = row.prospect.ownerUserProfileId;
      const mineOrUnclaimed =
        owner === null || owner === profile.userProfileId;
      if (!mineOrUnclaimed) {
        // Converted prospects follow their engagement: if this Builder can
        // work the client, they can see the lead it came from.
        const converted = row.prospect.convertedEngagementId;
        if (
          !converted ||
          !(await canCurrentBbAccessEngagement(converted))
        ) {
          return null;
        }
      }
    }

    return {
      ...row.prospect,
      ownerName: row.ownerName,
      engagementQboLifetimePaymentsCents:
        row.engagementQboLifetimePaymentsCents,
      engagementType: row.engagementType,
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
