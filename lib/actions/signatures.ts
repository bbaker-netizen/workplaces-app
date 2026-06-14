"use server";

/**
 * Native e-signing — server actions.
 *
 * Phase 4.5. Replaces the Adobe Sign integration. Coaches create an
 * envelope from an existing document (or a fresh upload) plus a list
 * of signers. Each signer receives a public signing link via email.
 * Sequential routing means we email signers in `order_index` order,
 * waiting for one to sign before notifying the next.
 *
 * On the last signer, we generate the signed PDF (original pages +
 * certificate of completion appended), insert it as a `documents` row,
 * link it back to the envelope, and email the signed copy to every
 * signer plus the sender.
 *
 * Public surface: `submitSignature(token, ...)` is callable without
 * a Clerk session — token IS the auth.
 */

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  documents,
  engagements,
  prospectActivities,
  prospects,
  signatureEnvelopes,
  signatureSigners,
  userProfiles,
} from "@/lib/db/schema";
import {
  resolveEngagementIdFromRecord,
  withSystemContext,
} from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import {
  signatureCompletedEmail,
  signatureRequestEmail,
} from "@/lib/email/templates";
import { buildSignedPdf } from "@/lib/signing/pdf";
import { makeAuditEntry, type AuditEntry } from "@/lib/signing/audit";
import { newSigningToken } from "@/lib/signing/token";
import {
  downloadDocumentBlob,
  uploadDocumentBlob,
} from "@/lib/storage/blobs";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------- create envelope ------------------------- */

const signerInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254),
  roleLabel: z.string().max(100).nullable().optional(),
});

const createSchema = z.object({
  sourceDocumentId: z.string().uuid(),
  prospectId: z.string().uuid().nullable().optional(),
  engagementId: z.string().uuid().nullable().optional(),
  subject: z.string().min(1).max(300),
  message: z.string().max(8000).nullable().optional(),
  signers: z.array(signerInputSchema).min(1).max(4),
  /** Whether to insert the Coach's stored signature as the first
   *  pre-signed signer. When true, the Coach is added at order 0
   *  with status=signed using their `signature_image_data`. */
  autoSignAsMe: z.boolean().default(false),
});

export type CreateEnvelopeInput = z.input<typeof createSchema>;

