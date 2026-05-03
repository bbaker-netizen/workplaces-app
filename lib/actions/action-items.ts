"use server";

/**
 * Action Items — server actions (mutations).
 *
 * Phase 1.2 surface for create / update / delete. Reads live in
 * `lib/db/queries/action-items.ts`. Notifications fan out on assignment
 * (sent_via='in_app' for now; email triggers added in Phase 1.4 with
 * Resend).
 *
 * Role-based authorization (per CLAUDE.md role enum):
 *   - master_admin / coach / client_lead: full edit on items in their
 *     engagements (create, update any field, delete).
 *   - client_manager / client_employee: status-only updates, and only on
 *     items where they are the assignee.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  actionItems,
  notifications,
  type UserProfile,
} from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

type Role = UserProfile["role"];

const FULL_EDITOR_ROLES: ReadonlyArray<Role> = [
  "master_admin",
  "coach",
  "client_lead",
];

function canEditAnything(role: Role): boolean {
  return (FULL_EDITOR_ROLES as readonly string[]).includes(role);
}

const statusEnum = z.enum([
  "draft",
  "open",
  "in_progress",
  "done",
  "blocked",
]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(10000).nullable().optional(),
  status: statusEnum.default("open"),
  assigneeUserProfileId: z.string().uuid().nullable().optional(),
  // YYYY-MM-DD or null. Form sends ISO date; null = no due date.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  revenueImpact: z.boolean().default(false),
  marginImpact: z.boolean().default(false),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: statusEnum.optional(),
  assigneeUserProfileId: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  revenueImpact: z.boolean().optional(),
  marginImpact: z.boolean().optional(),
});

export type CreateActionItemInput = z.input<typeof createSchema>;
export type UpdateActionItemInput = z.input<typeof updateSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateActionItemPaths() {
  revalidatePath("/portal/action-items");
  revalidatePath("/coach/action-items");
}

export async function createActionItem(
  input: CreateActionItemInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEditAnything(profile.role)) {
    return {
      ok: false,
      error: "Your role can't create action items.",
    };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const created = await withTenantContext(profile.orgId, async (tx) => {
      const [item] = await tx
        .insert(actionItems)
        .values({
          orgId: profile.orgId,
          engagementId: data.engagementId,
          title: data.title,
          description: data.description ?? null,
          status: data.status,
          assigneeUserProfileId: data.assigneeUserProfileId ?? null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          revenueImpact: data.revenueImpact,
          marginImpact: data.marginImpact,
          createdBy: "coach",
        })
        .returning({ id: actionItems.id });

      // Notify assignee if it's not the creator.
      if (
        data.assigneeUserProfileId &&
        data.assigneeUserProfileId !== profile.userProfileId
      ) {
        await tx.insert(notifications).values({
          orgId: profile.orgId,
          userProfileId: data.assigneeUserProfileId,
          type: "action_item_assigned",
          parentEntityType: "action_item",
          parentEntityId: item.id,
          sentVia: "in_app",
        });
      }

      return item;
    });

    revalidateActionItemPaths();
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateActionItem(
  id: string,
  input: UpdateActionItemInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
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
    await withTenantContext(profile.orgId, async (tx) => {
      // Read existing — RLS already scopes to the user's org.
      const [existing] = await tx
        .select()
        .from(actionItems)
        .where(eq(actionItems.id, id))
        .limit(1);
      if (!existing) {
        throw new Error("Action item not found.");
      }

      // Role-based field restrictions.
      if (!canEditAnything(profile.role)) {
        const isAssignee =
          existing.assigneeUserProfileId === profile.userProfileId;
        if (!isAssignee) {
          throw new Error("You can only update items assigned to you.");
        }
        const restrictedKeys = [
          "title",
          "description",
          "assigneeUserProfileId",
          "dueDate",
          "revenueImpact",
          "marginImpact",
        ] as const;
        for (const key of restrictedKeys) {
          if (data[key] !== undefined) {
            throw new Error(
              `Your role can update status only — not ${key}.`,
            );
          }
        }
      }

      // Build the partial update payload.
      const update: Partial<typeof actionItems.$inferInsert> = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.description !== undefined) update.description = data.description;
      if (data.status !== undefined) update.status = data.status;
      if (data.assigneeUserProfileId !== undefined)
        update.assigneeUserProfileId = data.assigneeUserProfileId;
      if (data.dueDate !== undefined)
        update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (data.revenueImpact !== undefined)
        update.revenueImpact = data.revenueImpact;
      if (data.marginImpact !== undefined)
        update.marginImpact = data.marginImpact;

      if (Object.keys(update).length === 0) return; // no-op

      const [updated] = await tx
        .update(actionItems)
        .set(update)
        .where(eq(actionItems.id, id))
        .returning();

      // Notify on reassignment to a different user (and not self-assign).
      const newAssignee = data.assigneeUserProfileId;
      if (
        newAssignee !== undefined &&
        newAssignee !== existing.assigneeUserProfileId &&
        newAssignee &&
        newAssignee !== profile.userProfileId
      ) {
        await tx.insert(notifications).values({
          orgId: profile.orgId,
          userProfileId: newAssignee,
          type: "action_item_assigned",
          parentEntityType: "action_item",
          parentEntityId: updated.id,
          sentVia: "in_app",
        });
      }
    });

    revalidateActionItemPaths();
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteActionItem(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEditAnything(profile.role)) {
    return {
      ok: false,
      error: "Your role can't delete action items.",
    };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  try {
    await withTenantContext(profile.orgId, async (tx) => {
      // RLS scopes the delete to our org.
      await tx.delete(actionItems).where(eq(actionItems.id, id));
    });
    revalidateActionItemPaths();
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
