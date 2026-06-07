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

import { and, desc, eq, isNotNull } from "drizzle-orm";
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
  const cid = await coachId(profile.userProfileId);
  if (!cid) return [];
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
      .where(eq(engagements.coachId, cid))
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
  const cid = await coachId(profile.userProfileId);
  if (!cid) return [];
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
      .where(eq(engagements.coachId, cid))
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
  const cid = await coachId(profile.userProfileId);
  if (!cid) return [];
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
      .where(eq(engagements.coachId, cid))
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
  const cid = await coachId(profile.userProfileId);
  if (!cid) return [];
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
      .where(eq(engagements.coachId, cid))
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
  const cid = await coachId(profile.userProfileId);
  if (!cid) return [];
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
          eq(engagements.coachId, cid),
          eq(bbsSessions.status, "scheduled"),
          isNotNull(bbsSessions.scheduledAt),
        ),
      )
      .orderBy(bbsSessions.scheduledAt),
  );
}
