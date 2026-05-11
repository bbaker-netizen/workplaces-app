"use server";

/**
 * Prospect actions — Business Building lifecycle moves through the pipeline.
 * Phase 4.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const statusEnum = z.enum([
  "diagnostic_pending",
  "diagnostic_complete",
  "proposal_sent",
  "contract_sent",
  "contract_signed",
  "onboarded",
  "lost",
]);

const updateSchema = z.object({
  id: z.string().uuid(),
  status: statusEnum.optional(),
  notes: z.string().max(40000).nullable().optional(),
});

export async function updateProspect(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;
  try {
    await withSystemContext(async (tx) => {
      const updates: Partial<typeof prospects.$inferInsert> = {};
      if (data.status !== undefined) updates.status = data.status;
      if (data.notes !== undefined) updates.notes = data.notes;
      if (Object.keys(updates).length === 0) return;
      await tx
        .update(prospects)
        .set(updates)
        .where(eq(prospects.id, data.id));
    });
    revalidatePath("/coach/pipeline");
    revalidatePath(`/coach/pipeline/${data.id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteProspect(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  try {
    await withSystemContext(async (tx) => {
      await tx.delete(prospects).where(eq(prospects.id, id));
    });
    revalidatePath("/coach/pipeline");
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
