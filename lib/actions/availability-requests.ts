"use server";

/**
 * Availability requests — create the client's link, and receive their answer.
 *
 * `submitAvailability` is PUBLIC: no Clerk session, the token is the auth,
 * exactly like `submitSignature`. Clients have no login, and requiring one
 * would defeat the point of replacing the Google Form.
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { availabilityRequests, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { canCurrentBbWriteProspect } from "@/lib/db/queries/prospects";
import { sendEmailQuietly } from "@/lib/email/send";
import {
  availabilityUrl,
  ensureAvailabilityToken,
} from "@/lib/scheduling/availability-token";
import { describeSlots, sanitizeSlots } from "@/lib/scheduling/availability-grid";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Create (or reuse) the availability link for a prospect.
 *
 * Reuses an UNANSWERED request rather than minting a new token each time the
 * button is pressed — otherwise a client who was emailed the link twice could
 * open the older one and submit against a row nobody is looking at.
 */
export async function createAvailabilityRequest(
  prospectId: string,
): Promise<ActionResult<{ token: string; url: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };
  if (!z.string().uuid().safeParse(prospectId).success)
    return { ok: false, error: "Invalid id." };
  if (!(await canCurrentBbWriteProspect(prospectId)))
    return { ok: false, error: "You don't have access to that lead." };

  try {
    const token = await withSystemContext((tx) =>
      ensureAvailabilityToken(tx, prospectId, profile.userProfileId),
    );
    if (!token) return { ok: false, error: "Prospect not found." };

    revalidatePath(`/business-builder/pipeline/${prospectId}`);
    return {
      ok: true,
      data: { token, url: availabilityUrl(token) },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const submitSchema = z.object({
  token: z.string().min(8).max(80),
  slots: z.array(z.object({ day: z.string(), period: z.string() })).max(20),
  note: z.string().max(4000).optional(),
});

/**
 * Receive the client's answer. Public — the token is the auth.
 *
 * Refuses a second submission rather than overwriting: the first answer is
 * what the Builder acted on, and silently replacing it would change a
 * schedule nobody was told had changed.
 */
export async function submitAvailability(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ alreadySubmitted: boolean }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "That submission didn't look right." };
  const slots = sanitizeSlots(parsed.data.slots);
  const note = parsed.data.note?.trim() || null;

  if (slots.length === 0 && !note) {
    return {
      ok: false,
      error:
        "Pick at least one window, or use \u201CIt\u2019s complicated\u201D to tell us more.",
    };
  }

  try {
    const outcome = await withSystemContext(async (tx) => {
      const [req] = await tx
        .select()
        .from(availabilityRequests)
        .where(eq(availabilityRequests.publicToken, parsed.data.token))
        .limit(1);
      if (!req) return { found: false as const };
      if (req.submittedAt) return { found: true as const, already: true, req };
      await tx
        .update(availabilityRequests)
        .set({ slots, note, submittedAt: new Date(), updatedAt: new Date() })
        .where(eq(availabilityRequests.id, req.id));
      return { found: true as const, already: false, req };
    });

    if (!outcome.found) return { ok: false, error: "That link isn't valid." };
    if (outcome.already) return { ok: true, data: { alreadySubmitted: true } };

    // Tell the Business Builders. Best-effort — a mail failure must not lose
    // the client's answer, which is already committed above.
    const builders = await withSystemContext(async (tx) =>
      tx
        .select({ email: userProfiles.email, name: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.orgId, outcome.req.orgId)),
    );
    const who = outcome.req.contactName ?? "A client";
    const summary = describeSlots(slots);
    for (const b of builders) {
      if (!b.email) continue;
      await sendEmailQuietly({
        to: b.email,
        subject: `Availability submitted: ${who}`,
        html:
          `<p><strong>${who}</strong> submitted their meeting availability.</p>` +
          `<p><strong>Windows:</strong> ${summary}</p>` +
          (note ? `<p><strong>Their note:</strong><br/>${note}</p>` : ""),
        text:
          `${who} submitted their meeting availability.\n\n` +
          `Windows: ${summary}\n` +
          (note ? `\nTheir note:\n${note}\n` : ""),
        // A client has just acted; the Builders want it now, not on Monday.
        bypassWorkingHours: true,
      });
    }

    if (outcome.req.prospectId) {
      revalidatePath(`/business-builder/pipeline/${outcome.req.prospectId}`);
    }
    return { ok: true, data: { alreadySubmitted: false } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
