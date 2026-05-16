"use server";

/**
 * Send an email / SMS / WhatsApp message to a prospect or client from
 * inside the app. Writes the outbound record into client_communications
 * automatically so the per-client timeline reflects the send.
 *
 * Channel routing:
 *   - email     → Gmail send via the connected Google Workspace account
 *   - sms       → Twilio SMS (TWILIO_* env vars required)
 *   - whatsapp  → Twilio WhatsApp (TWILIO_* env vars + Meta-approved sender)
 */

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  clientCommunications,
  engagements,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { sendGmailMessage } from "@/lib/integrations/gmail";
import { isSmsConfigured, sendSms } from "@/lib/integrations/twilio";

const sendSchema = z
  .object({
    prospectId: z.string().uuid().nullable().optional(),
    engagementId: z.string().uuid().nullable().optional(),
    channel: z.enum(["email", "sms"]),
    to: z.array(z.string().min(1)).min(1).max(10),
    subject: z.string().max(500).nullable().optional(),
    body: z.string().min(1).max(50_000),
    inReplyTo: z.string().max(500).nullable().optional(),
    references: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      (v.prospectId && !v.engagementId) || (!v.prospectId && v.engagementId),
    { message: "Pick either a prospect or an engagement (not both)." },
  );

export type SendClientMessageInput = z.input<typeof sendSchema>;

export async function sendClientMessage(
  input: SendClientMessageInput,
): Promise<
  | { ok: true; data: { id: string; externalId: string | null } }
  | { ok: false; error: string }
> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach") {
    return { ok: false, error: "Business Builders only." };
  }
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  // Verify the target record is in our tenant.
  await withTenantContext(profile.orgId, async (tx) => {
    if (data.prospectId) {
      const [p] = await tx
        .select({ id: prospects.id })
        .from(prospects)
        .where(eq(prospects.id, data.prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");
    }
    if (data.engagementId) {
      const [e] = await tx
        .select({ id: engagements.id })
        .from(engagements)
        .where(eq(engagements.id, data.engagementId))
        .limit(1);
      if (!e) throw new Error("Engagement not found.");
    }
  });

  // Look up the sender's email (only needed for email channel).
  const senderEmail = await withSystemContext(async (tx) => {
    const [u] = await tx
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return u?.email ?? null;
  });

  let externalId: string | null = null;
  let threadKey: string | null = null;
  try {
    if (data.channel === "email") {
      if (!senderEmail) {
        return { ok: false, error: "Couldn't resolve your sender email." };
      }
      const r = await sendGmailMessage(profile.userProfileId, senderEmail, {
        to: data.to,
        subject: data.subject ?? "(no subject)",
        body: data.body,
        inReplyTo: data.inReplyTo ?? null,
        references: data.references ?? null,
      });
      externalId = r.messageId;
      threadKey = r.threadId ?? data.references ?? null;
    } else if (data.channel === "sms") {
      if (!isSmsConfigured()) {
        return {
          ok: false,
          error:
            "Twilio SMS isn't configured yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and EITHER TWILIO_MESSAGING_SERVICE_SID (preferred) OR TWILIO_PHONE_NUMBER in Netlify.",
        };
      }
      const r = await sendSms({ to: data.to[0], body: data.body });
      externalId = r.messageSid;
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Send failed.",
    };
  }

  // Persist into the client comms log.
  const inserted = await withTenantContext(profile.orgId, async (tx) => {
    const [row] = await tx
      .insert(clientCommunications)
      .values({
        orgId: profile.orgId,
        prospectId: data.prospectId ?? null,
        engagementId: data.engagementId ?? null,
        channel: data.channel,
        direction: "outbound",
        fromAddress: senderEmail ?? null,
        toAddresses: data.to,
        subject: data.subject ?? null,
        body: data.body,
        threadKey,
        externalId,
        occurredAt: new Date(),
        tags: [],
        createdByUserProfileId: profile.userProfileId,
      })
      .returning({ id: clientCommunications.id });
    return row;
  });

  if (data.prospectId) revalidatePath(`/coach/pipeline/${data.prospectId}`);
  if (data.engagementId) {
    revalidatePath(`/coach/communication/${data.engagementId}`);
  }
  revalidatePath("/coach/inbox");

  return { ok: true, data: { id: inserted.id, externalId } };
}
