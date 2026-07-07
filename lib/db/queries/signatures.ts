/**
 * Signature envelope read queries.
 *
 * Phase 4.5. Two surfaces:
 *   - `getEnvelopeByToken` — public, used by /sign/[token] to render
 *     the document + signing panel.
 *   - `getEnvelopeForCoach` + `listEnvelopesForProspect` /
 *     `listEnvelopesForEngagement` — Business-Builder-side detail and pipeline.
 */

import { asc, desc, eq } from "drizzle-orm";
import {
  documents,
  signatureEnvelopes,
  signatureSigners,
  type SignatureEnvelope,
  type SignatureSigner,
} from "../schema";
import { withSystemContext } from "../tenant";
import { ensureUserProfile } from "../provisioning";
import { canCurrentBbAccessEngagement } from "./bb-access";

export type EnvelopeWithSigners = SignatureEnvelope & {
  signers: SignatureSigner[];
  sourceDocument: {
    id: string;
    originalFilename: string;
    fileType: string;
    sizeBytes: number;
  } | null;
  signedDocument: {
    id: string;
    originalFilename: string;
  } | null;
};

export type SigningPageData = {
  envelopeId: string;
  envelopeSubject: string;
  envelopeMessage: string | null;
  envelopeStatus: string;
  signer: SignatureSigner;
  isYourTurn: boolean;
  sourceDocument: {
    id: string;
    originalFilename: string;
    fileType: string;
    sizeBytes: number;
  };
  signedDocument: {
    id: string;
    originalFilename: string;
  } | null;
  otherSigners: Array<{
    name: string;
    roleLabel: string | null;
    status: string;
    signedAt: Date | null;
  }>;
};

export async function getEnvelopeByToken(
  token: string,
): Promise<SigningPageData | null> {
  if (!token) return null;
  return withSystemContext(async (tx) => {
    const [signer] = await tx
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.publicToken, token))
      .limit(1);
    if (!signer) return null;
    const [env] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, signer.envelopeId))
      .limit(1);
    if (!env) return null;
    const [doc] = await tx
      .select({
        id: documents.id,
        originalFilename: documents.originalFilename,
        fileType: documents.fileType,
        sizeBytes: documents.sizeBytes,
      })
      .from(documents)
      .where(eq(documents.id, env.sourceDocumentId))
      .limit(1);
    const signedDoc = env.signedDocumentId
      ? (
          await tx
            .select({
              id: documents.id,
              originalFilename: documents.originalFilename,
            })
            .from(documents)
            .where(eq(documents.id, env.signedDocumentId))
            .limit(1)
        )[0] ?? null
      : null;
    if (!doc) return null;
    const allSigners = await tx
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.envelopeId, signer.envelopeId))
      .orderBy(asc(signatureSigners.orderIndex));
    const isYourTurn = (() => {
      for (const s of allSigners) {
        if (s.status === "signed") continue;
        return s.id === signer.id;
      }
      return false;
    })();
    return {
      envelopeId: env.id,
      envelopeSubject: env.subject,
      envelopeMessage: env.message,
      envelopeStatus: env.status,
      signer,
      isYourTurn,
      sourceDocument: {
        id: doc.id,
        originalFilename: doc.originalFilename,
        fileType: doc.fileType,
        sizeBytes: Number(doc.sizeBytes),
      },
      signedDocument: signedDoc,
      otherSigners: allSigners
        .filter((s) => s.id !== signer.id)
        .map((s) => ({
          name: s.name,
          roleLabel: s.roleLabel,
          status: s.status,
          signedAt: s.signedAt,
        })),
    };
  });
}

export async function getEnvelopeForCoach(
  envelopeId: string,
): Promise<EnvelopeWithSigners | null> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return null;
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return null;

  // A coach restricted to specific clients may only read envelopes for
  // engagements they were granted (master_admin / all-clients pass).
  const envEngagementId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ engagementId: signatureEnvelopes.engagementId })
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId))
      .limit(1);
    return row?.engagementId ?? null;
  });
  if (!envEngagementId) return null;
  if (!(await canCurrentBbAccessEngagement(envEngagementId))) return null;

  return withSystemContext(async (tx) => {
    const [env] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId))
      .limit(1);
    if (!env) return null;
    const signers = await tx
      .select()
      .from(signatureSigners)
      .where(eq(signatureSigners.envelopeId, envelopeId))
      .orderBy(asc(signatureSigners.orderIndex));
    const [src] = await tx
      .select({
        id: documents.id,
        originalFilename: documents.originalFilename,
        fileType: documents.fileType,
        sizeBytes: documents.sizeBytes,
      })
      .from(documents)
      .where(eq(documents.id, env.sourceDocumentId))
      .limit(1);
    const signed = env.signedDocumentId
      ? (
          await tx
            .select({
              id: documents.id,
              originalFilename: documents.originalFilename,
            })
            .from(documents)
            .where(eq(documents.id, env.signedDocumentId))
            .limit(1)
        )[0] ?? null
      : null;
    return {
      ...env,
      signers,
      sourceDocument: src
        ? {
            id: src.id,
            originalFilename: src.originalFilename,
            fileType: src.fileType,
            sizeBytes: Number(src.sizeBytes),
          }
        : null,
      signedDocument: signed,
    };
  });
}

export async function listEnvelopesForProspect(
  prospectId: string,
): Promise<SignatureEnvelope[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  if (profile.role !== "master_admin" && profile.role !== "coach") return [];
  return withSystemContext(async (tx) =>
    tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.prospectId, prospectId))
      .orderBy(desc(signatureEnvelopes.createdAt)),
  );
}

export async function listEnvelopesForEngagement(
  engagementId: string,
): Promise<SignatureEnvelope[]> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") return [];
  // Restricted coaches only see envelopes for granted engagements.
  if (!(await canCurrentBbAccessEngagement(engagementId))) return [];
  return withSystemContext(async (tx) =>
    tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.engagementId, engagementId))
      .orderBy(desc(signatureEnvelopes.createdAt)),
  );
}