export async function createSignatureEnvelope(
  input: CreateEnvelopeInput,
): Promise<ActionResult<{ envelopeId: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;

  // Verify the document exists and resolve its org (and engagement,
  // if it's filed under one). System context — coaches operate
  // cross-tenant.
  const docCtx = await withSystemContext(async (tx) => {
    const [doc] = await tx
      .select({
        id: documents.id,
        orgId: documents.orgId,
        engagementId: documents.engagementId,
        filename: documents.originalFilename,
      })
      .from(documents)
      .where(eq(documents.id, data.sourceDocumentId))
      .limit(1);
    return doc ?? null;
  });
  if (!docCtx) return { ok: false, error: "Source document not found." };

  // Prospect resolution: if a prospect_id is set, validate it exists
  // and grab its org for signer notifications.
  let prospectOrgId: string | null = null;
  if (data.prospectId) {
    prospectOrgId = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({ orgId: prospects.orgId })
        .from(prospects)
        .where(eq(prospects.id, data.prospectId!))
        .limit(1);
      return p?.orgId ?? null;
    });
    if (!prospectOrgId)
      return { ok: false, error: "Prospect not found." };
  }

  const orgId = data.engagementId ? docCtx.orgId : prospectOrgId ?? docCtx.orgId;

  // Look up the Coach's stored signature if auto-sign-as-me was requested.
  let coachSignatureImage: string | null = null;
  if (data.autoSignAsMe) {
    const [me] = await withSystemContext(async (tx) =>
      tx
        .select({
          fullName: userProfiles.fullName,
          email: userProfiles.email,
          signatureImageData: userProfiles.signatureImageData,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1),
    );
    if (!me?.signatureImageData) {
      return {
        ok: false,
        error:
          "You haven't uploaded a signature image yet. Upload one at /business-builder/profile/signature first, or uncheck 'sign as me'.",
      };
    }
    coachSignatureImage = me.signatureImageData;
  }

  // Build the envelope + signers in one transaction.
  const result = await withSystemContext(async (tx) => {
    const audit: AuditEntry[] = [
      makeAuditEntry("envelope_created", {
        by: profile.email,
      }),
    ];

    const [env] = await tx
      .insert(signatureEnvelopes)
      .values({
        orgId,
        prospectId: data.prospectId ?? null,
        engagementId: data.engagementId ?? null,
        sourceDocumentId: data.sourceDocumentId,
        subject: data.subject,
        message: data.message ?? null,
        routing: "sequential",
        status: "in_progress",
        createdByUserProfileId: profile.userProfileId,
        auditLog: audit,
      })
      .returning({ id: signatureEnvelopes.id });

    let order = 0;
    if (coachSignatureImage) {
      const me = await tx
        .select({
          fullName: userProfiles.fullName,
          email: userProfiles.email,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      const meRow = me[0]!;
      await tx.insert(signatureSigners).values({
        envelopeId: env.id,
        orgId,
        orderIndex: order++,
        name: meRow.fullName,
        email: meRow.email,
        roleLabel: "Sender",
        publicToken: newSigningToken(),
        status: "signed",
        signatureImageData: coachSignatureImage,
        signatureMethod: "uploaded",
        signedAt: new Date(),
      });
    }

    for (const s of data.signers) {
      await tx.insert(signatureSigners).values({
        envelopeId: env.id,
        orgId,
        orderIndex: order++,
        name: s.name,
        email: s.email,
        roleLabel: s.roleLabel ?? null,
        publicToken: newSigningToken(),
        status: "pending",
      });
    }

    // Dated record on the prospect's activity timeline.
    if (data.prospectId) {
      await tx.insert(prospectActivities).values({
        prospectId: data.prospectId,
        orgId,
        type: "signature_request",
        subject: `Sent for signature: ${data.subject}`,
        createdByUserProfileId: profile.userProfileId,
      });
    }

    return env;
  });

  // Email the next pending signer.
  await emailNextPendingSigner(result.id, profile.fullName);

  revalidatePath("/business-builder/pipeline");
  if (data.engagementId)
    revalidatePath(`/business-builder/documents/${data.engagementId}`);
  return { ok: true, data: { envelopeId: result.id } };
}

/* ------------------------- create from uploaded file ------------------------- */

/**
 * Convenience wrapper: upload a file as a document, then create a
 * signature envelope referencing it. Used by the prospect-side
 * "send for signature" flow where there's no existing document yet.
 *
 * Takes FormData so the browser can post a real File object.
 *
 * Required form fields:
 *   - file: File
 *   - subject: string
 *   - signersJson: JSON array of { name, email, roleLabel? }
 *   - prospectId or engagementId
 *   - autoSignAsMe: "true" / "false"
 *   - message (optional)
 */
export async function createEnvelopeFromUpload(
  formData: FormData,
): Promise<ActionResult<{ envelopeId: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file to send." };
  }
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { ok: false, error: "Subject is required." };
  const signersRaw = String(formData.get("signersJson") ?? "[]");
  const message = String(formData.get("message") ?? "").trim() || null;
  const prospectId =
    String(formData.get("prospectId") ?? "").trim() || null;
  const engagementId =
    String(formData.get("engagementId") ?? "").trim() || null;
  const autoSignAsMe = formData.get("autoSignAsMe") === "true";

  let parsedSigners: Array<{
    name: string;
    email: string;
    roleLabel?: string | null;
  }>;
  try {
    parsedSigners = JSON.parse(signersRaw);
  } catch {
    return { ok: false, error: "Signers list was malformed." };
  }
  if (!Array.isArray(parsedSigners) || parsedSigners.length === 0) {
    return { ok: false, error: "Add at least one signer." };
  }

  // Resolve org for the upload. For prospects, master org. For
  // engagements, the engagement's org.
  let orgId: string;
  let resolvedEngagementId: string | null = null;
  if (engagementId) {
    const eng = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ id: engagements.id, orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
      return row ?? null;
    });
    if (!eng) return { ok: false, error: "Engagement not found." };
    orgId = eng.orgId;
    resolvedEngagementId = eng.id;
  } else if (prospectId) {
    const p = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ id: prospects.id, orgId: prospects.orgId })
        .from(prospects)
        .where(eq(prospects.id, prospectId))
        .limit(1);
      return row ?? null;
    });
    if (!p) return { ok: false, error: "Prospect not found." };
    orgId = p.orgId;
  } else {
    return {
      ok: false,
      error: "Either prospectId or engagementId is required.",
    };
  }

  let upload: Awaited<ReturnType<typeof uploadDocumentBlob>>;
  try {
    upload = await uploadDocumentBlob(orgId, file);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed.",
    };
  }

  const sourceDocumentId = await withSystemContext(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        id: upload.documentId,
        orgId,
        engagementId: resolvedEngagementId,
        blobKey: upload.blobKey,
        originalFilename: upload.filename,
        fileType: upload.fileType,
        sizeBytes: upload.sizeBytes,
        uploaderUserProfileId: profile.userProfileId,
      })
      .returning({ id: documents.id });
    return doc.id;
  });

  return createSignatureEnvelope({
    sourceDocumentId,
    prospectId: prospectId ?? null,
    engagementId: resolvedEngagementId ?? null,
    subject,
    message,
    signers: parsedSigners,
    autoSignAsMe,
  });
}

