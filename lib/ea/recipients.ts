/**
 * Who the EA works for, and which clients each of them can see —
 * resolved WITHOUT a signed-in user.
 *
 * This module exists because of the trap this repo has already paid for
 * once: `withEngagementContext` and every query built on
 * `ensureUserProfile()` assume a Clerk session. There is no session in a
 * cron run, so those helpers deny every engagement and the job silently
 * does nothing while reporting success. Every EA background job resolves
 * its subjects through here, under `withSystemContext`, instead.
 *
 * The access rules mirror `listCoachEngagements` exactly — master admins
 * see every active client, a restricted Business Builder sees only their
 * explicit grants, and a default Builder sees the clients they are the
 * assigned coach on. Duplicating the rule rather than importing it is
 * deliberate: the original is session-bound and cannot be called here.
 * If the access model changes, both must change.
 */

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  bbClientAccess,
  coaches,
  engagements,
  orgs,
  userProfiles,
  type Engagement,
} from "@/lib/db/schema";
import { withSystemContext, type Tx } from "@/lib/db/tenant";

export type EaRecipient = {
  userProfileId: string;
  orgId: string;
  fullName: string;
  /** The address the digest is actually sent to (override applied). */
  email: string;
  role: string;
  allClientsAccess: boolean;
};

/**
 * Every active Business Builder who should receive EA mail.
 *
 * `master_admin` and `coach` in the MASTER org only. Scoping to the
 * master org matters: a client org could in principle carry a profile
 * with a coach-shaped role, and that person must never be handed a
 * briefing covering the whole book. Same reasoning as
 * `getBusinessBuilderProfiles` in lib/db/queries/user-profiles.ts.
 */
export async function listEaRecipients(): Promise<EaRecipient[]> {
  const rows = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];

    return tx
      .select({
        userProfileId: userProfiles.id,
        orgId: userProfiles.orgId,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        eaNotifyEmail: userProfiles.eaNotifyEmail,
        role: userProfiles.role,
        allClientsAccess: userProfiles.allClientsAccess,
      })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, master.id),
          inArray(userProfiles.role, ["master_admin", "coach"]),
        ),
      );
  });

  // Each Builder's own delivery address. `ea_notify_email` wins when set,
  // because the sign-in provider's address is not always the inbox the
  // person actually watches — and a daily briefing delivered somewhere
  // unwatched reports success while reaching nobody. Per-row, so two
  // Builders never collide (migration 0087 replaced a single global
  // override that would have done exactly that).
  return rows
    .map((r) => ({
      userProfileId: r.userProfileId,
      orgId: r.orgId,
      fullName: r.fullName,
      role: r.role,
      allClientsAccess: r.allClientsAccess,
      email: r.eaNotifyEmail?.trim() || r.email,
    }))
    .filter((r) => Boolean(r.email) && r.email.includes("@"));
}

/**
 * The engagements a given Business Builder is responsible for, resolved
 * without a session. Archived and internal engagements are excluded —
 * the internal workspace has its own Team surface and does not belong in
 * a client-facing briefing.
 */
export async function listEngagementsForRecipient(
  tx: Tx,
  recipient: EaRecipient,
): Promise<Engagement[]> {
  const notArchived = isNull(engagements.archivedAt);
  const notInternal = ne(engagements.isInternal, true);

  if (recipient.role === "master_admin") {
    return tx
      .select()
      .from(engagements)
      .where(and(notArchived, notInternal));
  }

  if (!recipient.allClientsAccess) {
    const grants = await tx
      .select({ engagementId: bbClientAccess.engagementId })
      .from(bbClientAccess)
      .where(eq(bbClientAccess.coachUserProfileId, recipient.userProfileId));
    const ids = grants.map((g) => g.engagementId);
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(engagements)
      .where(and(inArray(engagements.id, ids), notArchived, notInternal));
  }

  const [coach] = await tx
    .select({ id: coaches.id })
    .from(coaches)
    .where(eq(coaches.userProfileId, recipient.userProfileId))
    .limit(1);
  if (!coach) return [];

  return tx
    .select()
    .from(engagements)
    .where(and(eq(engagements.coachId, coach.id), notArchived, notInternal));
}

/** Display name for an engagement — `name` is nullable in the schema. */
export function engagementLabel(e: { name: string | null; id: string }): string {
  return e.name?.trim() || `Engagement ${e.id.slice(0, 8)}`;
}
