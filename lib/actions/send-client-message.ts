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
  documents,
  engagements,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";
import { canCurrentBbWriteProspect } from "@/lib/db/queries/prospects";
import { sendGmailMessage, type EmailAttachment } from "@/lib/integrations/gmail";
import { downloadDocumentBlob } from "@/lib/storage/blobs";
import { isSmsConfigured, sendSms } from "@/lib/integrations/twilio";
import {
  appendSignature,
  buildHtmlBodyWithSignature,
  markdownToEmailHtml,
} from "@/lib/templates/markdown-to-html";

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  /** base64-encoded file content, sans data URL prefix. */
  base64: z.string().min(1),
});

const sendSchema = z
  .object({
    prospectId: z.string().uuid().nullable().optional(),
    engagementId: z.string().uuid().nullable().optional(),
    channel: z.enum(["email", "sms"]),
    to: z.array(z.string().min(1)).min(1).max(10),
    cc: z.array(z.string().min(1)).max(20).optional(),
    bcc: z.array(z.string().min(1)).max(20).optional(),
    subject: z.string().max(500).nullable().optional(),
    body: z.string().min(1).max(50_000),
    inReplyTo: z.string().max(500).nullable().optional(),
    references: z.string().max(2000).nullable().optional(),
    attachments: z.array(attachmentSchema).max(10).optional(),
    /** Existing prospect/engagement documents to attach by id (e.g. the
     *  Climb PDF). Resolved to file bytes server-side so the browser never
     *  has to shuttle megabytes of base64. */
    documentIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .refine(
    (v) =>
      (v.prospectId && !v.engagementId) || (!v.prospectId && v.engagementId),
    { message: "Pick either a prospect or an engagement (not both)." },
  );

export type SendClientMessageInput = z.input<typeof sendSchema>;

/**
 * Turn selected document ids into email attachments. Each doc is looked up
 * under system context, checked to actually belong to the target prospect /
 * engagement (so a coach can't attach a stray doc by guessing an id), then
 * its bytes are pulled from Blobs and base64-encoded. The caller has already
 * been authorized for this prospect/engagement.
 */
async function resolveDocumentAttachments(
  documentIds: string[],
  target: { prospectId?: string | null; engagementId?: string | null },
): Promise<EmailAttachment[]> {
  const metas = await withSystemContext(async (tx) => {
    const out: Array<{
      blobKey: string;
      filename: string;
      fileType: string;
    }> = [];
    for (const id of documentIds) {
      const [row] = await tx
        .select({
          blobKey: documents.blobKey,
          filename: documents.originalFilename,
          fileType: documents.fileType,
          prospectId: documents.prospectId,
          engagementId: documents.engagementId,
        })
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);
      if (!row) continue;
      // Authorization: the doc must belong to the prospect/engagement this
      // message is being sent for.
      if (target.prospectId && row.prospectId !== target.prospectId) continue;
      if (target.engagementId && row.engagementId !== target.engagementId)
        continue;
      out.push({
        blobKey: row.blobKey,
        filename: row.filename,
        fileType: row.fileType,
      });
    }
    return out;
  });

  const attachments: EmailAttachment[] = [];
  for (const m of metas) {
    const blob = await downloadDocumentBlob(m.blobKey);
    if (!blob) continue;
    attachments.push({
      filename: m.filename,
      contentType: m.fileType || "application/octet-stream",
      base64: Buffer.from(blob.body).toString("base64"),
    });
  }
  return attachments;
}

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

  // Same tenant is not the same thing as yours to write to. Without this a
  // Business Builder could send mail to another Builder's lead, under their
  // own name, on a client they can no longer even open. Engagement-addressed
  // messages are covered further down by withEngagementContext, which
  // enforces the same grant at the foundation.
  if (
    data.prospectId &&
    !(await canCurrentBbWriteProspect(data.prospectId))
  ) {
    return { ok: false, error: "You don't have access to that lead." };
  }

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

  // Look up the sender's email + email signature (signature appended
  // to outbound emails so Bruce's contact info / disclaimer rides on
  // every send without him re-typing).
  const sender = await withSystemContext(async (tx) => {
    const [u] = await tx
      .select({
        email: userProfiles.email,
        emailSignature: userProfiles.emailSignature,
        smsFromNumber: userProfiles.smsFromNumber,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, profile.userProfileId))
      .limit(1);
    return u ?? null;
  });
  const senderEmail = sender?.email ?? null;
  const emailSignature = sender?.emailSignature ?? null;
  const smsFromNumber = sender?.smsFromNumber ?? null;

  let externalId: string | null = null;
  let threadKey: string | null = null;
  try {
    if (data.channel === "email") {
      if (!senderEmail) {
        return { ok: false, error: "Couldn't resolve your sender email." };
      }
      // Plain-text body (Gmail's text/plain part): strip any HTML out of
      // the signature so a text-only recipient doesn't see tag literals.
      const bodyWithSignature = appendSignature(data.body, emailSignature);
      // HTML body (text/html part): when the signature is HTML, splice
      // it into the rendered email document so its spacing, alignment,
      // and underline come through faithfully. Falls back to the regular
      // markdown converter when the signature is markdown.
      const bodyHtml = buildHtmlBodyWithSignature(data.body, emailSignature);
      // Suppress the unused-export warning while keeping the symbol live
      // in case future callers want the bare markdown→HTML path.
      void markdownToEmailHtml;
      // Inline base64 uploads + any existing documents the coach picked
      // (e.g. the Climb PDF), resolved to bytes server-side.
      const emailAttachments: EmailAttachment[] = [...(data.attachments ?? [])];
      if (data.documentIds && data.documentIds.length > 0) {
        const docAtts = await resolveDocumentAttachments(data.documentIds, {
          prospectId: data.prospectId,
          engagementId: data.engagementId,
        });
        emailAttachments.push(...docAtts);
      }
      const r = await sendGmailMessage(profile.userProfileId, senderEmail, {
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject ?? "(no subject)",
        body: bodyWithSignature,
        bodyHtml,
        inReplyTo: data.inReplyTo ?? null,
        references: data.references ?? null,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
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
      const r = await sendSms({
        to: data.to[0],
        body: data.body,
        from: smsFromNumber ?? undefined,
      });
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

  if (data.prospectId) revalidatePath(`/business-builder/pipeline/${data.prospectId}`);
  if (data.engagementId) {
    revalidatePath(`/business-builder/communication/${data.engagementId}`);
  }
  revalidatePath("/business-builder/inbox");

  return { ok: true, data: { id: inserted.id, externalId } };
}
