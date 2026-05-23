"use server";

/**
 * Native diagnostic intake — Phase 4. Anonymous form at `/diagnostic`
 * that creates a Prospect record in the master org so the Pipeline
 * picks it up. No Clerk account needed.
 *
 * Per CLAUDE.md "End-to-End Workflow" first row:
 *   "Native diagnostic form; submission auto-creates a Prospect record."
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { orgs, prospectActivities, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const intakeSchema = z.object({
  contactName: z.string().min(1).max(200),
  contactEmail: z.string().email().max(254),
  companyName: z.string().min(1).max(200),
  companyWebsite: z.string().url().max(300).nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  teamSize: z.string().max(50).nullable().optional(),
  topChallenge: z.string().min(10).max(4000),
  revenueRange: z.string().max(80).nullable().optional(),
  timing: z.string().max(120).nullable().optional(),
});

export async function submitDiagnosticIntake(
  input: z.input<typeof intakeSchema>,
): Promise<ActionResult<{ prospectId: string }>> {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;
  try {
    const result = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) throw new Error("Master org not configured.");
      const notes = formatNotes(data);

      // Upsert by (org, contactEmail). If Bruce already invited this
      // contact via "Send Diagnostic" (status=diagnostic_pending), we
      // want their submission to fall onto that record — not create a
      // duplicate prospect.
      const [existing] = await tx
        .select({ id: prospects.id, currentNotes: prospects.notes })
        .from(prospects)
        .where(
          and(
            eq(prospects.orgId, master.id),
            eq(prospects.contactEmail, data.contactEmail),
          ),
        )
        .limit(1);

      if (existing) {
        // Append diagnostic notes to anything already there so we don't
        // overwrite a Coach's running notes.
        const mergedNotes = [existing.currentNotes, notes]
          .filter((s) => s && s.trim().length > 0)
          .join("\n\n---\n\n");
        await tx
          .update(prospects)
          .set({
            companyName: data.companyName,
            contactName: data.contactName,
            status: "diagnostic_complete",
            notes: mergedNotes,
            updatedAt: new Date(),
          })
          .where(eq(prospects.id, existing.id));
        await tx.insert(prospectActivities).values({
          prospectId: existing.id,
          orgId: master.id,
          type: "diagnostic_complete",
          subject: "Diagnostic submitted",
          body: notes,
        });
        return { id: existing.id };
      }

      const [row] = await tx
        .insert(prospects)
        .values({
          orgId: master.id,
          companyName: data.companyName,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          status: "diagnostic_complete",
          notes,
        })
        .returning({ id: prospects.id });
      return row;
    });
    return { ok: true, data: { prospectId: result.id } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function formatNotes(d: z.infer<typeof intakeSchema>): string {
  const lines: string[] = [];
  if (d.companyWebsite) lines.push(`**Website:** ${d.companyWebsite}`);
  if (d.industry) lines.push(`**Industry:** ${d.industry}`);
  if (d.teamSize) lines.push(`**Team size:** ${d.teamSize}`);
  if (d.revenueRange) lines.push(`**Revenue range:** ${d.revenueRange}`);
  if (d.timing) lines.push(`**Timing:** ${d.timing}`);
  lines.push("");
  lines.push("**Top challenge:**");
  lines.push(d.topChallenge.trim());
  return lines.join("\n");
}
