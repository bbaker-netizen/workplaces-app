/**
 * Public lead-capture webhook: POST /api/leads/<token>
 *
 * External channels (website contact form, and Meta / TikTok / YouTube /
 * Google / LinkedIn ads bridged through Make.com) POST a lead here and it
 * lands in the Pipeline as a prospect, tagged with its source. The <token>
 * (per-account secret, set on the Lead sources settings page) is the auth —
 * there is no Clerk session on these requests.
 *
 * Accepts JSON or form-encoded bodies and is generous about field names so
 * different platforms map cleanly. Repeat submissions from the same email
 * don't create duplicate cards — they touch the existing prospect and log
 * an activity.
 */

import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  bookingFollowThrough,
  orgs,
  prospectActivities,
  prospects,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { channelFromWebhookPayload } from "@/lib/pipeline/lead-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pull the first present value for any of the candidate keys (case-insensitive).
function pick(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      return (await req.json()) as Record<string, unknown>;
    }
    if (
      ct.includes("application/x-www-form-urlencoded") ||
      ct.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    }
    // Best-effort: try JSON anyway.
    const text = await req.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  const token = params.token;
  if (!token || token.length < 8) {
    return NextResponse.json({ ok: false, error: "Invalid token." }, { status: 401 });
  }

  const body = await parseBody(req);
  const email = pick(body, ["email", "contact_email", "e-mail", "emailaddress"]);
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "An email address is required." },
      { status: 400 },
    );
  }

  const first = pick(body, ["first_name", "firstname"]);
  const last = pick(body, ["last_name", "lastname"]);
  const joined = [first, last].filter(Boolean).join(" ");
  const name =
    pick(body, ["name", "full_name", "fullname", "contact_name"]) ??
    (joined || null);
  const company = pick(body, [
    "company",
    "company_name",
    "business_name",
    "business",
    "organization",
  ]);
  const phone = pick(body, ["phone", "phone_number", "tel", "mobile"]);
  const message = pick(body, ["message", "notes", "comments", "comment", "body", "inquiry"]);
  const source =
    pick(body, ["source", "lead_source", "channel", "utm_source", "platform"]) ??
    "Webhook";
  // UTM / click-id capture — how we know the real acquisition channel for
  // website-form leads (the form posts these from a first-party cookie).
  const utmSource = pick(body, ["utm_source", "utmsource"]);
  const utmMedium = pick(body, ["utm_medium", "utmmedium"]);
  const utmCampaign = pick(body, ["utm_campaign", "utmcampaign", "campaign"]);
  const gclid = pick(body, ["gclid"]);
  const fbclid = pick(body, ["fbclid"]);
  const channel = channelFromWebhookPayload({
    source,
    utmSource,
    utmMedium,
    gclid,
    fbclid,
  });
  // Granular provenance for the detail column: campaign name, else the raw
  // source string when it adds anything beyond the channel itself.
  const sourceDetail =
    utmCampaign ??
    (source && source.toLowerCase() !== "webhook" ? source : null);
  const website = pick(body, ["website", "company_website", "url"]);
  const linkedin = pick(body, ["linkedin", "linkedin_url"]);
  const facebook = pick(body, ["facebook", "facebook_url"]);
  const instagram = pick(body, ["instagram", "instagram_url"]);

  // Booking payload (from the "Booking → Builder Pipeline" Make scenario):
  // a calendar event became a booked session. Recognized by an explicit
  // calendar_event_id + a parseable booked_session_at. calendar_event_id is
  // the idempotency key — a re-seen event creates nothing.
  const calendarEventId = pick(body, ["calendar_event_id", "event_id"]);
  const eventSummary = pick(body, ["event_summary", "summary"]);
  const bookedSessionAtRaw = pick(body, [
    "booked_session_at",
    "session_at",
    "start",
  ]);
  const sessionAt = bookedSessionAtRaw ? new Date(bookedSessionAtRaw) : null;
  const isBooking =
    !!calendarEventId && !!sessionAt && !Number.isNaN(sessionAt.getTime());

  try {
    const result = await withSystemContext(async (tx) => {
      const [org] = await tx
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.leadWebhookToken, token))
        .limit(1);
      if (!org) return { status: 401 as const };

      // ---- Booking branch --------------------------------------------
      // A calendar event became a booked session. calendar_event_id is the
      // idempotency key: if we've seen it, do nothing (no double emails).
      if (isBooking && calendarEventId && sessionAt) {
        const [seen] = await tx
          .select({ id: bookingFollowThrough.id })
          .from(bookingFollowThrough)
          .where(eq(bookingFollowThrough.calendarEventId, calendarEventId))
          .limit(1);
        if (seen) {
          return {
            status: 200 as const,
            prospectId: null,
            deduped: true,
            booking: true,
            noop: true,
          };
        }

        // Find or create the prospect (dedupe by email).
        const [existingP] = await tx
          .select({ id: prospects.id })
          .from(prospects)
          .where(
            and(
              eq(prospects.orgId, org.id),
              isNull(prospects.archivedAt),
              sql`lower(${prospects.contactEmail}) = lower(${email})`,
            ),
          )
          .limit(1);

        let bProspectId: string;
        if (existingP) {
          bProspectId = existingP.id;
          await tx
            .update(prospects)
            .set({
              status: "meeting_scheduled",
              // First-touch: keep the earliest booked date if one exists.
              bookedSessionAt:
                sql`coalesce(${prospects.bookedSessionAt}, ${sessionAt.toISOString()})` as unknown as Date,
              nextActionNote: "Send follow-through email 1",
              nextActionDate: new Date(),
              lastContactAt: new Date(),
            })
            .where(eq(prospects.id, existingP.id));
        } else {
          const [row] = await tx
            .insert(prospects)
            .values({
              orgId: org.id,
              companyName: (company ?? name ?? email).slice(0, 200),
              contactName: name,
              contactEmail: email,
              phone: phone ?? undefined,
              companyWebsite: website ?? undefined,
              // "Booking" is the descriptive label; the acquisition channel
              // (`source`) stays whatever the payload implies — a bare
              // calendar booking carries none, so it derives to `other`.
              leadSource: "Booking",
              source: channel,
              firstSeenAt: new Date(),
              bookedSessionAt: sessionAt,
              status: "meeting_scheduled",
              nextActionNote: "Send follow-through email 1",
              nextActionDate: new Date(),
              notes: message ?? undefined,
              lastContactAt: new Date(),
            })
            .returning({ id: prospects.id });
          bProspectId = row.id;
        }

        // The follow-through row. onConflictDoNothing on the unique
        // calendar_event_id is belt-and-suspenders against a racing poller.
        await tx
          .insert(bookingFollowThrough)
          .values({
            orgId: org.id,
            prospectId: bProspectId,
            calendarEventId,
            sessionAt,
          })
          .onConflictDoNothing({
            target: bookingFollowThrough.calendarEventId,
          });

        await tx.insert(prospectActivities).values({
          orgId: org.id,
          prospectId: bProspectId,
          type: "booking",
          subject: "Session booked",
          body: eventSummary ?? null,
        });

        return {
          status: 200 as const,
          prospectId: bProspectId,
          deduped: !!existingP,
          booking: true,
        };
      }

      // De-dupe by email within the org (ignore archived).
      const [existing] = await tx
        .select({ id: prospects.id })
        .from(prospects)
        .where(
          and(
            eq(prospects.orgId, org.id),
            isNull(prospects.archivedAt),
            sql`lower(${prospects.contactEmail}) = lower(${email})`,
          ),
        )
        .limit(1);

      let prospectId: string;
      if (existing) {
        prospectId = existing.id;
        await tx
          .update(prospects)
          .set({ lastContactAt: new Date() })
          .where(eq(prospects.id, existing.id));
      } else {
        const [row] = await tx
          .insert(prospects)
          .values({
            orgId: org.id,
            companyName: (company ?? name ?? email).slice(0, 200),
            contactName: name,
            contactEmail: email,
            phone: phone ?? undefined,
            companyWebsite: website ?? undefined,
            linkedinUrl: linkedin ?? undefined,
            facebookUrl: facebook ?? undefined,
            instagramUrl: instagram ?? undefined,
            leadSource: source,
            source: channel,
            sourceDetail: sourceDetail ?? undefined,
            firstSeenAt: new Date(),
            status: "new_lead",
            notes: message ?? undefined,
            lastContactAt: new Date(),
          })
          .returning({ id: prospects.id });
        prospectId = row.id;
      }

      // Timeline entry for every submission.
      await tx.insert(prospectActivities).values({
        orgId: org.id,
        prospectId,
        type: "lead",
        subject: `New lead from ${source}`,
        body: message ?? null,
      });

      return { status: 200 as const, prospectId, deduped: !!existing };
    });

    if (result.status === 401) {
      return NextResponse.json(
        { ok: false, error: "Unrecognized token." },
        { status: 401 },
      );
    }
    return NextResponse.json({
      ok: true,
      prospectId: result.prospectId,
      deduped: result.deduped,
    });
  } catch (e) {
    console.error("[api/leads] failed:", e);
    return NextResponse.json(
      { ok: false, error: "Could not record the lead." },
      { status: 500 },
    );
  }
}
