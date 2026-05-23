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

import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  orgs,
  prospectActivities,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { newLeadEmail } from "@/lib/email/templates";

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
});

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
  const parsed = intakeSchema.safeParse(raw);
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

  // Insert + activity + collect recipients.
  let prospectId: string;
  let recipientEmails: string[] = [];
  try {
    const result = await withSystemContext(async (tx) => {
      const [master] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.type, "master"))
        .limit(1);
      if (!master) throw new Error("Master org not configured.");

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
          leadSource: data.leadSource ?? "Web form",
          status: "new_lead",
          notes: data.message ?? null,
        })
        .returning({ id: prospects.id });

      await tx.insert(prospectActivities).values({
        prospectId: created.id,
        orgId: master.id,
        type: "web_lead",
        subject: `New lead from ${data.leadSource ?? "web form"}`,
        body: data.message ?? null,
      });

      // Notify every master_admin + Coach in the master org so the
      // first one to see it can claim and follow up.
      const recipients = await tx
        .select({ email: userProfiles.email })
        .from(userProfiles)
        .where(
          or(
            eq(userProfiles.role, "master_admin"),
            eq(userProfiles.role, "coach"),
          ),
        );
      return { id: created.id, recipients };
    });
    prospectId = result.id;
    recipientEmails = result.recipients.map((r) => r.email);
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
        leadSource: data.leadSource ?? "Web form",
        message: data.message ?? null,
        prospectUrl: `/business-builder/pipeline/${prospectId}`,
      }),
      bypassWorkingHours: true,
    });
  }

  return NextResponse.json(
    { ok: true, prospectId },
    { status: 201, headers: corsHeaders },
  );
}
