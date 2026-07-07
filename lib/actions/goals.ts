"use server";

/**
 * Goals — server actions.
 *
 * Phase 1.10. SMART goals tied to top-line revenue or margin (Quality
 * Gate). Surface: create, update, delete, plus a status-only fast
 * path mirroring action items.
 *
 * Authorization: leadership-only writes (master_admin / Coach /
 * client_lead / client_manager). client_employee / prospect can VIEW
 * but not edit.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { clientWriteBlocked, READ_ONLY_ERROR } from "@/lib/server/engagement-guard";
import { goals, type UserProfile } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];

const LEADERSHIP_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
  "client_manager",
];
function canEdit(role: Role): boolean {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role);
}

const statusEnum = z.enum([
  "open",
  "in_progress",
  "achieved",
  "missed",
  "abandoned",
]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(20000).nullable().optional(),
  targetMetric: z.string().max(200).nullable().optional(),
  targetValue: z.string().max(200).nullable().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  status: statusEnum.default("open"),
  revenueImpact: z.boolean().default(false),
  marginImpact: z.boolean().default(false),
  ownerUserProfileId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial().omit({ engagementId: true });

export type CreateGoalInput = z.input<typeof createSchema>;
export type UpdateGoalInput = z.input<typeof updateSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateGoalPaths() {
  revalidatePath("/portal/goals");
  revalidatePath("/business-builder/goals");
}

export async function createGoal(
  input: CreateGoalInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't create goals." };
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  if (await clientWriteBlocked(profile.role, data.engagementId)) {
    return { ok: false, error: READ_ONLY_ERROR };
  }
  if (!data.revenueImpact && !data.marginImpact) {
    return {
      ok: false,
      error:
        "Goals must move top-line revenue, protect margin, or both. Tag at least one.",
    };
  }

  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
      const [row] = await tx
        .insert(goals)
        .values({
          orgId: boundOrgId,
          engagementId: data.engagementId,
          title: data.title,
          description: data.description ?? null,
          targetMetric: data.targetMetric ?? null,
          targetValue: data.targetValue ?? null,
          targetDate: data.targetDate ? new Date(data.targetDate) : null,
          status: data.status,
          revenueImpact: data.revenueImpact,
          marginImpact: data.marginImpact,
          ownerUserProfileId: data.ownerUserProfileId ?? null,
        })
        .returning({ id: goals.id });
      return row;
    },
    );
    revalidateGoalPaths();
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateGoal(
  id: string,
  input: UpdateGoalInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't edit goals." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  try {
    const lookupEngId = await resolveEngagementIdFromRecord("goals", id);
    if (!lookupEngId) {
      return { ok: false, error: "Goal not found." };
    }
    if (await clientWriteBlocked(profile.role, lookupEngId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }
    await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(goals)
          .where(eq(goals.id, id))
          .limit(1);
        if (!existing) throw new Error("Goal not found.");

        const update: Partial<typeof goals.$inferInsert> = {};
        if (data.title !== undefined) update.title = data.title;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.targetMetric !== undefined)
          update.targetMetric = data.targetMetric;
        if (data.targetValue !== undefined)
          update.targetValue = data.targetValue;
        if (data.targetDate !== undefined)
          update.targetDate = data.targetDate
            ? new Date(data.targetDate)
            : null;
        if (data.status !== undefined) update.status = data.status;
        if (data.revenueImpact !== undefined)
          update.revenueImpact = data.revenueImpact;
        if (data.marginImpact !== undefined)
          update.marginImpact = data.marginImpact;
        if (data.ownerUserProfileId !== undefined)
          update.ownerUserProfileId = data.ownerUserProfileId;

        const finalRevenue = update.revenueImpact ?? existing.revenueImpact;
        const finalMargin = update.marginImpact ?? existing.marginImpact;
        if (!finalRevenue && !finalMargin) {
          throw new Error(
            "Goals must move top-line revenue, protect margin, or both.",
          );
        }
        if (Object.keys(update).length === 0) return;
        await tx.update(goals).set(update).where(eq(goals.id, id));
      },
    );
    revalidateGoalPaths();
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't delete goals." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }
  try {
    const lookupEngId = await resolveEngagementIdFromRecord("goals", id);
    if (!lookupEngId) {
      return { ok: false, error: "Goal not found." };
    }
    if (await clientWriteBlocked(profile.role, lookupEngId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }
    await withEngagementContext(
      profile.orgId,
      profile.role,
      lookupEngId,
      async (tx) => {
        await tx.delete(goals).where(eq(goals.id, id));
      },
    );
    revalidateGoalPaths();
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
