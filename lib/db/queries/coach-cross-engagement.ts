/**
 * Coach cross-engagement queries.
 *
 * Phase 2.5. Each function returns rows from one module across every
 * engagement the calling coach owns. Uses `withSystemContext` (RLS
 * off) because we deliberately span multiple tenants — same pattern
 * as `listCoachActionItems`.
 *
 * All queries gate on `coaches.user_profile_id = caller`. If the
 * caller isn't a coach, returns empty.
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
  subscriptionAssets,
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

export type CoachSubscriptionRow = {
  id: string;
  name: string;
  vendor: string;
  monthlyCostCents: number;
  currency: string;
  transferStatus: string;
  renewalDate: Date | null;
  engagementId: string;
  engagementName: string | null;
  billingProvider: string | null;
  billingExternalUrl: string | null;
};

export async function listCoachSubscriptions(): Promise<
  CoachSubscriptionRow[]
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  const cid = await coachId(profile.userProfileId);
  if (!cid) return [];
  // The billing-link columns (billing_provider, billing_external_url)
  // landed in migration 0031. If a production database hasn't applied
  // that migration yet, the full SELECT will throw with "column does
  // not exist." We attempt the full query first, and on failure fall
  // back to the pre-0031 column set — the Console page renders without
  // billing pills until the migration runs.
  return withSystemContext(async (tx) => {
    try {
      const rows = await tx
        .select({
          id: subscriptionAssets.id,
          name: subscriptionAssets.name,
          vendor: subscriptionAssets.vendor,
          monthlyCostCents: subscriptionAssets.monthlyCostCents,
          currency: subscriptionAssets.currency,
          transferStatus: subscriptionAssets.transferStatus,
          renewalDate: subscriptionAssets.renewalDate,
          engagementId: subscriptionAssets.engagementId,
          engagementName: engagements.name,
          billingProvider: subscriptionAssets.billingProvider,
          billingExternalUrl: subscriptionAssets.billingExternalUrl,
        })
        .from(subscriptionAssets)
        .innerJoin(
          engagements,
          eq(engagements.id, subscriptionAssets.engagementId),
        )
        .where(eq(engagements.coachId, cid))
        .orderBy(subscriptionAssets.renewalDate);
      return rows.map((r) => ({
        ...r,
        monthlyCostCents: Number(r.monthlyCostCents),
      }));
    } catch (e) {
      console.warn(
        "[listCoachSubscriptions] billing columns may be missing — falling back. Apply migration 0031_subscription_billing_links.sql to remove this fallback.",
        e instanceof Error ? e.message : e,
      );
      const rows = await tx
        .select({
          id: subscriptionAssets.id,
          name: subscriptionAssets.name,
          vendor: subscriptionAssets.vendor,
          monthlyCostCents: subscriptionAssets.monthlyCostCents,
          currency: subscriptionAssets.currency,
          transferStatus: subscriptionAssets.transferStatus,
          renewalDate: subscriptionAssets.renewalDate,
          engagementId: subscriptionAssets.engagementId,
          engagementName: engagements.name,
        })
        .from(subscriptionAssets)
        .innerJoin(
          engagements,
          eq(engagements.id, subscriptionAssets.engagementId),
        )
        .where(eq(engagements.coachId, cid))
        .orderBy(subscriptionAssets.renewalDate);
      return rows.map((r) => ({
        ...r,
        monthlyCostCents: Number(r.monthlyCostCents),
        billingProvider: null,
        billingExternalUrl: null,
      }));
    }
  });
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
