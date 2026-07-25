/**
 * Coach cross-engagement queries.
 *
 * Phase 2.5. Each function returns rows from one module across every
 * engagement the calling Coach owns. Uses `withSystemContext` (RLS
 * off) because we deliberately span multiple tenants — same pattern
 * as `listCoachActionItems`.
 *
 * All queries gate on `coaches.user_profile_id = caller`. If the
 * caller isn't a Coach, returns empty.
 */

import { and, desc, eq, gte, isNotNull, type SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  bbsSessions,
  coaches,
  deliverables,
  engagements,
  goals,
  hires,
  projects,
} from "../schema";
import { withSystemContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";

/** Cookie the "My clients / All clients" toggle sets (master admin only). */
export const CLIENT_SCOPE_COOKIE = "bb_client_scope";

export type ClientScope = "mine" | "all";

/**
 * Current client scope for the coach views. Master admin defaults to "all"
 * (oversight) and can flip to "mine"; everyone else is always "mine".
 */
export async function getClientScope(): Promise<ClientScope> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok" || profile.role !== "master_admin") return "mine";
  const v = (await cookies()).get(CLIENT_SCOPE_COOKIE)?.value;
  return v === "mine" ? "mine" : "all";
}

async function coachId(userProfileId: string): Promise<string | null> {
  return withSystemContext(async (tx) => {
    const [c] = await tx
      .select({ id: coaches.id })
      .from(coaches)
      .where(eq(coaches.userProfileId, userProfileId))
      .limit(1);
    return c?.id ?? null;
  });
}

type OkProfile = Extract<
  Awaited<ReturnType<typeof ensureUserProfile>>,
  { status: "ok" }
>;

/**
 * The engagements.coachId filter for the calling Business Builder's
 * cross-client views. Returns:
 *   - an `eq(coachId, mine)` condition — scope to my own clients,
 *   - `undefined` — no filter, i.e. ALL clients (master admin, "all" scope),
 *   - `false` — the caller has no coach row and no all-access, so show nothing.
 *
 * A standard Business Builder is always scoped to their own clients. A master
 * admin defaults to ALL clients (for oversight) and can flip to "just mine"
 * via the toggle, which sets the CLIENT_SCOPE_COOKIE.
 */
export async function coachScopeWhere(
  profile: OkProfile,
): Promise<SQL | undefined | false> {
  const cid = await coachId(profile.userProfileId);
  if (profile.role === "master_admin") {
    const scope = (await cookies()).get(CLIENT_SCOPE_COOKIE)?.value;
    if (scope === "mine") return cid ? eq(engagements.coachId, cid) : false;
    return undefined; // all clients
  }
  return cid ? eq(engagements.coachId, cid) : false;
}

export type CoachProjectRow = {
  id: string;
  name: string;
  status: string;
  targetDate: Date | null;
  engagementId: string;
  engagementName: string | null;
};

export async function listCoachProjects(): Promise<CoachProjectRow[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const where = await coachScopeWhere(profile);
  if (where === false) return [];
  return withSystemContext(async (tx) =>
    tx
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        targetDate: projects.targetDate,
        engagementId: projects.engagementId,
        engagementName: engagements.name,
      })
      .from(projects)
      .innerJoin(engagements, eq(engagements.id, projects.engagementId))
      .where(where)
      .orderBy(desc(projects.updatedAt)),
  );
}

export type CoachHireRow = {
  id: string;
  candidateName: string;
  roleName: string;
  status: string;
  engagementId: string;
  engagementName: string | null;
};

export async function listCoachHires(): Promise<CoachHireRow[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const where = await coachScopeWhere(profile);
  if (where === false) return [];
  return withSystemContext(async (tx) =>
    tx
      .select({
        id: hires.id,
        candidateName: hires.candidateName,
        roleName: hires.roleName,
        status: hires.status,
        engagementId: hires.engagementId,
        engagementName: engagements.name,
      })
      .from(hires)
      .innerJoin(engagements, eq(engagements.id, hires.engagementId))
      .where(where)
      .orderBy(desc(hires.updatedAt)),
  );
}

export type CoachDeliverableRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  engagementId: string;
  engagementName: string | null;
};

export async function listCoachDeliverables(): Promise<CoachDeliverableRow[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const where = await coachScopeWhere(profile);
  if (where === false) return [];
  return withSystemContext(async (tx) =>
    tx
      .select({
        id: deliverables.id,
        title: deliverables.title,
        type: deliverables.type,
        status: deliverables.status,
        engagementId: deliverables.engagementId,
        engagementName: engagements.name,
      })
      .from(deliverables)
      .innerJoin(engagements, eq(engagements.id, deliverables.engagementId))
      .where(where)
      .orderBy(desc(deliverables.updatedAt)),
  );
}

export type CoachGoalRow = {
  id: string;
  title: string;
  status: string;
  targetDate: Date | null;
  engagementId: string;
  engagementName: string | null;
};

export async function listCoachGoals(): Promise<CoachGoalRow[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const where = await coachScopeWhere(profile);
  if (where === false) return [];
  return withSystemContext(async (tx) =>
    tx
      .select({
        id: goals.id,
        title: goals.title,
        status: goals.status,
        targetDate: goals.targetDate,
        engagementId: goals.engagementId,
        engagementName: engagements.name,
      })
      .from(goals)
      .innerJoin(engagements, eq(engagements.id, goals.engagementId))
      .where(where)
      .orderBy(desc(goals.updatedAt)),
  );
}

export type CoachUpcomingSession = {
  id: string;
  scheduledAt: Date;
  type: string;
  engagementId: string;
  engagementName: string | null;
};

export async function listCoachUpcomingSessions(): Promise<
  CoachUpcomingSession[]
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const where = await coachScopeWhere(profile);
  if (where === false) return [];
  // Only sessions from now onward count as "upcoming". Without this,
  // past sessions that were never marked completed (still status
  // "scheduled") sort to the top and masquerade as upcoming. Matches the
  // sidebar pulse's next-session filter.
  const now = new Date();
  return withSystemContext(async (tx) =>
    tx
      .select({
        id: bbsSessions.id,
        scheduledAt: bbsSessions.scheduledAt,
        type: bbsSessions.type,
        engagementId: bbsSessions.engagementId,
        engagementName: engagements.name,
      })
      .from(bbsSessions)
      .innerJoin(engagements, eq(engagements.id, bbsSessions.engagementId))
      .where(
        and(
          where,
          eq(bbsSessions.status, "scheduled"),
          isNotNull(bbsSessions.scheduledAt),
          gte(bbsSessions.scheduledAt, now),
        ),
      )
      .orderBy(bbsSessions.scheduledAt),
  );
}
