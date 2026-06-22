"use server";

/**
 * Business Builder access control — mutations. master_admin only.
 *
 * Sets a Business Builder's client reach + allowed console modules and
 * replaces their per-client grants. master_admin targets always keep full
 * access (you can't lock out an admin, including yourself). Runs in system
 * context — this is a cross-org admin operation and authority is checked
 * here in app code.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { bbClientAccess, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";

const schema = z.object({
  userProfileId: z.string().uuid(),
  allClientsAccess: z.boolean(),
  allowedConsoleModules: z.array(z.string()).nullable(),
  grantedEngagementIds: z.array(z.string().uuid()),
});

export type SetBbAccessInput = z.infer<typeof schema>;

export async function setBbUserAccess(
  input: SetBbAccessInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "You're not signed in." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Only a master admin can change access." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const {
    userProfileId,
    allClientsAccess,
    allowedConsoleModules,
    grantedEngagementIds,
  } = parsed.data;

  const masterOrgId = profile.orgId;

  try {
    await withSystemContext(async (tx) => {
      const [target] = await tx
        .select({ id: userProfiles.id, role: userProfiles.role })
        .from(userProfiles)
        .where(eq(userProfiles.id, userProfileId))
        .limit(1);
      if (!target) throw new Error("Business Builder not found.");

      // A master_admin always keeps full access — never store a restriction
      // against one (prevents locking yourself or another admin out).
      const isTargetMaster = target.role === "master_admin";

      await tx
        .update(userProfiles)
        .set({
          allClientsAccess: isTargetMaster ? true : allClientsAccess,
          allowedConsoleModules: isTargetMaster ? null : allowedConsoleModules,
        })
        .where(eq(userProfiles.id, userProfileId));

      // Replace the grant set.
      await tx
        .delete(bbClientAccess)
        .where(eq(bbClientAccess.coachUserProfileId, userProfileId));

      if (!isTargetMaster && !allClientsAccess && grantedEngagementIds.length > 0) {
        await tx.insert(bbClientAccess).values(
          grantedEngagementIds.map((engagementId) => ({
            orgId: masterOrgId,
            coachUserProfileId: userProfileId,
            engagementId,
          })),
        );
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/business-builder/settings/access");
  revalidatePath("/business-builder");
  return { ok: true };
}
