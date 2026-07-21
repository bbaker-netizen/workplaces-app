/**
 * Public lead intake — POST /api/leads.
 *
 * Phase 5. The endpoint your external web form (or any third-party
 * tool) posts new leads to. Creates a Prospect row in the Pipeline
 * with status "new_lead" and emails every Workplaces master_admin /
 * Coach so the lead doesn't sit unread.
 *
 * Auth: optional API key. If `LEADS_INTAKE_API_KEY` is set in env,
 * the request must include `x-api-key` matching it. If unset, the
 * endpoint accepts requests anyway (useful for a Workplaces-owned
 * web form that lives on the same brand domain).
 *
 * Request body (JSON):
 *   {
 *     "companyName": "Acme Inc.",
 *     "contactName": "Jane Doe",        // optional
 *     "contactEmail": "jane@acme.com",
 *     "phone": "+1 780 555 1234",        // optional
 *     "companyWebsite": "https://acme.com", // optional
 *     "leadSource": "Web form",          // optional, defaults to "Web form"
 *     "message": "Tell us a bit…",       // optional, body of the log entry
 *     "industry": "Manufacturing"        // optional
 *   }
 *
 * Response: { ok: true, prospectId: "..." } on success.
 *
 * CORS: open. The endpoint accepts cross-origin POSTs (your marketing
 * site may not be on the same domain as the portal).
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  notifications,
  orgs,
  prospectActivities,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { channelFromWebhookPayload } from "@/lib/pipeline/lead-source";
import { extractLeadNote, mergeLeadNote } from "@/lib/pipeline/lead-notes";
import { notifyNewLead } from "@/lib/pipeline/notify-new-lead";
import { sendEmailQuietly } from "@/lib/email/send";
import { newLeadEmail } from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const intakeSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().max(254),
  phone: z.string().max(60).optional().nullable(),
  companyWebsite: z
    .string()
    .url()
    .max(300)
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : null)),
  leadSource: z.string().max(200).optional().nullable(),
  message: z.string().max(8000).optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  // UTM / click-id capture for real channel attribution (first-party
  // cookie → hidden form fields). All optional.
  utmSource: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  gclid: z.string().max(300).optional().nullable(),
  fbclid: z.string().max(300).optional().nullable(),
  // Honeypot: a hidden field bots fill and humans never see. If it arrives
  // non-empty, we silently drop the submission. Add a hidden <input
  // name="honeypot"> to your form to activate it.
  honeypot: z.string().max(300).optional().nullable(),
});
// Keep unknown fields on the parsed object so extractLeadNote can sweep any
// extra free-text answers the form sent (e.g. custom questions) into Notes.
const intakeSchemaPassthrough = intakeSchema.passthrough();

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-api-key",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
  };

  // Optional API-key gate.
  const expectedKey = process.env.LEADS_INTAKE_API_KEY;
  if (expectedKey) {
    const got = req.headers.get("x-api-key");
    if (got !== expectedKey) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing API key." },
        { status: 401, headers: corsHeaders },
      );
    }
  }

  // Parse.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400, headers: corsHeaders },
    );
  }
  const parsed = intakeSchemaPassthrough.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid payload.",
      },
      { status: 400, headers: corsHeaders },
    );
  }
  const data = parsed.data;

  // Honeypot tripped → a bot filled the hidden field. Pretend success so it
  // doesn't retry, but create nothing.
  if (data.honeypot && data.honeypot.trim().length > 0) {
    return NextResponse.json(
      { ok: true, prospectId: null },
      { status: 201, headers: corsHeaders },
    );
  }

  // Never store a blank source: an integration that posts an empty/whitespace
  // leadSource should still land as "Web form", not an untagged lead.
  const leadSource =
    data.leadSource && data.leadSource.trim().length > 0
      ? data.leadSource.trim()
      : "Web form";

  // The lead's own words for the profile Notes: the `message` field plus any
  // other free-text answer the form sent, so nothing a lead types is dropped
  // just because the platform named the field something we didn't expect.
  const leadNote = extractLeadNote(data as Record<string, unknown>);

  // Canonical channel from the UTM/click-id signals (falls back to `other`
  // when the form gives us nothing to attribute on).
  const channel = channelFromWebhookPayload({
    source: data.leadSource ?? null,
    utmSource: data.utmSource ?? null,
    utmMedium: data.utmMedium ?? null,
    gclid: data.gclid ?? null,
    fbclid: data.fbclid ?? null,
  });
  const sourceDetail =
    (data.utmCampaign && data.utmCampaign.trim()) ||
    (data.utmSource && data.utmSource.trim()) ||
    null;

  // Insert + activity + collect recipients.
  let prospectId: string;
  let recipientEmails: string[] = [];
  let recipientIds: string[] = [];
  let deduped = false;
  try {
    const result = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) throw new Error("Master org not configured.");

      // De-dupe by email: a repeat submission (or a bot hammering the
      // endpoint) shouldn't spawn a new pipeline card. Touch the existing
      // prospect, log the activity, and skip the notification email.
      const [existing] = await tx
        .select({ id: prospects.id, notes: prospects.notes })
        .from(prospects)
        .where(
          and(
            eq(prospects.orgId, master.id),
            isNull(prospects.archivedAt),
            sql`lower(${prospects.contactEmail}) = lower(${data.contactEmail})`,
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(prospects)
          .set({
            lastContactAt: new Date(),
            // Fold this submission's note into the profile Notes,
            // non-destructively — a returning lead's new words reach the
            // profile without clobbering earlier notes.
            notes: mergeLeadNote(existing.notes, leadNote, leadSource, new Date()),
          })
          .where(eq(prospects.id, existing.id));
        await tx.insert(prospectActivities).values({
          prospectId: existing.id,
          orgId: master.id,
          type: "web_lead",
          subject: `Repeat lead from ${leadSource}`,
          body: leadNote ?? data.message ?? null,
        });
        return { id: existing.id, recipients: [], deduped: true };
      }

      const [created] = await tx
        .insert(prospects)
        .values({
          orgId: master.id,
          companyName: data.companyName,
          contactName: data.contactName ?? null,
          contactEmail: data.contactEmail,
          phone: data.phone ?? null,
          companyWebsite: data.companyWebsite ?? null,
          industry: data.industry ?? null,
          leadSource,
          source: channel,
          sourceDetail,
          firstSeenAt: new Date(),
          status: "new_lead",
          notes: leadNote ?? null,
          // Deliberately NOT setting lastContactAt. A brand-new inbound
          // lead has not been CONTACTED by anyone — stamping "now" made
          // the profile show "Last contact: today" for a lead nobody had
          // spoken to. Staleness is unaffected: daysSinceContact falls
          // back to createdAt (the same timestamp) when this is null.
          // A later real touchpoint — reply, booking, logged follow-up —
          // sets it for the first time.
        })
        .returning({ id: prospects.id });

      await tx.insert(prospectActivities).values({
        prospectId: created.id,
        orgId: master.id,
        type: "web_lead",
        subject: `New lead from ${leadSource}`,
        body: leadNote ?? data.message ?? null,
      });

      // Notify every master_admin + Coach in the master org so the
      // first one to see it can claim and follow up.
      const recipients = await tx
        .select({ id: userProfiles.id, email: userProfiles.email })
        .from(userProfiles)
        .where(
          or(
            eq(userProfiles.role, "master_admin"),
            eq(userProfiles.role, "coach"),
          ),
        );

      // In-app notification per Business Builder so the new lead surfaces in
      // the bell + toast (and, below, desktop push) — not just email.
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((r) => ({
            orgId: master.id,
            userProfileId: r.id,
            type: "message" as const,
            parentEntityType: "prospect_new_lead",
            parentEntityId: created.id,
            sentVia: "both" as const,
          })),
        );
      }
      return { id: created.id, recipients, deduped: false };
    });
    prospectId = result.id;
    recipientEmails = result.recipients.map((r) => r.email);
    recipientIds = result.recipients.map((r) => r.id);
    deduped = result.deduped;
  } catch (e) {
    console.error("[/api/leads] insert failed:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Server error.",
      },
      { status: 500, headers: corsHeaders },
    );
  }

  // Fire notification emails (best-effort, bypass working-hours
  // because new-lead alerts shouldn't wait).
  for (const to of recipientEmails) {
    await sendEmailQuietly({
      ...newLeadEmail({
        to,
        companyName: data.companyName,
        contactName: data.contactName ?? null,
        contactEmail: data.contactEmail,
        phone: data.phone ?? null,
        leadSource,
        message: data.message ?? null,
        prospectUrl: `/business-builder/pipeline/${prospectId}`,
      }),
      bypassWorkingHours: true,
    });
  }

  // Desktop push (best-effort) — a new lead should reach every Business
  // Builder even with the tab closed.
  await Promise.all(
    recipientIds.map((uid) =>
      sendPushToUser(uid, {
        title: "New lead",
        body: `${data.companyName}${
          data.contactName ? ` · ${data.contactName}` : ""
        } — ${leadSource}. Strike while warm.`,
        url: `/business-builder/pipeline/${prospectId}`,
        tag: `new-lead-${prospectId}`,
      }),
    ),
  );

  // Shared-inbox alert (info@) — one email per genuinely new lead, alongside
  // the per-coach alerts above. Skipped on a repeat submission.
  if (!deduped) {
    await notifyNewLead({
      prospectId,
      companyName: data.companyName,
      contactName: data.contactName ?? null,
      contactEmail: data.contactEmail,
      phone: data.phone ?? null,
      leadSource,
      message: leadNote,
    });
  }

  return NextResponse.json(
    { ok: true, prospectId },
    { status: 201, headers: corsHeaders },
  );
}
