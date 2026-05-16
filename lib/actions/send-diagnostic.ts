"use server";

/**
 * Send the public business diagnostic to an existing prospect.
 *
 * Flow:
 *   1. Email the prospect a link to /diagnostic + an optional note.
 *   2. Move the prospect into the "Diagnostic sent" status so the
 *      pipeline reflects "waiting on them" at a glance.
 *   3. Log a prospect_activity so the timeline shows the action.
 *   4. Mirror the outbound message into client_communications so the
 *      unified inbox + per-client audit trail picks it up too.
 *
 * Authorization: master_admin / coach only (Business Builder action).
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  clientCommunications,
  prospectActivities,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { sendEmail } from "@/lib/email/send";
import { diagnosticInviteEmail } from "@/lib/email/templates";

const schema = z.object({
  prospectId: z.string().uuid(),
  personalNote: z.string().max(2000).nullable().optional(),
});

export async function sendDiagnosticToProspect(
  input: z.input<typeof schema>,
): Promise<
  { ok: true; data: { sent: true } } | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  // Load the prospect (system context — prospects live in master).
  const prospect = await withSystemContext(async (tx) => {
    const [p] = await tx
      .select({
        id: prospects.id,
        orgId: prospects.orgId,
        contactEmail: prospects.contactEmail,
        contactName: prospects.contactName,
      })
      .from(prospects)
      .where(eq(prospects.id, data.prospectId))
      .limit(1);
    return p ?? null;
  });
  if (!prospect) return { ok: false, error: "Prospect not found." };

  // Sender's display name + email.
  const sender = await withSystemContext(async (tx) => {
    const [u] = await tx
      .select({ name: userProfiles.fullName, email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return u ?? null;
  });
  if (!sender) return { ok: false, error: "Sender profile not found." };

  const appUrlBase = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");
  const diagnosticUrl = `${appUrlBase}/diagnostic`;

  // Fire the email. sendEmail returns a discriminated result so we
  // can show a clear error if Resend rejects it.
  const sendResult = await sendEmail({
    ...diagnosticInviteEmail({
      to: prospect.contactEmail,
      recipientName: prospect.contactName,
      senderName: sender.name,
      diagnosticUrl,
      personalNote: data.personalNote ?? null,
    }),
    bypassWorkingHours: true,
  });
  if (!sendResult.delivered) {
    return {
      ok: false,
      error:
        sendResult.reason === "outside_working_hours"
          ? "Outside working hours."
          : `Couldn't send: ${sendResult.error}`,
    };
  }

  // Move prospect → diagnostic_pending + log activity + log into the
  // unified communications audit trail. All three writes run in the
  // prospect's owning tenant so RLS binds.
  try {
    await withTenantContext(prospect.orgId, async (tx) => {
      await tx
        .update(prospects)
        .set({
          status: "diagnostic_pending",
          updatedAt: new Date(),
        })
        .where(eq(prospects.id, prospect.id));

      await tx.insert(prospectActivities).values({
        prospectId: prospect.id,
        orgId: prospect.orgId,
        type: "diagnostic_sent",
        subject: "Diagnostic sent",
        body: data.personalNote ?? null,
        createdByUserProfileId: profile.userProfileId,
      });

      await tx.insert(clientCommunications).values({
        orgId: prospect.orgId,
        prospectId: prospect.id,
        channel: "email",
        direction: "outbound",
        fromAddress: sender.email,
        toAddresses: [prospect.contactEmail],
        subject: `Quick business diagnostic from ${sender.name} — 5 minutes`,
        body: data.personalNote ?? "(no personal note)",
        occurredAt: new Date(),
        createdByUserProfileId: profile.userProfileId,
      });
    });
  } catch (e) {
    console.error("[send-diagnostic] activity write failed:", e);
    // Email went out; just don't fail the user-visible result over
    // a logging hiccup.
  }

  revalidatePath(`/coach/pipeline/${prospect.id}`);
  revalidatePath("/coach/pipeline");
  revalidatePath("/coach/inbox");
  return { ok: true, data: { sent: true } };
}
