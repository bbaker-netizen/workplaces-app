/**
 * QuickBooks Online webhook handler.
 *
 * Phase 4.6. Intuit fires this when entities in the connected QBO
 * company file change — we care about Invoice updates so paid /
 * voided status flows back into our `invoices` table.
 *
 * Auth: Intuit signs the request body with HMAC-SHA256 using the
 * `QBO_WEBHOOK_VERIFIER_TOKEN`. The signature is in the
 * `intuit-signature` header (base64). We verify before processing.
 *
 * Setup: configure the webhook URL + verifier token in the Intuit
 * Developer dashboard for the app: https://developer.intuit.com.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  invoices,
  qboOauthTokens,
  type QboOauthToken,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import {
  getInvoice,
  getValidQboCredentials,
} from "@/lib/integrations/qbo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type QboWebhookPayload = {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: Array<{
        name: string;
        id: string;
        operation: "Create" | "Update" | "Delete" | "Merge" | "Void" | "Emailed";
        lastUpdated: string;
      }>;
    };
  }>;
};

export async function POST(req: Request): Promise<Response> {
  const verifier = process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
  const raw = await req.text();

  if (verifier) {
    const sigHeader = req.headers.get("intuit-signature");
    if (!sigHeader) {
      return NextResponse.json(
        { error: "Missing intuit-signature header." },
        { status: 401 },
      );
    }
    const expected = createHmac("sha256", verifier)
      .update(raw)
      .digest("base64");
    const sigBuf = Buffer.from(sigHeader, "base64");
    const expBuf = Buffer.from(expected, "base64");
    if (
      sigBuf.length !== expBuf.length ||
      !timingSafeEqual(sigBuf, expBuf)
    ) {
      return NextResponse.json(
        { error: "Invalid signature." },
        { status: 401 },
      );
    }
  }

  let payload: QboWebhookPayload;
  try {
    payload = JSON.parse(raw) as QboWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON." },
      { status: 400 },
    );
  }

  for (const note of payload.eventNotifications ?? []) {
    const realmId = note.realmId;
    for (const entity of note.dataChangeEvent.entities ?? []) {
      if (entity.name !== "Invoice") continue;
      try {
        await processInvoiceEvent(realmId, entity.id, entity.operation);
      } catch (e) {
        console.error("[qbo-webhook] processing failed:", e);
        // Continue — Intuit retries on 5xx, so don't fail the whole
        // batch on a single entity.
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function processInvoiceEvent(
  realmId: string,
  invoiceId: string,
  operation: string,
): Promise<void> {
  // Find which Coach owns this realm so we can refresh their token.
  const tokenRow = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select()
      .from(qboOauthTokens)
      .where(eq(qboOauthTokens.realmId, realmId))
      .limit(1);
    return (row as QboOauthToken | undefined) ?? null;
  });
  if (!tokenRow) {
    console.warn(
      `[qbo-webhook] no stored token for realm ${realmId}; skipping.`,
    );
    return;
  }
  const creds = await getValidQboCredentials(tokenRow.coachUserProfileId);
  if (!creds) return;

  if (operation === "Delete" || operation === "Void") {
    await withSystemContext(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "void" })
        .where(eq(invoices.qboInvoiceId, invoiceId));
    });
    return;
  }

  // Re-fetch the invoice and mirror current state.
  const inv = await getInvoice(creds.accessToken, creds.realmId, invoiceId);
  const totalCents = Math.round(inv.TotalAmt * 100);
  const balanceCents = Math.round(inv.Balance * 100);
  const status: "paid" | "sent" = balanceCents === 0 ? "paid" : "sent";

  await withSystemContext(async (tx) => {
    await tx
      .update(invoices)
      .set({
        amountCents: totalCents,
        status,
        paidAt:
          balanceCents === 0
            ? new Date()
            : null,
        number: inv.DocNumber ?? null,
        dueAt: inv.DueDate ? new Date(inv.DueDate) : null,
      })
      .where(eq(invoices.qboInvoiceId, invoiceId));
  });
}
