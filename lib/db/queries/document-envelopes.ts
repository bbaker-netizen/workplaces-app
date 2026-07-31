/**
 * Which documents are halves of a signing envelope.
 *
 * Shared by the prospect panel and the engagement Documents page so the
 * two cannot disagree about whether a file is an agreement's sent copy or
 * its executed copy. That disagreement is the whole failure mode being
 * fixed here — a signed contract that reads as a duplicate on one screen
 * and an unrelated upload on another is a contract somebody deletes.
 */

import { inArray, or } from "drizzle-orm";
import { signatureEnvelopes } from "@/lib/db/schema";
import type { EnvelopeRole } from "@/lib/documents/presentation";

export type DocumentEnvelopeRef = {
  envelopeId: string;
  envelopeSubject: string;
  envelopeStatus: string;
  envelopeRole: EnvelopeRole;
};

/**
 * Resolve a batch of document ids to their envelope, if any.
 *
 * Takes the transaction so the caller decides the tenant context — this
 * is read inside both an RLS-scoped engagement context and a system
 * context, and it must not choose one on their behalf.
 */
export async function envelopeRefsForDocuments(
  // The concrete Drizzle transaction type differs between the tenant
  // helpers; all this needs is `.select()`, so it is structural.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  documentIds: string[],
): Promise<Map<string, DocumentEnvelopeRef>> {
  const out = new Map<string, DocumentEnvelopeRef>();
  if (documentIds.length === 0) return out;

  const rows: Array<{
    id: string;
    subject: string;
    status: string;
    sourceDocumentId: string | null;
    signedDocumentId: string | null;
  }> = await tx
    .select({
      id: signatureEnvelopes.id,
      subject: signatureEnvelopes.subject,
      status: signatureEnvelopes.status,
      sourceDocumentId: signatureEnvelopes.sourceDocumentId,
      signedDocumentId: signatureEnvelopes.signedDocumentId,
    })
    .from(signatureEnvelopes)
    .where(
      or(
        inArray(signatureEnvelopes.sourceDocumentId, documentIds),
        inArray(signatureEnvelopes.signedDocumentId, documentIds),
      ),
    );

  const wanted = new Set(documentIds);
  for (const e of rows) {
    if (e.sourceDocumentId && wanted.has(e.sourceDocumentId)) {
      out.set(e.sourceDocumentId, {
        envelopeId: e.id,
        envelopeSubject: e.subject,
        envelopeStatus: e.status,
        envelopeRole: "source",
      });
    }
    // Deliberately after the source branch: if an envelope somehow
    // pointed at the same document twice, "signed" is the safer label —
    // it is the one that triggers the stronger delete warning.
    if (e.signedDocumentId && wanted.has(e.signedDocumentId)) {
      out.set(e.signedDocumentId, {
        envelopeId: e.id,
        envelopeSubject: e.subject,
        envelopeStatus: e.status,
        envelopeRole: "signed",
      });
    }
  }
  return out;
}
