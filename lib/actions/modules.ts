"use server";

/**
 * Portal module assignment actions.
 *
 * Phase 3.1. Business Builders only writes — set / unset / reorder modules per
 * engagement. Default is "everything enabled" so an absent row means
 * the module is visible.
 */

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  portalModuleAssignments,
  type UserProfile,
} from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const moduleEnum = z.enum([
  "action_items",
  "goals",
  "projects",
  "sessions",
  "soul_file",
  "deliverables",
  "communication",
  "documents",
  "courses",
  "forms",
  "team",
  "invoices",
  "methodology",
  "embedded_apps",
  "subscriptions",
  "hiring",
]);

const setSchema = z.object({
  engagementId: z.string().uuid(),
  module: moduleEnum,
  isEnabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export async function setModuleEnabled(
  input: z.input<typeof setSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Business Builders only." };
  const parsed = setSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
        await tx.execute(
          sql`INSERT INTO portal_module_assignments (org_id, engagement_id, module, is_enabled, sort_order)
              VALUES (${boundOrgId}, ${data.engagementId}, ${data.module}, ${data.isEnabled}, ${data.sortOrder ?? 0})
              ON CONFLICT (engagement_id, module) DO UPDATE
                SET is_enabled = EXCLUDED.is_enabled,
                    sort_order = COALESCE(EXCLUDED.sort_order, portal_module_assignments.sort_order)`,
        );
      },
    );
    revalidatePath("/portal");
    revalidatePath(`/coach`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function clearModuleAssignment(
  engagementId: string,
  module: z.infer<typeof moduleEnum>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Business Builders only." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx
          .delete(portalModuleAssignments)
          .where(
            and(
              eq(portalModuleAssignments.engagementId, engagementId),
              eq(portalModuleAssignments.module, module),
            ),
          );
      },
    );
    revalidatePath("/portal");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
