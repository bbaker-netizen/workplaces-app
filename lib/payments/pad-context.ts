/**
 * Everything the PAD form needs about the practice, the client, and the
 * amount — plus the one place encrypted banking answers are decrypted.
 *
 * Deliberately NOT a "use server" module. Every export of one becomes a
 * POST endpoint reachable from a browser, and `renderCompletedPadForm`
 * decrypts bank account numbers. It stays a plain module that only the
 * server-side signing pipeline imports.
 */

import { eq } from "drizzle-orm";
import {
  engagements,
  orgs,
  prospects,
  signatureEnvelopes,
  signatureSigners,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { decryptSecret } from "@/lib/crypto/secret-vault";
import { renderPadFormPdf } from "@/lib/payments/pad-form";

export type PadContext = {
  payeeName: string;
  payeeAddress: string | null;
  clientCompany: string | null;
  amountLabel: string;
};

/** Practice details, client details, and the amount being authorized. */
export async function loadPadContext(env: {
  orgId: string;
  prospectId: string | null;
  engagementId: string | null;
}): Promise<PadContext> {
  return withSystemContext(async (tx) => {
    const [org] = await tx
      .select({
        name: orgs.name,
        legalName: orgs.legalName,
        address: orgs.businessAddress,
        city: orgs.businessCity,
        province: orgs.businessProvince,
      })
      .from(orgs)
      .where(eq(orgs.id, env.orgId))
      .limit(1);

    let clientCompany: string | null = null;
    let feeCents: number | null = null;

    if (env.prospectId) {
      const [p] = await tx
        .select({ company: prospects.companyName })
        .from(prospects)
        .where(eq(prospects.id, env.prospectId))
        .limit(1);
      clientCompany = p?.company ?? null;
    }
    if (env.engagementId) {
      const [e] = await tx
        .select({ name: engagements.name, fee: engagements.monthlyFeeCents })
        .from(engagements)
        .where(eq(engagements.id, env.engagementId))
        .limit(1);
      clientCompany = clientCompany ?? e?.name ?? null;
      feeCents = e?.fee ?? null;
    }

    const addr = [org?.address, org?.city, org?.province]
      .filter(Boolean)
      .join(", ");

    return {
      payeeName: org?.legalName || org?.name || "Workplaces",
      payeeAddress: addr || null,
      clientCompany,
      // Stated on the form the client signs. With no fee recorded we say so
      // in words rather than print "$0.00" — a bank would reject that and a
      // client would rightly query it.
      amountLabel: feeCents
        ? `the agreed monthly program fee of $${(feeCents / 100).toLocaleString(
            "en-CA",
            { minimumFractionDigits: 2, maximumFractionDigits: 2 },
          )} CAD, debited monthly`
        : "the agreed monthly program fee, debited monthly",
    };
  });
}

/**
 * Re-render the PAD form with the client's captured answers filled in.
 *
 * The ONLY place encrypted banking values are decrypted. Nothing in the
 * console reads them back: a Business Builder sees that the form was
 * completed, and the numbers exist solely inside the signed PDF the bank
 * needs.
 *
 * Returns null on any failure so the caller falls back to the blank source
 * rather than losing the signature — the certificate of completion still
 * carries who signed, when, and from where, which is the part with legal
 * weight.
 */
export async function renderCompletedPadForm(
  env: typeof signatureEnvelopes.$inferSelect,
  signers: Array<typeof signatureSigners.$inferSelect>,
): Promise<Uint8Array | null> {
  try {
    const payor = signers.find((s) => s.fieldValuesEncrypted);
    if (!payor?.fieldValuesEncrypted) return null;
    const values = JSON.parse(
      decryptSecret(payor.fieldValuesEncrypted),
    ) as Record<string, string>;
    const ctx = await loadPadContext({
      orgId: env.orgId,
      prospectId: env.prospectId ?? null,
      engagementId: env.engagementId ?? null,
    });
    return await renderPadFormPdf({
      payeeName: ctx.payeeName,
      payeeAddress: ctx.payeeAddress,
      clientName: payor.name,
      clientCompany: ctx.clientCompany,
      amountLabel: ctx.amountLabel,
      values,
    });
  } catch (e) {
    console.error("[signing] could not render completed PAD form:", e);
    return null;
  }
}
