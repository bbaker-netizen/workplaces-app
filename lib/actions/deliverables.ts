"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { deliverables, type UserProfile } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return (
    role === "master_admin" ||
    role === "coach" ||
    role === "client_lead" ||
    role === "client_manager"
  );
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const typeEnum = z.enum([
  "sop",
  "org_chart",
  "job_profile",
  "financial_dashboard",
  "onboarding_guide",
  "operations_setup_guide",
  "business_plan",
  "marketing_plan",
  "stages_of_growth_assessment",
]);
const statusEnum = z.enum([
  "not_started",
  "in_progress",
  "review",
  "delivered",
  "archived",
]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  type: typeEnum,
  title: z.string().min(1).max(500),
  description: z.string().max(20000).nullable().optional(),
  status: statusEnum.default("not_started"),
  documentId: z.string().uuid().nullable().optional(),
  /** Planning target — when this deliverable should ship. Optional;
   *  used by the engagement Gantt to plot the milestone diamond. */
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  revenueImpact: z.boolean().default(false),
  marginImpact: z.boolean().default(false),
});

const updateSchema = createSchema.partial().omit({ engagementId: true });

export async function createDeliverable(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't create deliverables." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    const created = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        const [row] = await tx
          .insert(deliverables)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            type: data.type,
            title: data.title,
            description: data.description ?? null,
            status: data.status,
            documentId: data.documentId ?? null,
            targetDate: data.targetDate ? new Date(data.targetDate) : null,
            revenueImpact: data.revenueImpact,
            marginImpact: data.marginImpact,
          })
          .returning({ id: deliverables.id });
        return row;
      },
    );
    revalidatePath("/portal/deliverables");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateDeliverable(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't edit deliverables." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "deliverables",
    id,
  );
  if (!engagementId) return { ok: false, error: "Not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const update: Partial<typeof deliverables.$inferInsert> = {};
        if (data.type !== undefined) update.type = data.type;
        if (data.title !== undefined) update.title = data.title;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.status !== undefined) {
          update.status = data.status;
          if (data.status === "delivered") update.deliveredAt = new Date();
        }
        if (data.documentId !== undefined)
          update.documentId = data.documentId;
        if (data.targetDate !== undefined)
          update.targetDate = data.targetDate ? new Date(data.targetDate) : null;
        if (data.revenueImpact !== undefined)
          update.revenueImpact = data.revenueImpact;
        if (data.marginImpact !== undefined)
          update.marginImpact = data.marginImpact;
        if (Object.keys(update).length === 0) return;
        await tx
          .update(deliverables)
          .set(update)
          .where(eq(deliverables.id, id));
      },
    );
    revalidatePath("/portal/deliverables");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteDeliverable(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't delete deliverables." };
  const engagementId = await resolveEngagementIdFromRecord(
    "deliverables",
    id,
  );
  if (!engagementId) return { ok: false, error: "Not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(deliverables).where(eq(deliverables.id, id));
      },
    );
    revalidatePath("/portal/deliverables");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
