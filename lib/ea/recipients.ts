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
 * The access rules mirror `listCoachEngagements` — everyone, master
 * admin included, gets their OWN book (the clients they are the assigned
 * coach on, plus any with no coach yet); a restricted Business Builder
 * sees only their explicit grants. Duplicating the rule rather than
 * importing it is deliberate: the original is session-bound and cannot
 * be called here. **If the access model changes, both must change** —
 * that is not a caution, it is a bug this module already shipped. The
 * master-admin arm returned the whole practice for two days after
 * own-book-by-default landed on 2026-07-26, so Bruce's briefing carried
 * Jen's clients.
 */

import { and, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
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

  // The master admin gets their OWN book, not the practice's. This used
  // to return every active engagement, which is what put Jen's clients
  // in Bruce's morning briefing — the briefing is "your day", and a day
  // that includes someone else's clients is noise you have to filter by
  // hand every morning.
  //
  // Mirrors `coachScopeWhere`: mine, PLUS anything with no coach yet, so
  // an unassigned client can't fall out of every Builder's view at once.
  // The in-app mine/all toggle has no equivalent here on purpose — it is
  // a cookie, and a cron has no browser to read one from. Own book is
  // the right default for a personal briefing; the whole practice is
  // what the app is for.
  if (recipient.role === "master_admin") {
    const [masterCoach] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, recipient.userProfileId))
      .limit(1);
    // No coaches row — fall back to unclaimed engagements only, rather
    // than to everything. Better a thin briefing than another person's.
    const mine = masterCoach
      ? or(eq(engagements.coachId, masterCoach.id), isNull(engagements.coachId))
      : isNull(engagements.coachId);
    // Plus anything the other Builder has shared with them. A shared
    // client IS your day — that is the whole point of sharing it, and
    // the master admin is on the receiving end of a share as often as
    // the giving end.
    const adminShared = await tx
      .select({ engagementId: bbClientAccess.engagementId })
      .from(bbClientAccess)
      .where(eq(bbClientAccess.coachUserProfileId, recipient.userProfileId));
    const scope =
      adminShared.length > 0
        ? or(
            mine,
            inArray(
              engagements.id,
              adminShared.map((g) => g.engagementId),
            ),
          )
        : mine;
    return tx
      .select()
      .from(engagements)
      .where(and(scope, notArchived, notInternal));
  }

  // Own book PLUS anything shared, for every coach — whether or not
  // they hold all-clients permission.
  //
  // **This branch used to read grants INSTEAD of ownership**, and return
  // [] when there were none. Migration 0093 flipped
  // `all_clients_access` to false for every coach, so from that deploy
  // Jen — false, zero grants, one client owned outright — received a
  // briefing covering NO engagements every weekday morning. It reported
  // success and said nothing, which is indistinguishable from a quiet
  // week: the same silent-failure shape as every dead cron in
  // CLAUDE.md, and the reason ownership and sharing are now one rule
  // here rather than two branches that disagree.
  const [coach] = await tx
    .select({ id: coaches.id })
    .from(coaches)
    .where(eq(coaches.userProfileId, recipient.userProfileId))
    .limit(1);

  const grants = await tx
    .select({ engagementId: bbClientAccess.engagementId })
    .from(bbClientAccess)
    .where(eq(bbClientAccess.coachUserProfileId, recipient.userProfileId));
  const sharedIds = grants.map((g) => g.engagementId);

  const clauses: SQL[] = [];
  if (coach) clauses.push(eq(engagements.coachId, coach.id));
  if (sharedIds.length > 0) clauses.push(inArray(engagements.id, sharedIds));
  if (clauses.length === 0) return [];

  return tx
    .select()
    .from(engagements)
    .where(
      and(
        clauses.length === 1 ? clauses[0] : or(...clauses),
        notArchived,
        notInternal,
      ),
    );
}

/** Display name for an engagement — `name` is nullable in the schema. */
export function engagementLabel(e: { name: string | null; id: string }): string {
  return e.name?.trim() || `Engagement ${e.id.slice(0, 8)}`;
}
