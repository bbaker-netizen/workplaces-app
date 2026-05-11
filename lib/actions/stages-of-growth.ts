"use server";

/**
 * Stages of Growth assessment.
 *
 * Phase 3.16. Per CLAUDE.md the methodology tracks where each
 * engagement sits on the Stages of Growth framework. Stage values
 * are 1..7 typically (the framework's seven stages from start-up
 * through enterprise). The numeric stage and the assessed-at
 * timestamp live on `engagements`; the qualitative assessment text
 * lives in the Soul File.
 *
 * IP exposure rule: stage NUMBER stays internal. Framework stage
 * NAMES are visible to clients but the proprietary scoring is not.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { engagements, type UserProfile } from "@/lib/db/schema";
import { withEngagementContext } from "@/lib/db/tenant";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Maps the numeric stage 1..7 to the framework name. Names are
 * visible to clients per IP exposure rules.
 */
export const STAGE_LABEL: Record<number, string> = {
  1: "Start-Up",
  2: "Ramp-Up",
  3: "Delegation",
  4: "Professional",
  5: "Integration",
  6: "Strategic",
  7: "Visionary",
};

const inputSchema = z.object({
  engagementId: z.string().uuid(),
  stage: z.number().int().min(1).max(7),
});

export async function setEngagementStage(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Business Builders only." };
  const parsed = inputSchema.safeParse(input);
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
      async (tx) => {
        await tx
          .update(engagements)
          .set({
            stageOfGrowthStage: data.stage,
            stageAssessedAt: new Date(),
          })
          .where(eq(engagements.id, data.engagementId));
      },
    );
    revalidatePath("/coach");
    revalidatePath("/portal");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
