"use server";

/**
 * Schedule a follow-up on a prospect: sets the Next-action date + note AND
 * drops an entry on the prospect's activity timeline so the follow-up is
 * on the record, not just a silent field change.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { prospectActivities, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { ensureUserProfile } from "@/lib/db/provisioning";

const schema = z.object({
  prospectId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  /** Optional 24h HH:MM. Blank keeps the follow-up as a whole-day reminder. */
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  location: z.string().max(500).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(2000, 0, 1, h, m);
  return dt.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

export async function scheduleProspectFollowup(
  input: z.input<typeof schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not signed in." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { prospectId, date, time, note, location } = parsed.data;
  const loc = location?.trim() || null;

  try {
    await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({ orgId: prospects.orgId })
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");

      // Use the chosen time; with none, noon local avoids the date sliding
      // a day across time zones.
      const when = new Date(`${date}T${time ?? "12:00"}:00`);
      await tx
        .update(prospects)
        .set({
          nextActionDate: when,
          nextActionNote: note ?? null,
          nextActionLocation: loc,
          lastContactAt: new Date(),
        })
        .where(eq(prospects.id, prospectId));

      const subject =
        `Follow-up scheduled for ${prettyDate(date)}` +
        (time ? ` at ${prettyTime(time)}` : "") +
        (loc ? ` · ${loc}` : "");
      await tx.insert(prospectActivities).values({
        prospectId,
        orgId: p.orgId,
        type: "follow_up",
        subject,
        body: note ?? null,
      });
    });
    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (e instanceof Error ? e.message : "Couldn't schedule.").slice(0, 200),
    };
  }
}