/* --------------------- compose-from-template send path --------------------- */

/**
 * Render markdown the Coach composed in the UI into a PDF, upload
 * it as a documents row, then run the standard signing envelope
 * flow. This is the "compose, then send" pipeline — Bruce writes
 * the actual contract body in The Builder instead of attaching a
 * finished PDF from elsewhere.
 */
export async function createEnvelopeFromComposed(input: {
  prospectId?: string | null;
  engagementId?: string | null;
  subject: string;
  message?: string | null;
  signers: Array<{ name: string; email: string; roleLabel?: string | null }>;
  autoSignAsMe?: boolean;
  /** Title shown at the top of the rendered PDF (and the source
   *  document's filename stem). */
  documentTitle: string;
  /** Markdown body — variables already resolved on the client side
   *  by the time it gets here. Server doesn't substitute. */
  bodyMarkdown: string;
}): Promise<ActionResult<{ envelopeId: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  if (!input.subject.trim()) return { ok: false, error: "Subject is required." };
  if (!input.documentTitle.trim())
    return { ok: false, error: "Document title is required." };
  if (!input.bodyMarkdown.trim() || input.bodyMarkdown.trim().length < 30) {
    return {
      ok: false,
      error:
        "Document body looks too short — write or paste the actual content before sending.",
    };
  }
  if (!Array.isArray(input.signers) || input.signers.length === 0) {
    return { ok: false, error: "Add at least one signer." };
  }

  // Resolve org (same logic as createEnvelopeFromUpload).
  let orgId: string;
  let resolvedEngagementId: string | null = null;
  let headerTitle = "";
  if (input.engagementId) {
    const eng = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          id: engagements.id,
          orgId: engagements.orgId,
          name: engagements.name,
        })
        .from(engagements)
        .where(eq(engagements.id, input.engagementId!))
        .limit(1);
      return row ?? null;
    });
    if (!eng) return { ok: false, error: "Engagement not found." };
    orgId = eng.orgId;
    resolvedEngagementId = eng.id;
    headerTitle = eng.name ?? "";
  } else if (input.prospectId) {
    const p = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          id: prospects.id,
          orgId: prospects.orgId,
          companyName: prospects.companyName,
        })
        .from(prospects)
        .where(eq(prospects.id, input.prospectId!))
        .limit(1);
      return row ?? null;
    });
    if (!p) return { ok: false, error: "Prospect not found." };
    orgId = p.orgId;
    headerTitle = p.companyName;
  } else {
    return {
      ok: false,
      error: "Either prospectId or engagementId is required.",
    };
  }

  // Render markdown → PDF bytes.
  let pdfBytes: Uint8Array;
  try {
    const { renderMarkdownToPdf } = await import(
      "@/lib/signing/markdown-to-pdf"
    );
    pdfBytes = await renderMarkdownToPdf({
      title: input.documentTitle,
      bodyMarkdown: input.bodyMarkdown,
      header: { title: headerTitle },
    });
  } catch (e) {
    console.error("[createEnvelopeFromComposed] PDF render failed:", e);
    return {
      ok: false,
      error:
        "Couldn't render the document into a PDF. Try simpler formatting.",
    };
  }

  // Upload via the same blob path as createEnvelopeFromUpload.
  const filename = `${input.documentTitle.replace(/[^\w\d\- ]+/g, "").slice(0, 80) || "Document"}.pdf`;
  const pdfBuffer = Buffer.from(pdfBytes);
  // Construct a File-shaped value so uploadDocumentBlob can hash it.
  const file = new File([pdfBuffer], filename, { type: "application/pdf" });
  let upload: Awaited<ReturnType<typeof uploadDocumentBlob>>;
  try {
    upload = await uploadDocumentBlob(orgId, file);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed.",
    };
  }

  const sourceDocumentId = await withSystemContext(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        id: upload.documentId,
        orgId,
        engagementId: resolvedEngagementId,
        blobKey: upload.blobKey,
        originalFilename: upload.filename,
        fileType: upload.fileType,
        sizeBytes: upload.sizeBytes,
        uploaderUserProfileId: profile.userProfileId,
      })
      .returning({ id: documents.id });
    return doc.id;
  });

  return createSignatureEnvelope({
    sourceDocumentId,
    prospectId: input.prospectId ?? null,
    engagementId: resolvedEngagementId ?? null,
    subject: input.subject,
    message: input.message ?? null,
    signers: input.signers,
    autoSignAsMe: input.autoSignAsMe ?? false,
  });
}

