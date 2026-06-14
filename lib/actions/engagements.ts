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
import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

type Result = { ok: true } | { ok: false; error: string };

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
