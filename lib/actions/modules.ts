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
import { ALL_MODULES } from "@/lib/modules";
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

/**
 * Must stay in step with `portalModuleEnum` in schema.ts — this is the
 * Zod copy that guards the server boundary, and a value missing here is
 * rejected before it ever reaches the database.
 *
 * `calendar`, `notes` and `meetings` were added to the database enum and
 * to ALL_MODULES but never here, so toggling any of those three in the
 * portal manager failed with "Invalid input" — three of the twelve
 * switches on the panel simply did not work.
 */
const moduleEnum = z.enum([
  "action_items",
  "calendar",
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
  "notes",
  "meetings",
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
    revalidatePath(`/business-builder`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Record the current module selection as a deliberate choice.
 *
 * **Why this exists.** Onboarding's pre-flight asks whether anyone has
 * looked at this client's portal modules, and until now it inferred that
 * from "does an assignment row exist" — which is only ever written by
 * flipping a switch. So the commonest answer, "I looked, everything
 * should stay on, I changed nothing", left no trace and the check never
 * cleared. The operator was told to review the modules they had just
 * reviewed, with no way through short of toggling something off and back
 * on again. Nobody would guess that.
 *
 * Confirming writes a row for EVERY module at its current effective
 * state, so "all of them, as they are" becomes an explicit record rather
 * than an absence. That keeps the check honest — the rows now say what
 * was chosen, not merely that somebody touched something.
 *
 * Idempotent: re-confirming re-asserts the same states.
 */
export async function confirmModuleSelection(
  engagementId: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Business Builders only." };
  if (!z.string().uuid().safeParse(engagementId).success)
    return { ok: false, error: "Invalid client." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx, boundOrgId) => {
        // Read what is already set so an existing OFF is preserved. A
        // blanket "write everything ON" would silently switch modules
        // back on that were deliberately turned off.
        const existing = await tx
          .select({
            module: portalModuleAssignments.module,
            isEnabled: portalModuleAssignments.isEnabled,
          })
          .from(portalModuleAssignments)
          .where(eq(portalModuleAssignments.engagementId, engagementId));
        const current = new Map(existing.map((r) => [r.module as string, r.isEnabled]));

        for (const m of ALL_MODULES) {
          // Only modules the enum actually accepts. ALL_MODULES is the
          // rendering registry and could name something the column
          // cannot store; one bad key must not fail the whole confirm.
          const parsed = moduleEnum.safeParse(m.key);
          if (!parsed.success) continue;
          // Absent row means ON — that is the app-wide default.
          const isEnabled = current.get(m.key) ?? true;
          await tx.execute(
            sql`INSERT INTO portal_module_assignments (org_id, engagement_id, module, is_enabled, sort_order)
                VALUES (${boundOrgId}, ${engagementId}, ${parsed.data}, ${isEnabled}, ${m.sortOrder})
                ON CONFLICT (engagement_id, module) DO UPDATE
                  SET is_enabled = EXCLUDED.is_enabled,
                      sort_order = COALESCE(EXCLUDED.sort_order, portal_module_assignments.sort_order)`,
          );
        }
      },
    );
    revalidatePath("/portal");
    revalidatePath(`/business-builder/engagements/${engagementId}`);
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