/* ------------------------- public submit signature ------------------------- */

const submitSchema = z.object({
  token: z.string().min(8).max(80),
  signatureMethod: z.enum(["typed", "drawn"]),
  signatureImageData: z
    .string()
    .min(40) // a few bytes of base64
    .max(800_000) // ~600KB after base64 — plenty for any reasonable signature
    .regex(/^data:image\/(png|jpe?g);base64,/),
  ip: z.string().max(80).nullable().optional(),
  userAgent: z.string().max(500).nullable().optional(),
  /** Verbatim disclosure text the signer agreed to. Persisted into
   *  `signature_signers.consent_text` so we can prove later what THIS
   *  signer agreed to even if the disclosure wording changes. */
  consentText: z.string().min(20).max(8000).optional(),
  /** Version tag of the disclosure text (e.g. "v1-2026-05"). Lets us
   *  track at a glance which copy of the disclosure was in force. */
  consentVersion: z.string().max(60).optional(),
});

export async function submitSignature(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ status: string; allSigned: boolean }>> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid signature submission.",
    };
  const data = parsed.data;

  // Resolve signer + envelope in system context — public action,
  // token IS the auth.
  const ctx = await withSystemContext(async (tx) => {
    const [signer] = await tx
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.publicToken, data.token))
      .limit(1);
    if (!signer) return null;
    const [env] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, signer.envelopeId))
      .limit(1);
    if (!env) return null;
    return { signer, env };
  });
  if (!ctx) return { ok: false, error: "Signing link not found or expired." };

  if (ctx.env.status !== "in_progress") {
    return {
      ok: false,
      error: "This envelope is no longer accepting signatures.",
    };
  }
  if (ctx.signer.status === "signed") {
    return { ok: false, error: "You've already signed this document." };
  }
  if (ctx.signer.status === "declined") {
    return { ok: false, error: "This signing request was declined." };
  }

  // Sequential routing: caller must be the next-in-line signer.
  const next = await getNextPendingSigner(ctx.env.id);
  if (!next || next.id !== ctx.signer.id) {
    return {
      ok: false,
      error:
        "It's not your turn yet — the previous signer hasn't completed. Try again later.",
    };
  }

  // Consent and sign happen in the same submit click, so the consent
  // timestamp lands a fraction of a second before the signature
  // timestamp. We record both — `consentedAt` is the evidentiary
  // anchor for the ESIGN / UETA / Alberta ETA consent prong.
  const now = new Date();
  await withSystemContext(async (tx) => {
    await tx
      .update(signatureSigners)
      .set({
        status: "signed",
        signatureImageData: data.signatureImageData,
        signatureMethod: data.signatureMethod,
        signedAt: now,
        consentedAt: now,
        consentText: data.consentText ?? null,
        signerIp: data.ip ?? null,
        signerUserAgent: data.userAgent ?? null,
      })
      .where(eq(signatureSigners.id, ctx.signer.id));

    const audit = (ctx.env.auditLog as AuditEntry[]) ?? [];
    audit.push(
      makeAuditEntry("signer_consented", {
        signerEmail: ctx.signer.email,
        ip: data.ip ?? null,
      }),
    );
    audit.push(
      makeAuditEntry("signer_signed", {
        signerEmail: ctx.signer.email,
        ip: data.ip ?? null,
      }),
    );
    await tx
      .update(signatureEnvelopes)
      .set({ auditLog: audit })
      .where(eq(signatureEnvelopes.id, ctx.env.id));
  });

  // Anyone left to sign?
  const stillPending = await getNextPendingSigner(ctx.env.id);
  if (stillPending) {
    await emailSignerByRow(stillPending.id, ctx.env.id);
    return {
      ok: true,
      data: { status: "in_progress", allSigned: false },
    };
  }

  // All done — generate signed PDF + complete the envelope.
  await completeEnvelope(ctx.env.id);
  return { ok: true, data: { status: "completed", allSigned: true } };
}

