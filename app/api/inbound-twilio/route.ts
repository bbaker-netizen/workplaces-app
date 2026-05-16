/**
 * Twilio inbound webhook — accepts SMS and WhatsApp messages from
 * Twilio's "When a message comes in" hook. Routes the message to a
 * prospect (matched by phone number on the prospects.contactEmail's
 * sibling field `prospects.phone`) or to the master inbox if no match.
 *
 * Auth: Twilio signs requests with X-Twilio-Signature using your auth
 * token + the full URL + sorted params. We verify with HMAC-SHA1.
 *
 * Twilio posts as application/x-www-form-urlencoded. Important params:
 *   - From: sender E.164 number (e.g. "+17805551234") for SMS, or
 *           "whatsapp:+17805551234" for WhatsApp.
 *   - To:   the workspace number (same form).
 *   - Body: the message text.
 *   - MessageSid: provider id (used for dedupe).
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  clientCommunications,
  prospects,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Compute Twilio's X-Twilio-Signature for verification. */
function computeSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  // Twilio: signature = base64(HMAC-SHA1(authToken, URL + sortedParamsConcat))
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  return createHmac("sha1", authToken).update(data).digest("base64");
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function normalizePhone(addr: string): string {
  const trimmed = addr.trim();
  const m = trimmed.match(/\+?\d+/);
  return m ? (m[0].startsWith("+") ? m[0] : `+${m[0]}`) : trimmed;
}

export async function POST(req: Request): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json(
      { ok: false, error: "Twilio not configured." },
      { status: 500 },
    );
  }

  const formText = await req.text();
  const formParams = Object.fromEntries(new URLSearchParams(formText));

  // Verify Twilio signature.
  const sig = req.headers.get("x-twilio-signature");
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "Missing signature." },
      { status: 401 },
    );
  }
  // Twilio signs the *publicly-reachable* URL. NEXT_PUBLIC_APP_URL is the
  // canonical base; fall back to constructing from headers.
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get("host")}`
  ).replace(/\/+$/, "");
  const fullUrl = `${baseUrl}/api/inbound-twilio`;
  const expected = computeSignature(authToken, fullUrl, formParams);
  if (!safeEq(sig, expected)) {
    return NextResponse.json(
      { ok: false, error: "Bad signature." },
      { status: 401 },
    );
  }

  const fromRaw = formParams.From ?? "";
  const toRaw = formParams.To ?? "";
  const body = formParams.Body ?? "";
  const messageSid = formParams.MessageSid ?? null;
  const channel = "sms" as const;

  const fromPhone = normalizePhone(fromRaw);
  const toPhone = normalizePhone(toRaw);

  // Find a prospect with a matching phone number. Use system context
  // because we don't know the org yet.
  const match = await withSystemContext(async (tx) => {
    const [p] = await tx
      .select({ id: prospects.id, orgId: prospects.orgId })
      .from(prospects)
      .where(eq(prospects.phone, fromPhone))
      .limit(1);
    return p ?? null;
  });

  if (!match) {
    // Inbound from someone not in the CRM — accept 200 so Twilio doesn't
    // retry forever, but log so Bruce can see misroutes during setup.
    console.warn(
      `[inbound-twilio] no prospect matched phone ${fromPhone}; channel=${channel}`,
    );
    return NextResponse.json({ ok: true, routed: false });
  }

  try {
    await withTenantContext(match.orgId, async (tx) => {
      await tx
        .insert(clientCommunications)
        .values({
          orgId: match.orgId,
          prospectId: match.id,
          engagementId: null,
          channel,
          direction: "inbound",
          fromAddress: fromPhone,
          toAddresses: [toPhone],
          subject: null,
          body,
          threadKey: fromPhone, // group by sender number
          externalId: messageSid,
          occurredAt: new Date(),
          tags: [],
        })
        .onConflictDoNothing();
    });
    return NextResponse.json({ ok: true, routed: true });
  } catch (e) {
    console.error("[inbound-twilio] write failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Server error.",
      },
      { status: 500 },
    );
  }
}
