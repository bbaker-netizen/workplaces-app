"use server";

/**
 * Person Profile assessment completion — marked by a Business Builder.
 *
 * Not automatic, and it can't be: the TTI link is a single shared survey URL
 * with no per-person identity, and TTI has no API into this app. So nothing
 * can detect who finished. A Builder ticks it when the report arrives.
 *
 * The value is still real — it's what makes "who are we still waiting on?"
 * answerable a week before the first session, which is the whole point of
 * the deadline in the onboarding email.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { prospects, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { canCurrentBbWriteProspect } from "@/lib/db/queries/prospects";
import { sendEmailQuietly } from "@/lib/email/send";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const schema = z.object({
  prospectId: z.string().uuid(),
  /** 1 = primary contact, 2 = their business partner. */
  participant: z.union([z.literal(1), z.literal(2)]),
  completed: z.boolean(),
});

export async function setAssessmentCompletion(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ completedAt: string | null }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { prospectId, participant, completed } = parsed.data;
  if (!(await canCurrentBbWriteProspect(prospectId)))
    return { ok: false, error: "You don't have access to that lead." };

  const when = completed ? new Date() : null;
  const column =
    participant === 1 ? "assessment1CompletedAt" : "assessment2CompletedAt";

  try {
    const row = await withSystemContext(async (tx) => {
      const [updated] = await tx
        .update(prospects)
        .set({ [column]: when, updatedAt: new Date() })
        .where(eq(prospects.id, prospectId))
        .returning({
          companyName: prospects.companyName,
          orgId: prospects.orgId,
          name1: prospects.contactFirstName,
          name2: prospects.contact2FirstName,
          a1: prospects.assessment1CompletedAt,
          a2: prospects.assessment2CompletedAt,
        });
      return updated ?? null;
    });
    if (!row) return { ok: false, error: "Lead not found." };

    // Tell the Business Builders — but only on COMPLETION. Unticking is a
    // correction, and mailing everyone about a correction is noise.
    if (completed) {
      const who =
        (participant === 1 ? row.name1 : row.name2) ??
        `Participant ${participant}`;
      const bothDone = Boolean(row.a1) && Boolean(row.a2);
      const builders = await withSystemContext(async (tx) =>
        tx
          .select({ email: userProfiles.email })
          .from(userProfiles)
          .where(eq(userProfiles.orgId, row.orgId)),
      );
      for (const b of builders) {
        if (!b.email) continue;
        await sendEmailQuietly({
          to: b.email,
          subject: `Assessment completed: ${who} (${row.companyName})`,
          html:
            `<p><strong>${who}</strong> has completed their Person Profile assessment.</p>` +
            `<p>Client: <strong>${row.companyName}</strong></p>` +
            (bothDone
              ? `<p>That's everyone — prep can start.</p>`
              : `<p>Still waiting on the other participant.</p>`),
          text:
            `${who} has completed their Person Profile assessment.\n` +
            `Client: ${row.companyName}\n` +
            (bothDone
              ? "That's everyone — prep can start.\n"
              : "Still waiting on the other participant.\n"),
          bypassWorkingHours: true,
        });
      }
    }

    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    return { ok: true, data: { completedAt: when?.toISOString() ?? null } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
