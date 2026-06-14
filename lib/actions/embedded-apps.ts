"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  embeddedAppFavourites,
  embeddedApps,
  type UserProfile,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withTenantContext,
} from "@/lib/db/tenant";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const authModeEnum = z.enum(["public", "token_passthrough", "clerk_sso"]);
const createSchema = z.object({
  engagementId: z.string().uuid(),
  netlifyProjectId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(20000).nullable().optional(),
  appUrl: z.string().url(),
  authMode: authModeEnum.default("public"),
  isVisible: z.boolean().default(true),
});
const updateSchema = createSchema.partial().omit({ engagementId: true });

export async function createEmbeddedApp(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Only coaches can register embedded apps." };
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
          .insert(embeddedApps)
          .values({
            orgId: boundOrgId,
            engagementId: data.engagementId,
            netlifyProjectId: data.netlifyProjectId,
            displayName: data.displayName,
            description: data.description ?? null,
            instructions: data.instructions ?? null,
            appUrl: data.appUrl,
            authMode: data.authMode,
            isVisible: data.isVisible,
          })
          .returning({ id: embeddedApps.id });
        return row;
      },
    );
    revalidatePath("/portal/apps");
    return { ok: true, data: created };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateEmbeddedApp(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Only coaches can edit embedded apps." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  const engagementId = await resolveEngagementIdFromRecord(
    "embedded_apps",
    id,
  );
  if (!engagementId) return { ok: false, error: "Not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const update: Partial<typeof embeddedApps.$inferInsert> = {};
        if (data.netlifyProjectId !== undefined)
          update.netlifyProjectId = data.netlifyProjectId;
        if (data.displayName !== undefined)
          update.displayName = data.displayName;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.instructions !== undefined)
          update.instructions = data.instructions;
        if (data.appUrl !== undefined) update.appUrl = data.appUrl;
        if (data.authMode !== undefined) update.authMode = data.authMode;
        if (data.isVisible !== undefined) update.isVisible = data.isVisible;
        if (Object.keys(update).length === 0) return;
        await tx
          .update(embeddedApps)
          .set(update)
          .where(eq(embeddedApps.id, id));
      },
    );
    revalidatePath("/portal/apps");
    revalidatePath(`/portal/apps/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Toggle the current user's favourite flag on an app. Idempotent
 * insert-or-delete on the (app, user) pair. Any portal user can favourite.
 */
export async function toggleAppFavourite(
  embeddedAppId: string,
): Promise<ActionResult<{ favourited: boolean }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (!z.string().uuid().safeParse(embeddedAppId).success) {
    return { ok: false, error: "Invalid app id." };
  }
  try {
    const favourited = await withTenantContext(profile.orgId, async (tx) => {
      const [existing] = await tx
        .select({ id: embeddedAppFavourites.id })
        .from(embeddedAppFavourites)
        .where(
          and(
            eq(embeddedAppFavourites.embeddedAppId, embeddedAppId),
            eq(embeddedAppFavourites.userProfileId, profile.userProfileId),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .delete(embeddedAppFavourites)
          .where(eq(embeddedAppFavourites.id, existing.id));
        return false;
      }
      await tx.insert(embeddedAppFavourites).values({
        orgId: profile.orgId,
        embeddedAppId,
        userProfileId: profile.userProfileId,
      });
      return true;
    });
    revalidatePath("/portal/apps");
    return { ok: true, data: { favourited } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteEmbeddedApp(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Only coaches can delete embedded apps." };
  const engagementId = await resolveEngagementIdFromRecord(
    "embedded_apps",
    id,
  );
  if (!engagementId) return { ok: false, error: "Not found." };
  try {
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        await tx.delete(embeddedApps).where(eq(embeddedApps.id, id));
      },
    );
    revalidatePath("/portal/apps");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