/* ------------------------- mark viewed ------------------------- */

export async function markSigningLinkViewed(
  token: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  await withSystemContext(async (tx) => {
    const [signer] = await tx
      .select({
        id: signatureSigners.id,
        envelopeId: signatureSigners.envelopeId,
        status: signatureSigners.status,
        viewedAt: signatureSigners.viewedAt,
        email: signatureSigners.email,
      })
      .from(signatureSigners)
      .where(eq(signatureSigners.publicToken, token))
      .limit(1);
    if (!signer) return;
    if (signer.status !== "pending" || signer.viewedAt) return;
    await tx
      .update(signatureSigners)
      .set({
        status: "viewed",
        viewedAt: new Date(),
        signerIp: ip,
        signerUserAgent: userAgent,
      })
      .where(eq(signatureSigners.id, signer.id));
    const [env] = await tx
      .select({ auditLog: signatureEnvelopes.auditLog })
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, signer.envelopeId))
      .limit(1);
    if (env) {
      const audit = (env.auditLog as AuditEntry[]) ?? [];
      audit.push(
        makeAuditEntry("signer_viewed", {
          signerEmail: signer.email,
          ip,
        }),
      );
      await tx
        .update(signatureEnvelopes)
        .set({ auditLog: audit })
        .where(eq(signatureEnvelopes.id, signer.envelopeId));
    }
  });
}

/* ------------------------- void / cancel ------------------------- */

export async function voidSignatureEnvelope(
  envelopeId: string,
  reason?: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  await withSystemContext(async (tx) => {
    const [env] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId))
      .limit(1);
    if (!env) throw new Error("Envelope not found.");
    if (env.status !== "in_progress") return;
    const audit = (env.auditLog as AuditEntry[]) ?? [];
    audit.push(
      makeAuditEntry("envelope_voided", {
        by: profile.email,
        ...(reason ? { event: `envelope_voided: ${reason}` } : {}),
      }),
    );
    await tx
      .update(signatureEnvelopes)
      .set({ status: "voided", voidedAt: new Date(), auditLog: audit })
      .where(eq(signatureEnvelopes.id, envelopeId));
  });

  revalidatePath(`/business-builder/envelopes/${envelopeId}`);
  return { ok: true, data: undefined };
}

/* ------------------------- Coach: stored signature ------------------------- */

const uploadSignatureSchema = z.object({
  signatureImageData: z
    .string()
    .min(40)
    .max(800_000)
    .regex(/^data:image\/(png|jpe?g);base64,/),
});

export async function uploadMySignatureImage(
  input: z.input<typeof uploadSignatureSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = uploadSignatureSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid signature image.",
    };

  await withSystemContext(async (tx) => {
    await tx
      .update(userProfiles)
      .set({ signatureImageData: parsed.data.signatureImageData })
      .where(eq(userProfiles.id, profile.userProfileId));
  });
  revalidatePath("/business-builder/profile/signature");
  return { ok: true, data: undefined };
}

export async function clearMySignatureImage(): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  await withSystemContext(async (tx) => {
    await tx
      .update(userProfiles)
      .set({ signatureImageData: null })
      .where(eq(userProfiles.id, profile.userProfileId));
  });
  revalidatePath("/business-builder/profile/signature");
  return { ok: true, data: undefined };
}

/* ------------------------- internal helpers ------------------------- */

async function getNextPendingSigner(
  envelopeId: string,
): Promise<{ id: string; orderIndex: number } | null> {
  return withSystemContext(async (tx) => {
    const rows = await tx
      .select({
        id: signatureSigners.id,
        orderIndex: signatureSigners.orderIndex,
        status: signatureSigners.status,
      })
      .from(signatureSigners)
      .where(eq(signatureSigners.envelopeId, envelopeId))
      .orderBy(asc(signatureSigners.orderIndex));
    for (const r of rows) {
      if (r.status === "pending" || r.status === "viewed") {
        return { id: r.id, orderIndex: r.orderIndex };
      }
    }
    return null;
  });
}

