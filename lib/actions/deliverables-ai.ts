"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { deliverables, soulFiles, type UserProfile } from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
} from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import {
  deliverableSystemPrompt,
  deliverableUserPrompt,
} from "@/lib/ai/prompts/deliverables";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return (
    role === "master_admin" ||
    role === "coach" ||
    role === "client_lead" ||
    role === "client_manager"
  );
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function generateDeliverableDraft(
  id: string,
  extraContext?: string,
): Promise<ActionResult<{ result: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (!canEdit(profile.role))
    return { ok: false, error: "Your role can't generate deliverables." };
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false, error: "Invalid id." };

  const engagementId = await resolveEngagementIdFromRecord(
    "deliverables",
    id,
  );
  if (!engagementId) return { ok: false, error: "Deliverable not found." };

  const ctx = await withEngagementContext(
    profile.orgId,
    profile.role,
    engagementId,
    async (tx) => {
      const [d] = await tx
        .select()
        .from(deliverables)
        .where(eq(deliverables.id, id))
        .limit(1);
      if (!d) return null;
      const [sf] = await tx
        .select({ body: soulFiles.body })
        .from(soulFiles)
        .where(eq(soulFiles.engagementId, d.engagementId))
        .limit(1);
      return { deliverable: d, soulFileBody: sf?.body ?? "" };
    },
  );
  if (!ctx) return { ok: false, error: "Deliverable not found." };

  try {
    const result = await complete({
      system: deliverableSystemPrompt(ctx.deliverable.type),
      user: deliverableUserPrompt({
        title: ctx.deliverable.title,
        type: ctx.deliverable.type,
        description: ctx.deliverable.description,
        soulFileBody: ctx.soulFileBody,
        extraContext,
      }),
      model: "claude-opus-4-8",
      maxTokens: 8000,
    });

    // Append draft to the deliverable's description.
    await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select({ description: deliverables.description })
          .from(deliverables)
          .where(eq(deliverables.id, id))
          .limit(1);
        const stamp = new Date().toLocaleString();
        const block = `\n\n---\n\n## Draft generated ${stamp}\n\n${result.text}`;
        await tx
          .update(deliverables)
          .set({
            description: (existing?.description ?? "") + block,
            status: "in_progress",
          })
          .where(eq(deliverables.id, id));
      },
    );

    revalidatePath("/portal/deliverables");
    return { ok: true, data: { result: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
