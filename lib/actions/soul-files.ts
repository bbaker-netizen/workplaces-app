"use server";

/**
 * Soul Files — server actions.
 *
 * Phase 1.7. Surface:
 *   - `upsertSoulFileBody(engagementId, body)` — write the markdown
 *     body. Creates the row if none exists. Leadership-only write
 *     (master_admin / coach / client_lead / client_manager).
 *
 * Reads live in `lib/db/queries/soul-files.ts`.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  engagements,
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant";

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

const upsertSchema = z.object({
  engagementId: z.string().uuid(),
  body: z.string().max(200000), // Soul Files can run long.
});

export type UpsertSoulFileInput = z.input<typeof upsertSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function upsertSoulFileBody(
  input: UpsertSoulFileInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEdit(profile.role)) {
    return { ok: false, error: "Your role can't edit the Soul File." };
  }
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const id = await withTenantContext(profile.orgId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagements.id })
        .from(engagements)
        .where(eq(engagements.id, data.engagementId))
        .limit(1);
      if (!eng) throw new Error("Engagement not found.");

      const [existing] = await tx
        .select({ id: soulFiles.id })
        .from(soulFiles)
        .where(eq(soulFiles.engagementId, data.engagementId))
        .limit(1);

      if (existing) {
        await tx
          .update(soulFiles)
          .set({
            body: data.body,
            lastEditorUserProfileId: profile.userProfileId,
          })
          .where(eq(soulFiles.id, existing.id));
        return existing.id;
      }
      const [row] = await tx
        .insert(soulFiles)
        .values({
          orgId: profile.orgId,
          engagementId: data.engagementId,
          body: data.body,
          lastEditorUserProfileId: profile.userProfileId,
        })
        .returning({ id: soulFiles.id });
      return row.id;
    });

    revalidatePath("/portal/soul-file");
    revalidatePath(`/coach/soul-file/${data.engagementId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