async function emailNextPendingSigner(
  envelopeId: string,
  senderName: string,
): Promise<void> {
  const next = await getNextPendingSigner(envelopeId);
  if (!next) return;
  await emailSignerByRow(next.id, envelopeId, senderName);
}

async function emailSignerByRow(
  signerId: string,
  envelopeId: string,
  senderNameHint?: string,
): Promise<void> {
  const ctx = await withSystemContext(async (tx) => {
    const [signer] = await tx
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.id, signerId))
      .limit(1);
    if (!signer) return null;
    const [env] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId))
      .limit(1);
    if (!env) return null;
    let senderName = senderNameHint ?? "Bruce Baker";
    if (env.createdByUserProfileId) {
      const [creator] = await tx
        .select({ fullName: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.id, env.createdByUserProfileId))
        .limit(1);
      if (creator?.fullName) senderName = creator.fullName;
    }
    return { signer, env, senderName };
  });
  if (!ctx) return;

  // Signature requests are transactional and explicitly user-triggered
  // — they bypass the working-hours guard so the signer doesn't have
  // to wait until Monday morning to receive their link.
  await sendEmailQuietly({
    ...signatureRequestEmail({
      to: ctx.signer.email,
      signerName: ctx.signer.name,
      senderName: ctx.senderName,
      envelopeSubject: ctx.env.subject,
      message: ctx.env.message,
      signUrl: `/sign/${ctx.signer.publicToken}`,
    }),
    bypassWorkingHours: true,
  });

  await withSystemContext(async (tx) => {
    const audit = (ctx.env.auditLog as AuditEntry[]) ?? [];
    audit.push(
      makeAuditEntry("signer_emailed", {
        signerEmail: ctx.signer.email,
      }),
    );
    await tx
      .update(signatureEnvelopes)
      .set({ auditLog: audit })
      .where(eq(signatureEnvelopes.id, ctx.env.id));
  });
}

