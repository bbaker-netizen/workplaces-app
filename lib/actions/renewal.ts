"use server";

/**
 * Renewal flow — auto-generate a proposal for the next engagement
 * year.
 *
 * Phase 3.14. Inputs: existing engagement + Soul File + recent
 * deliverables + open goals. Output: a markdown proposal Bruce
 * can edit, send via Adobe Sign, and convert into a new engagement.
 */

import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  deliverables,
  engagements,
  goals,
  soulFiles,
  type UserProfile,
} from "@/lib/db/schema";
import {
  withEngagementContext,
} from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";

type Role = UserProfile["role"];
function canEdit(role: Role): boolean {
  return role === "master_admin" || role === "coach";
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const RENEWAL_SYSTEM = `You are an expert Coach for Workplaces. You're drafting a renewal proposal for an existing client whose first engagement year is wrapping up.

Output a markdown proposal with these sections (omit any section that has no content):

## What we built together this year
3–6 bullets of concrete wins, deliverables shipped, hires made, projects landed. Specific.

## Where the business is now
1 paragraph — current state, momentum, what's working.

## Where it goes next
1 paragraph — the strategic narrative for year 2.

## Year-2 focus areas
3–5 bullets, each with a one-sentence rationale.

## Year-2 deliverables (proposed)
List of specific deliverables and projects, with rough timing per quarter.

## Investment
A placeholder for retainer + scope. Use [PLACEHOLDER] markers — Bruce edits this section before sending.

## Next step
"Sign the renewal contract; we kick off Quarter 1 the week of [DATE]."

Be direct. Don't hedge. Use Workplaces' voice — heritage industrial, builder-not-consultant.`;

const inputSchema = z.object({
  engagementId: z.string().uuid(),
  extraContext: z.string().max(20000).optional(),
});

export async function generateRenewalProposal(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<{ proposal: string }>> {
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

  const ctx = await withEngagementContext(
    profile.orgId,
    profile.role,
    data.engagementId,
    async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagements)
        .where(eq(engagements.id, data.engagementId))
        .limit(1);
      if (!eng) throw new Error("Engagement not found.");
      const [sf] = await tx
        .select({ body: soulFiles.body })
        .from(soulFiles)
        .where(eq(soulFiles.engagementId, data.engagementId))
        .limit(1);
      const recentDeliverables = await tx
        .select({
          title: deliverables.title,
          type: deliverables.type,
          status: deliverables.status,
          deliveredAt: deliverables.deliveredAt,
        })
        .from(deliverables)
        .where(eq(deliverables.engagementId, data.engagementId))
        .orderBy(desc(deliverables.updatedAt))
        .limit(20);
      const openGoals = await tx
        .select({
          title: goals.title,
          status: goals.status,
          targetDate: goals.targetDate,
          targetMetric: goals.targetMetric,
          targetValue: goals.targetValue,
        })
        .from(goals)
        .where(
          and(
            eq(goals.engagementId, data.engagementId),
            // Active goals only
          ),
        )
        .limit(20);
      return { eng, soulFile: sf?.body ?? "", recentDeliverables, openGoals };
    },
  );

  const userPrompt = `**Engagement:** ${ctx.eng.name ?? "Engagement"} (${ctx.eng.type})
**Started:** ${ctx.eng.startedAt ? new Date(ctx.eng.startedAt).toLocaleDateString() : "Unknown"}

**Soul File:**

${ctx.soulFile.slice(0, 50_000) || "(empty)"}

**Recent deliverables (${ctx.recentDeliverables.length}):**

${ctx.recentDeliverables.map((d) => `- [${d.status}] ${d.type}: ${d.title}${d.deliveredAt ? ` (delivered ${new Date(d.deliveredAt).toLocaleDateString()})` : ""}`).join("\n")}

**Goals (${ctx.openGoals.length}):**

${ctx.openGoals.map((g) => `- [${g.status}] ${g.title}${g.targetMetric ? ` (target: ${g.targetValue ?? "-"} ${g.targetMetric})` : ""}`).join("\n")}

${data.extraContext ? `**Bruce's notes for this proposal:**\n\n${data.extraContext}\n\n` : ""}
Draft the renewal proposal now.`;

  try {
    const result = await complete({
      system: RENEWAL_SYSTEM,
      user: userPrompt,
      model: "claude-opus-4-7",
      maxTokens: 6000,
    });
    return { ok: true, data: { proposal: result.text } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
