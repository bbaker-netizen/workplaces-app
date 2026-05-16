/**
 * Inbound email webhook.
 *
 * Designed to accept a Resend inbound webhook payload (the simplest
 * provider in our stack), but the shape is intentionally permissive so
 * other providers (Mailgun, SES, Postmark) can post with minor adapters.
 *
 * Routing rule: we look at every recipient address (to, cc, bcc) and
 * match each local-part against the `communication_aliases.alias`
 * column. The first match wins; the email is attached to that
 * prospect or engagement.
 *
 * Auth: shared secret in the `x-webhook-secret` header. Configure
 * `INBOUND_EMAIL_WEBHOOK_SECRET` in env. Reject everything else.
 *
 * Idempotency: we write `client_communications.external_id` to the
 * provider's message id. The UNIQUE INDEX on (org_id, channel,
 * external_id) means re-deliveries are silently ignored.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  clientCommunications,
  communicationAliases,
  prospectActivities,
} from "@/lib/db/schema";
import { withSystemContext, withTenantContext } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InboundPayload = {
  /** Provider message id, used for idempotency. */
  message_id?: string;
  messageId?: string;
  from?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  /** ISO timestamp from the provider. */
  date?: string;
  /** Threading helpers — RFC 2822 References / In-Reply-To. */
  references?: string;
  in_reply_to?: string;
};

function toLocalParts(addresses: (string | string[] | undefined)[]): string[] {
  const out: string[] = [];
  for (const a of addresses) {
    if (!a) continue;
    const arr = Array.isArray(a) ? a : [a];
    for (const item of arr) {
      // Permissive parse: pull anything that looks like local@host.
      const matches = item.match(/[a-z0-9._+-]+@[a-z0-9.-]+/gi) ?? [];
      for (const email of matches) {
        const local = email.split("@")[0]?.toLowerCase();
        if (local) out.push(local);
      }
    }
  }
  return out;
}

function flatten(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server not configured." },
      { status: 500 },
    );
  }
  const got = req.headers.get("x-webhook-secret");
  if (got !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  let payload: InboundPayload;
  try {
    payload = (await req.json()) as InboundPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON." },
      { status: 400 },
    );
  }

  const messageId = payload.message_id ?? payload.messageId ?? null;
  const candidates = toLocalParts([payload.to, payload.cc, payload.bcc]);
  if (candidates.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No recipients found." },
      { status: 400 },
    );
  }

  // Look up the alias in system context (no tenant binding yet).
  const aliasRow = await withSystemContext(async (tx) => {
    for (const candidate of candidates) {
      const [match] = await tx
        .select()
        .from(communicationAliases)
        .where(eq(communicationAliases.alias, candidate))
        .limit(1);
      if (match) return match;
    }
    return null;
  });

  if (!aliasRow) {
    // Not routed anywhere — accept and 200 so the provider doesn't retry,
    // but log so Bruce can see misroutes during setup.
    console.warn(
      `[inbound-email] no alias matched any of: ${candidates.join(", ")}`,
    );
    return NextResponse.json({ ok: true, routed: false });
  }

  const occurredAt = payload.date ? new Date(payload.date) : new Date();
  const body = payload.text ?? "";
  const bodyHtml = payload.html ?? null;
  const subject = payload.subject ?? null;
  const fromAddress = payload.from ?? null;
  const toAddresses = [
    ...flatten(payload.to),
    ...flatten(payload.cc),
    ...flatten(payload.bcc),
  ];
  const threadKey = payload.in_reply_to ?? payload.references ?? null;

  try {
    await withTenantContext(aliasRow.orgId, async (tx) => {
      await tx
        .insert(clientCommunications)
        .values({
          orgId: aliasRow.orgId,
          prospectId: aliasRow.prospectId ?? null,
          engagementId: aliasRow.engagementId ?? null,
          channel: "email",
          direction: "inbound",
          fromAddress,
          toAddresses,
          subject,
          body,
          bodyHtml,
          threadKey,
          externalId: messageId,
          occurredAt,
          tags: [],
        })
        .onConflictDoNothing();
    });
    // Mirror onto prospect_activities so the existing prospect detail
    // timeline picks it up too. Engagement-level mirroring is omitted —
    // the engagement inbox renders directly from client_communications.
    if (aliasRow.prospectId) {
      await withTenantContext(aliasRow.orgId, async (tx) => {
        await tx.insert(prospectActivities).values({
          prospectId: aliasRow.prospectId!,
          orgId: aliasRow.orgId,
          type: "email",
          subject: subject ?? "Inbound email",
          body: body.slice(0, 4000),
        });
      });
    }
    return NextResponse.json({ ok: true, routed: true });
  } catch (e) {
    console.error("[inbound-email] write failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Server error.",
      },
      { status: 500 },
    );
  }
}
