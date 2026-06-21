"use server";

/**
 * Engagement lifecycle actions.
 *
 * The engagement status drives the client portal: when an engagement is
 * `paused` or `completed`, the portal renders read-only (see
 * lib/engagement-lifecycle.ts + the portal layout banner). Coaches set
 * the status here; it also flips automatically when the originating
 * prospect is archived/restored (see lib/actions/prospects.ts).
 */

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, orgs, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Rename a client/engagement. The engagement name is the client's portal
 * branding, so this fixes cases where it ended up as a person's first
 * name instead of the business name. Updates BOTH the engagement and its
 * client org (the tenant) plus any originating prospect's company name so
 * every surface — portal header, Engagements list, Pipeline — agrees.
 * Coach-only.
 */
export async function renameEngagement(
  engagementId: string,
  rawName: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const name = rawName.trim();
  if (name.length < 2) return { ok: false, error: "Name is too short." };
  if (name.length > 200) return { ok: false, error: "Name is too long." };
  try {
    const found = await withSystemContext(async (tx) => {
      const [eng] = await tx
        .update(engagements)
        .set({ name })
        .where(eq(engagements.id, engagementId))
        .returning({ orgId: engagements.orgId });
      if (!eng) return false;
      await tx.update(orgs).set({ name }).where(eq(orgs.id, eng.orgId));
      await tx
        .update(prospects)
        .set({ companyName: name })
        .where(eq(prospects.convertedEngagementId, engagementId));
      return true;
    });
    if (!found) return { ok: false, error: "Engagement not found." };
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath("/business-builder/engagements");
    revalidatePath("/business-builder/pipeline");
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Statuses a coach can set by hand from the engagement page. */
export type SettableEngagementStatus = "active" | "paused" | "completed";

const SETTABLE: SettableEngagementStatus[] = ["active", "paused", "completed"];

export async function setEngagementStatus(
  engagementId: string,
  status: SettableEngagementStatus,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  if (!SETTABLE.includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(engagements)
        .set({ status })
        .where(eq(engagements.id, engagementId));
    });
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath("/business-builder/engagements");
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The program a client is signed up for. */
export type EngagementProgram = "accelerator" | "implementer";

/**
 * Set the engagement's program (Accelerator / Implementer) and keep the
 * originating Pipeline lead's programType in step, so the Engagements
 * list, the Client Portal list, and the Pipeline all show the same thing.
 * Coach-only.
 */
export async function setEngagementProgram(
  engagementId: string,
  program: EngagementProgram,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  if (program !== "accelerator" && program !== "implementer") {
    return { ok: false, error: "Invalid program." };
  }
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(engagements)
        .set({ type: program })
        .where(eq(engagements.id, engagementId));
      // Sync the originating lead's programType so the Pipeline agrees.
      await tx
        .update(prospects)
        .set({ programType: program })
        .where(eq(prospects.convertedEngagementId, engagementId));
    });
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath("/business-builder/engagements");
    revalidatePath("/business-builder/pipeline");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Archive (soft-delete) an entire engagement — removes the client from
 * the Engagements list and closes their portal. Reversible via
 * unarchiveEngagement. Coach-only.
 */
export async function archiveEngagement(engagementId: string): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(engagements)
        .set({ archivedAt: new Date(), status: "paused" })
        .where(eq(engagements.id, engagementId));
    });
    // Best-effort: move an app-managed Drive folder into the coach's
    // Archive folder. No-op for read-only-linked folders.
    const { moveEngagementFolderToArchive } = await import(
      "@/lib/actions/engagement-drive"
    );
    await moveEngagementFolderToArchive(engagementId);
    revalidatePath("/business-builder/engagements");
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Permanently delete an engagement and ALL of its workspace data
 * (sessions, action items, projects, documents, deliverables, messages,
 * etc. — every engagement-scoped table cascades on the FK). Irreversible.
 *
 * Safety rails: coach-only, and the engagement must already be archived
 * (you archive first, then delete from the Archived list). The
 * originating prospect's `converted_engagement_id` is set to null by the
 * FK, so the prospect stays in the pipeline; the client's Clerk org and
 * logins are left intact (delete those in Clerk if needed).
 */
export async function deleteEngagementPermanently(
  engagementId: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    const deleted = await withSystemContext(async (tx) => {
      // Only archived engagements can be hard-deleted — prevents nuking an
      // active client by mistake (the archive-first safety rail).
      const [eng] = await tx
        .select({ id: engagements.id })
        .from(engagements)
        .where(
          and(
            eq(engagements.id, engagementId),
            isNotNull(engagements.archivedAt),
          ),
        )
        .limit(1);
      if (!eng) return false;
      // Remove the originating prospect/lead FIRST. Deleting the
      // engagement would otherwise null out prospects.converted_engagement_id
      // (FK set null), orphaning the lead in the Pipeline — the "client
      // still persists everywhere" bug. Its activities + communications
      // cascade; signature envelopes null out. Then delete the engagement,
      // which cascades all of its workspace data.
      await tx
        .delete(prospects)
        .where(eq(prospects.convertedEngagementId, engagementId));
      await tx.delete(engagements).where(eq(engagements.id, engagementId));
      return true;
    });
    if (!deleted) {
      return {
        ok: false,
        error: "Archive the client first, then delete it from the Archived list.",
      };
    }
    revalidatePath("/business-builder/engagements");
    revalidatePath("/business-builder/pipeline");
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Restore an archived engagement (and reactivate it). Coach-only. */
export async function unarchiveEngagement(
  engagementId: string,
): Promise<Result> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  try {
    await withSystemContext(async (tx) => {
      await tx
        .update(engagements)
        .set({ archivedAt: null, status: "active" })
        .where(eq(engagements.id, engagementId));
    });
    revalidatePath("/business-builder/engagements");
    revalidatePath(`/business-builder/engagements/${engagementId}`);
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
