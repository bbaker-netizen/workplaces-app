/**
 * The internal team workspace.
 *
 * The practice's own engagement row — Bruce, Jen, and any future
 * Business Builder tasking each other and running their touch-bases.
 * Marked by `engagements.is_internal`, one per master org (enforced by
 * a partial unique index).
 *
 * Why an engagement row rather than a parallel set of tables: action
 * item assignment, in-app notifications, the assignment email, the
 * due-soon reminder cron, and the My Work view are all engagement-
 * scoped already. Riding on a real engagement means every one of those
 * works internally on day one with no second implementation to keep in
 * sync. The `is_internal` flag is what keeps internal work out of the
 * client-facing lists.
 *
 * The engagement is created on first use rather than by a setup script,
 * so there's nothing for Bruce to run before the Team module works.
 */

import { and, eq } from "drizzle-orm";
import {
  coaches,
  engagements,
  orgs,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export const INTERNAL_WORKSPACE_NAME = "Workplaces Team";

/** Roles that belong to the practice rather than a client. */
export const INTERNAL_ROLES: ReadonlyArray<UserProfile["role"]> = [
  "master_admin",
  "coach",
];

export function isInternalRole(role: string): boolean {
  return (INTERNAL_ROLES as readonly string[]).includes(role);
}

/**
 * Resolve the internal workspace engagement id, creating it if this is
 * the first time anyone has opened the Team module.
 *
 * System context: the row lives in the master org and this runs before
 * we have an engagement to bind RLS to. Callers must still be checked
 * with `isInternalRole` — this function does no authorization of its
 * own.
 *
 * Returns null when there's no master org or no coach row to own the
 * engagement (a fresh install that hasn't been provisioned yet).
 */
export async function ensureInternalEngagementId(): Promise<string | null> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return null;

    const [existing] = await tx
      .select({ id: engagements.id })
      .from(engagements)
      .where(
        and(
          eq(engagements.orgId, master.id),
          eq(engagements.isInternal, true),
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    // `coach_id` is NOT NULL on engagements. Any active coach in the
    // master org will do — the internal workspace isn't "owned" by one
    // Business Builder the way a client engagement is, and every
    // internal role can reach it (see `canAccessInternalWorkspace`).
    const [owner] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(
        and(eq(coaches.orgId, master.id), eq(coaches.status, "active")),
      )
      .limit(1);
    if (!owner) return null;

    // ON CONFLICT targets `engagements_internal_uniq` explicitly rather
    // than using a bare DO NOTHING. Untargeted, this would also swallow
    // a conflict on ANY other unique index on `engagements` (e.g. the
    // slug index) — the insert would silently no-op and the caller would
    // surface "no active Business Builder", a completely misleading
    // error. Targeted, only a genuine concurrent-provision race is
    // absorbed, which is the case we actually want to tolerate: two
    // tabs opening the Team module at once can't mint two workspaces.
    const [created] = await tx
      .insert(engagements)
      .values({
        orgId: master.id,
        coachId: owner.id,
        type: "implementer",
        status: "active",
        name: INTERNAL_WORKSPACE_NAME,
        isInternal: true,
        startedAt: new Date(),
      })
      .onConflictDoNothing({
        // `where` is the arbiter index's predicate, which is what makes
        // this resolve to the PARTIAL index engagements_internal_uniq
        // rather than any other unique index on the table.
        target: engagements.orgId,
        where: eq(engagements.isInternal, true),
      })
      .returning({ id: engagements.id });
    if (created) return created.id;

    // Lost the race — read back the winner.
    const [winner] = await tx
      .select({ id: engagements.id })
      .from(engagements)
      .where(
        and(
          eq(engagements.orgId, master.id),
          eq(engagements.isInternal, true),
        ),
      )
      .limit(1);
    return winner?.id ?? null;
  });
}

/**
 * Read-only lookup — does NOT create. Use where a missing workspace
 * should render an empty state rather than provision one (background
 * jobs, cross-cutting list queries).
 */
export async function getInternalEngagementId(): Promise<string | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ id: engagements.id })
      .from(engagements)
      .innerJoin(orgs, eq(orgs.id, engagements.orgId))
      .where(
        and(eq(orgs.type, "master"), eq(engagements.isInternal, true)),
      )
      .limit(1);
    return row?.id ?? null;
  });
}

export type InternalTeammate = {
  userProfileId: string;
  fullName: string;
  email: string;
  role: UserProfile["role"];
};

/**
 * Everyone who can be assigned internal work: every master_admin and
 * coach in the master org. Per Bruce's direction, membership is derived
 * from role rather than configured per-person, so a new Business
 * Builder is a participant the moment they're provisioned.
 */
export async function listInternalTeammates(): Promise<InternalTeammate[]> {
  return withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [];

    const rows = await tx
      .select({
        userProfileId: userProfiles.id,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(eq(userProfiles.orgId, master.id));

    return rows
      .filter((r) => isInternalRole(r.role))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });
}