async function completeEnvelope(envelopeId: string): Promise<void> {
  // Load everything needed to build the signed PDF.
  const ctx = await withSystemContext(async (tx) => {
    const [env] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId))
      .limit(1);
    if (!env) return null;
    const [doc] = await tx
      .select()
      .from(documents)
      .where(eq(documents.id, env.sourceDocumentId))
      .limit(1);
    if (!doc) return null;
    const signers = await tx
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.envelopeId, envelopeId))
      .orderBy(asc(signatureSigners.orderIndex));
    let createdByName: string | null = null;
    let createdByEmail: string | null = null;
    if (env.createdByUserProfileId) {
      const [creator] = await tx
        .select({
          fullName: userProfiles.fullName,
          email: userProfiles.email,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, env.createdByUserProfileId))
        .limit(1);
      createdByName = creator?.fullName ?? null;
      createdByEmail = creator?.email ?? null;
    }
    return { env, doc, signers, createdByName, createdByEmail };
  });
  if (!ctx) return;

  // Pull the source PDF bytes from Blobs.
  const sourceBlob = await downloadDocumentBlob(ctx.doc.blobKey);
  if (!sourceBlob) {
    console.error(
      `[signing] source blob missing for envelope ${envelopeId}; cannot generate signed PDF.`,
    );
    return;
  }

  const auditTimeline = ((ctx.env.auditLog as AuditEntry[]) ?? []).map(
    (e) => ({
      at: new Date(e.at),
      event: e.signerEmail
        ? `${e.event} — ${e.signerEmail}`
        : e.by
          ? `${e.event} — ${e.by}`
          : e.event,
    }),
  );

  // SHA-256 of the source PDF. Renders into the certificate so anyone
  // can verify which exact file got signed.
  const { createHash } = await import("node:crypto");
  const sourceBytes =
    sourceBlob.body instanceof Uint8Array
      ? sourceBlob.body
      : new Uint8Array(sourceBlob.body as ArrayBuffer);
  const sourceDocumentHash = createHash("sha256")
    .update(sourceBytes)
    .digest("hex");

  const completedAt = new Date();
  let signedBytes: Uint8Array;
  try {
    signedBytes = await buildSignedPdf(sourceBlob.body, {
      envelopeId: ctx.env.id,
      documentName: ctx.doc.originalFilename,
      sourceDocumentHash,
      envelopeCreatedAt: ctx.env.createdAt ?? null,
      envelopeCompletedAt: completedAt,
      senderName: ctx.createdByName,
      senderEmail: ctx.createdByEmail,
      signers: ctx.signers.map((s) => ({
        name: s.name,
        email: s.email,
        roleLabel: s.roleLabel,
        signedAt: s.signedAt ?? new Date(),
        viewedAt: s.viewedAt ?? null,
        consentedAt: s.consentedAt ?? null,
        signerIp: s.signerIp,
        signerUserAgent: s.signerUserAgent,
        signatureMethod: s.signatureMethod,
        signatureImageData: s.signatureImageData,
      })),
      auditTimeline,
    });
  } catch (e) {
    console.error("[signing] PDF build failed:", e);
    return;
  }

  // Hash the FINAL signed PDF too — that's what gets stored on the
  // envelope row so anyone can verify the signed file later.
  const signedDocumentHash = createHash("sha256")
    .update(signedBytes)
    .digest("hex");

  const signedFilename = `${ctx.env.subject.slice(0, 80).replace(/[^\w\- ]+/g, "_")} — signed.pdf`;
  // Copy into a fresh ArrayBuffer to satisfy the BlobPart constraint
  // (Uint8Array<SharedArrayBuffer> isn't assignable to BlobPart in TS).
  const signedAb = new ArrayBuffer(signedBytes.byteLength);
  new Uint8Array(signedAb).set(signedBytes);
  const file = new File([signedAb], signedFilename, {
    type: "application/pdf",
  });

  const upload = await uploadDocumentBlob(ctx.env.orgId, file);
  const signedDocId = await withSystemContext(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        id: upload.documentId,
        orgId: ctx.env.orgId,
        engagementId: ctx.env.engagementId ?? ctx.doc.engagementId,
        blobKey: upload.blobKey,
        originalFilename: upload.filename,
        fileType: upload.fileType,
        sizeBytes: upload.sizeBytes,
        uploaderUserProfileId: null,
      })
      .returning({ id: documents.id });
    const audit = (ctx.env.auditLog as AuditEntry[]) ?? [];
    audit.push(makeAuditEntry("envelope_completed"));
    await tx
      .update(signatureEnvelopes)
      .set({
        status: "completed",
        completedAt,
        signedDocumentId: doc.id,
        signedDocumentHash,
        auditLog: audit,
      })
      .where(eq(signatureEnvelopes.id, ctx.env.id));
    if (ctx.env.prospectId) {
      await tx
        .update(prospects)
        .set({ status: "contract_signed" })
        .where(eq(prospects.id, ctx.env.prospectId));
    }
    return doc.id;
  });

  // Email the signed copy to every signer + the sender.
  const recipientList: string[] = [];
  const seen = new Set<string>();
  for (const s of ctx.signers) {
    if (!seen.has(s.email)) {
      seen.add(s.email);
      recipientList.push(s.email);
    }
  }
  if (ctx.createdByEmail && !seen.has(ctx.createdByEmail)) {
    recipientList.push(ctx.createdByEmail);
  }

  for (const email of recipientList) {
    const isSender = email === ctx.createdByEmail;
    const recipientName =
      ctx.signers.find((s) => s.email === email)?.name ??
      ctx.createdByName ??
      "there";
    await sendEmailQuietly({
      ...signatureCompletedEmail({
        to: email,
        recipientName,
        envelopeSubject: ctx.env.subject,
        envelopeUrl: isSender
          ? `/business-builder/envelopes/${ctx.env.id}`
          : `/sign/done/${signedDocId}`,
        isSender,
      }),
      attachments: [
        {
          filename: signedFilename,
          content: Buffer.from(signedBytes),
          contentType: "application/pdf",
        },
      ],
      bypassWorkingHours: true,
    });
  }

  // Pick the engagement to revalidate, if linked.
  if (ctx.env.engagementId) {
    revalidatePath(`/business-builder/documents/${ctx.env.engagementId}`);
    revalidatePath(`/portal/documents`);
  }
  revalidatePath(`/business-builder/envelopes/${ctx.env.id}`);
  revalidatePath(`/business-builder/pipeline`);
}

// Suppress unused-import warning for resolveEngagementIdFromRecord —
// kept for future use when engagement-scoped envelope listing lands.
void resolveEngagementIdFromRecord;
void engagements;
void and;
