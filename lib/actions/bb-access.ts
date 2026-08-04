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
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { bbClientAccess, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";

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

      // Grants are written back regardless of `allClientsAccess` and
      // regardless of whether the target is a master admin.
      //
      // They used to be dropped in both those cases, on the reading that
      // a grant is a RESTRICTION list — pointless for someone who can
      // already see everything. A grant now also means "this client is
      // shared with me", which is what puts it in that Builder's own
      // book, their cross-client views and their morning briefing. Under
      // the old rule, saving this page for a Builder with all-clients
      // permission silently un-shared every client they had been given.
      if (grantedEngagementIds.length > 0) {
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

const shareSchema = z.object({
  engagementId: z.string().uuid(),
  coachUserProfileId: z.string().uuid(),
  shared: z.boolean(),
});

/**
 * Share ONE client with ONE other Business Builder, or stop sharing it.
 *
 * The per-client counterpart to `setBbUserAccess`, which manages the
 * whole practice matrix from a master-admin settings page. Bruce's ask
 * was "add a second Business Builder to a specific client", and the
 * matrix is the wrong shape for that: it is organised by PERSON, so
 * sharing one client means finding the right person and remembering
 * which boxes were already ticked. This is organised by client, which is
 * what you have open when you decide to share it.
 *
 * **Not master-admin-only.** The engagement's own coach can share their
 * own client. Requiring the master admin for every share would make Jen
 * ask Bruce to hand her own client to him — a permission step with no
 * decision behind it. What a coach cannot do is share a client that
 * isn't theirs: `canCurrentBbAccessEngagement` is checked first, and it
 * already honours ownership, existing shares and the grant list.
 *
 * Idempotent in both directions — the unique index on
 * (coach_user_profile_id, engagement_id) means a double-click inserts
 * once, and un-sharing something already un-shared deletes nothing.
 */
export async function setEngagementShare(
  input: z.infer<typeof shareSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "You're not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Only a Business Builder can share a client." };
  }

  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { engagementId, coachUserProfileId, shared } = parsed.data;

  if (!(await canCurrentBbAccessEngagement(engagementId))) {
    return { ok: false, error: "You don't have access to that client." };
  }

  try {
    await withSystemContext(async (tx) => {
      const [target] = await tx
        .select({ id: userProfiles.id, role: userProfiles.role })
        .from(userProfiles)
        .where(eq(userProfiles.id, coachUserProfileId))
        .limit(1);
      if (!target) throw new Error("Business Builder not found.");
      if (target.role !== "master_admin" && target.role !== "coach") {
        // A client can only be shared with someone on our side of the
        // glass. Without this check an arbitrary user_profile id would
        // be inserted happily and grant a CLIENT a Business Builder's
        // view of their own engagement.
        throw new Error("That person isn't a Business Builder.");
      }

      if (shared) {
        await tx
          .insert(bbClientAccess)
          .values({
            orgId: profile.orgId,
            coachUserProfileId,
            engagementId,
          })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(bbClientAccess)
          .where(
            and(
              eq(bbClientAccess.coachUserProfileId, coachUserProfileId),
              eq(bbClientAccess.engagementId, engagementId),
            ),
          );
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/business-builder/engagements/${engagementId}`);
  revalidatePath("/business-builder/engagements");
  revalidatePath("/business-builder/settings/access");
  return { ok: true };
}
