"use server";

/**
 * Send a client the pre-authorized debit (PAD) form to complete and sign.
 *
 * Rides the existing e-signing envelope rather than a parallel form
 * system: same public token, same audit log, same completion pipeline,
 * same filing onto the client's documents. The blank form generated here
 * is what gets emailed; the copy that ends up signed is the completed one.
 *
 * Credit cards are deliberately not handled here. Card numbers are never
 * collected by this application — the practice's hosted payment page is
 * linked instead, so card data goes straight to the processor.
 */

import { eq } from "drizzle-orm";
import { ensureUserProfile } from "@/lib/db/provisioning";
import { documents, engagements, prospects } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { canCurrentBbWriteProspect } from "@/lib/db/queries/prospects";
import { canCurrentBbAccessEngagement } from "@/lib/db/queries/bb-access";
import { uploadDocumentBlob } from "@/lib/storage/blobs";
import { renderPadFormPdf } from "@/lib/payments/pad-form";
import { loadPadContext } from "@/lib/payments/pad-context";
import { createSignatureEnvelope } from "@/lib/actions/signatures";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function requestPaymentAuthorization(input: {
  prospectId?: string | null;
  engagementId?: string | null;
  signerName: string;
  signerEmail: string;
  message?: string | null;
}): Promise<ActionResult<{ envelopeId: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const name = input.signerName?.trim();
  const email = input.signerEmail?.trim().toLowerCase();
  if (!name) return { ok: false, error: "Who is signing? Add their name." };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Add a valid email for the signer." };

  // Resolve the owning org, and check access the same way the agreement
  // path does — this emails a client and writes to their file.
  let orgId: string;
  let engagementId: string | null = null;
  if (input.engagementId) {
    if (!(await canCurrentBbAccessEngagement(input.engagementId)))
      return { ok: false, error: "You don't have access to that client." };
    const row = await withSystemContext(async (tx) => {
      const [e] = await tx
        .select({ id: engagements.id, orgId: engagements.orgId })
        .from(engagements)
        .where(eq(engagements.id, input.engagementId as string))
        .limit(1);
      return e ?? null;
    });
    if (!row) return { ok: false, error: "Client not found." };
    orgId = row.orgId;
    engagementId = row.id;
  } else if (input.prospectId) {
    if (!(await canCurrentBbWriteProspect(input.prospectId)))
      return { ok: false, error: "You don't have access to that lead." };
    const row = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({ orgId: prospects.orgId })
        .from(prospects)
        .where(eq(prospects.id, input.prospectId as string))
        .limit(1);
      return p ?? null;
    });
    if (!row) return { ok: false, error: "Lead not found." };
    orgId = row.orgId;
  } else {
    return { ok: false, error: "Pick a lead or a client first." };
  }

  const padCtx = await loadPadContext({
    orgId,
    prospectId: input.prospectId ?? null,
    engagementId,
  });

  let sourceDocumentId: string;
  try {
    const blank = await renderPadFormPdf({
      payeeName: padCtx.payeeName,
      payeeAddress: padCtx.payeeAddress,
      clientName: name,
      clientCompany: padCtx.clientCompany,
      amountLabel: padCtx.amountLabel,
      values: null,
    });
    const file = new File(
      [new Uint8Array(blank)],
      "Pre-authorized debit form.pdf",
      { type: "application/pdf" },
    );
    const upload = await uploadDocumentBlob(orgId, file);
    sourceDocumentId = await withSystemContext(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({
          id: upload.documentId,
          orgId,
          engagementId,
          prospectId: input.prospectId ?? null,
          blobKey: upload.blobKey,
          originalFilename: upload.filename,
          fileType: upload.fileType,
          sizeBytes: upload.sizeBytes,
          uploaderUserProfileId: profile.userProfileId,
        })
        .returning({ id: documents.id });
      return doc.id;
    });
  } catch (e) {
    console.error("[payment-auth] PAD form generation failed:", e);
    return {
      ok: false,
      error: `Couldn't prepare the PAD form: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  return createSignatureEnvelope({
    sourceDocumentId,
    kind: "payment_authorization",
    prospectId: input.prospectId ?? null,
    engagementId,
    subject: "Pre-authorized debit authorization",
    message:
      input.message ??
      "Please add your banking details and sign. They go straight onto the signed form — nobody re-keys them.",
    signers: [{ name, email, roleLabel: "Account holder" }],
    // The practice does not counter-sign a PAD authorization: the payor
    // authorizes, and the payee is named on the form itself.
    autoSignAsMe: false,
  });
}
