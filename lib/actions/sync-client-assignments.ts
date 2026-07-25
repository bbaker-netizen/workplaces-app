"use server";

/**
 * One-time reconciliation: align every existing client's assigned Business
 * Builder to the Owner set on its lead.
 *
 * Clients converted before ownership followed the Owner still carry the coach
 * of whoever converted them. Changing a lead's Owner reassigns going forward
 * (see updateProspect), but a client whose Owner was already correct never got
 * moved. This walks every converted lead that has an Owner and sets its
 * engagement's coachId to that Owner's coach — idempotent, so it's safe to run
 * repeatedly. Master admin only.
 */

import { and, eq, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { coaches, engagements, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export async function syncClientAssignmentsToOwners(): Promise<
  { ok: true; reassigned: number } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin")
    return { ok: false, error: "Master admin only." };

  try {
    const reassigned = await withSystemContext(async (tx) => {
      const rows = await tx
        .select({
          engagementId: prospects.convertedEngagementId,
          ownerUserProfileId: prospects.ownerUserProfileId,
          orgId: prospects.orgId,
        })
        .from(prospects)
        .where(
          and(
            isNotNull(prospects.convertedEngagementId),
            isNotNull(prospects.ownerUserProfileId),
          ),
        );

      let count = 0;
      // Cache owner → coach id so we don't look up the same owner repeatedly.
      const coachByOwner = new Map<string, string>();
      for (const r of rows) {
        const ownerId = r.ownerUserProfileId!;
        let coachId = coachByOwner.get(ownerId);
        if (!coachId) {
          const [existing] = await tx
            .select({ id: coaches.id })
            .from(coaches)
            .where(eq(coaches.userProfileId, ownerId))
            .limit(1);
          if (existing) {
            coachId = existing.id;
          } else {
            const [created] = await tx
              .insert(coaches)
              .values({
                orgId: r.orgId,
                userProfileId: ownerId,
                status: "active",
              })
              .returning({ id: coaches.id });
            coachId = created.id;
          }
          coachByOwner.set(ownerId, coachId);
        }
        // Only counts as a reassignment when the coach actually changes.
        const updated = await tx
          .update(engagements)
          .set({ coachId })
          .where(
            and(
              eq(engagements.id, r.engagementId!),
              ne(engagements.coachId, coachId),
            ),
          )
          .returning({ id: engagements.id });
        count += updated.length;
      }
      return count;
    });

    revalidatePath("/business-builder", "layout");
    revalidatePath("/business-builder/engagements");
    return { ok: true, reassigned };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
