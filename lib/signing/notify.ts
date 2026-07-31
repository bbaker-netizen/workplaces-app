/**
 * Emailing signers — moved out of `lib/actions/signatures.ts`.
 *
 * **Why it lives here.** Every export of a `"use server"` module becomes
 * a POST endpoint a browser can call, and such a module may only export
 * async functions. That makes it the wrong home for logic that other
 * server-side code needs to reuse: the "Start onboarding" sequence runs
 * in a Netlify Background Function, where there is no Clerk session at
 * all, so it cannot go through the server actions.
 *
 * Same shape as `lib/integrations/fireflies-sync.ts` and
 * `lib/calendar/sync.ts` — the work lives in a plain module, and
 * `lib/actions/` keeps only the session-guarded wrapper. Duplicating it
 * instead would give two copies of the signer-notification rules to keep
 * in step, and the one that drifted would be the one nobody was looking
 * at.
 */

import { asc, eq } from "drizzle-orm";
import { signatureEnvelopes, signatureSigners, userProfiles } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { signatureRequestEmail } from "@/lib/email/templates";
import { makeAuditEntry, type AuditEntry } from "@/lib/signing/audit";

export async function getNextPendingSigner(
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

export async function emailNextPendingSigner(
  envelopeId: string,
  senderName: string,
): Promise<void> {
  const next = await getNextPendingSigner(envelopeId);
  if (!next) return;
  await emailSignerByRow(next.id, envelopeId, senderName);
}

export async function emailSignerByRow(
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
