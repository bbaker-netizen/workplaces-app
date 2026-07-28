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

import { and, desc, eq, gte, isNotNull, isNull, or, type SQL } from "drizzle-orm";
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
import { getCurrentBbAccess } from "./bb-access";

/**
 * Cookie the "My clients / All clients" toggle sets.
 *
 * Named per user. A cookie belongs to the browser profile, not the
 * person, so a single shared name meant two Business Builders on one
 * machine flipped each other's scope — the same class of bug that let
 * one Builder's pipeline filters overwrite the other's.
 */
export const CLIENT_SCOPE_COOKIE = "bb_client_scope";

export function clientScopeCookieName(userProfileId: string): string {
  return `${CLIENT_SCOPE_COOKIE}_${userProfileId}`;
}

export type ClientScope = "mine" | "all";

/**
 * May this Business Builder look at everyone's clients?
 *
 * The master admin always can. A standard Business Builder can when they
 * hold `all_clients_access` — i.e. they haven't been restricted to an
 * explicit grant list. A restricted Builder never gets an "all" option,
 * because that would hand them the clients they were deliberately
 * fenced out of.
 */
export async function canSeeAllClients(): Promise<boolean> {
  const access = await getCurrentBbAccess();
  if (!access.isBusinessBuilder) return false;
  return access.isMasterAdmin || access.allClientsAccess;
}

/**
 * Current client scope for the Business Builder views.
 *
 * EVERYONE defaults to "mine" — your own book is the working view, and
 * the whole practice's book is the deliberate exception you opt into.
 * (This used to default the master admin to "all", which is why the
 * pipeline showed every Builder's prospects to every Builder.)
 */
export async function getClientScope(): Promise<ClientScope> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return "mine";
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return "mine";
  }
  if (!(await canSeeAllClients())) return "mine";
  const v = (await cookies()).get(
    clientScopeCookieName(profile.userProfileId),
  )?.value;
  return v === "all" ? "all" : "mine";
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
 *   - `undefined` — no filter, i.e. ALL clients ("all" scope, opted into),
 *   - `false` — the caller has no coach row, so show nothing.
 *
 * Every Business Builder — master admin included — is scoped to their own
 * clients by default and opts into the whole practice's book with the
 * toggle. Same rule for everyone; the only difference between people is
 * whether they're ALLOWED to flip it (see `canSeeAllClients`).
 */
export async function coachScopeWhere(
  profile: OkProfile,
): Promise<SQL | undefined | false> {
  if ((await getClientScope()) === "all") return undefined;
  const cid = await coachId(profile.userProfileId);
  if (!cid) return false;
  // Mine, plus anything not yet assigned to a Business Builder — so work
  // on an unclaimed client can't fall out of everyone's view at once.
  return or(eq(engagements.coachId, cid), isNull(engagements.coachId));
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
  /** When it's due. Selected so the tracker can say what needs attention —
   *  without it the list was title + type + client and gave no reason to
   *  act on any particular row. */
  targetDate: Date | null;
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
        targetDate: deliverables.targetDate,
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
