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
import {
  channelFromHearAboutAnswer,
  channelFromWebhookPayload,
  parseHearAboutAnswer,
} from "@/lib/pipeline/lead-source";

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
  // website-form leads. The WPCode snippet stores gclid/gbraid/wbraid/fbclid +
  // utm params in 90-day first-party cookies on landing and posts them here,
  // both at the top level (gclid) and inside a `click_ids` object. A click id
  // is harder evidence than any free-text source, so it drives the channel.
  const clickIdsObj: Record<string, unknown> =
    body.click_ids && typeof body.click_ids === "object" && !Array.isArray(body.click_ids)
      ? (body.click_ids as Record<string, unknown>)
      : {};
  // Prefer a top-level value, then the click_ids object.
  const ci = (keys: string[]): string | null =>
    pick(body, keys) ?? pick(clickIdsObj, keys);
  const utmSource = ci(["utm_source", "utmsource"]);
  const utmMedium = ci(["utm_medium", "utmmedium"]);
  const utmCampaign = ci(["utm_campaign", "utmcampaign", "campaign"]);
  const gclid = ci(["gclid"]);
  const gbraid = ci(["gbraid"]);
  const wbraid = ci(["wbraid"]);
  const fbclid = ci(["fbclid"]);
  // Persist the whole click_ids object verbatim (only the keys the snippet sent)
  // so nothing is lost even if we don't have a dedicated column for it.
  const clickIdsJson: Record<string, unknown> | null =
    Object.keys(clickIdsObj).length > 0 ? clickIdsObj : null;
  const channel = channelFromWebhookPayload({
    source,
    utmSource,
    utmMedium,
    gclid,
    gbraid,
    wbraid,
    fbclid,
  });
  // Granular provenance for the detail column: campaign name, else the raw
  // source string when it adds anything beyond the channel itself.
  const sourceDetail =
    utmCampaign ??
    (source && source.toLowerCase() !== "webhook" ? source : null);

  // The click-id columns to write on a fresh insert (undefined → column stays
  // NULL). Shared by the booking and website-form insert paths.
  const clickIdInsert = {
    gclid: gclid ?? undefined,
    gbraid: gbraid ?? undefined,
    wbraid: wbraid ?? undefined,
    fbclid: fbclid ?? undefined,
    utmSource: utmSource ?? undefined,
    utmMedium: utmMedium ?? undefined,
    utmCampaign: utmCampaign ?? undefined,
    clickIds: clickIdsJson ?? undefined,
  };
  // First-touch (dedupe hit): keep the FIRST click id — coalesce keeps the
  // existing non-null value, so a later submission with an empty gclid can never
  // blank it. Only fills columns that are currently NULL.
  const clickIdFirstTouch = {
    gclid: sql`coalesce(${prospects.gclid}, ${gclid ?? null})` as unknown as string,
    gbraid: sql`coalesce(${prospects.gbraid}, ${gbraid ?? null})` as unknown as string,
    wbraid: sql`coalesce(${prospects.wbraid}, ${wbraid ?? null})` as unknown as string,
    fbclid: sql`coalesce(${prospects.fbclid}, ${fbclid ?? null})` as unknown as string,
    utmSource: sql`coalesce(${prospects.utmSource}, ${utmSource ?? null})` as unknown as string,
    utmMedium: sql`coalesce(${prospects.utmMedium}, ${utmMedium ?? null})` as unknown as string,
    utmCampaign: sql`coalesce(${prospects.utmCampaign}, ${utmCampaign ?? null})` as unknown as string,
    clickIds: sql`coalesce(${prospects.clickIds}, ${clickIdsJson ? JSON.stringify(clickIdsJson) : null}::jsonb)` as unknown as Record<string, unknown>,
  };
  // Calendar-booking attribution (item 3): the booking form's "How did you hear
  // about me?" answer rides in the event description, which the poller passes
  // through as `message` (pipe-delimited). A click id, if present, is harder
  // evidence and wins; otherwise map the answer; never a silent swallow — an
  // unparsed answer falls back to `other` with a note in source_detail.
  const bookingAnswer = parseHearAboutAnswer(message);
  const hasClickId = Boolean(gclid || gbraid || wbraid || fbclid);
  const bookingChannel = hasClickId
    ? channel
    : bookingAnswer
      ? channelFromHearAboutAnswer(bookingAnswer)
      : "other";
  const bookingSourceDetail = bookingAnswer
    ? `Calendar booking (${bookingAnswer})`
    : "Calendar booking (source not stated)";
  if (!bookingAnswer) {
    console.warn(
      "[api/leads] booking: could not parse 'How did you hear about me?' from message; defaulting source to other.",
    );
  }

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
              // First-touch click ids (never blank an existing one).
              ...clickIdFirstTouch,
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
              // "Booking" is the descriptive display label; the acquisition
              // channel comes from the "How did you hear about me?" answer (or a
              // click id, which wins). source_detail records the exact answer.
              leadSource: "Booking",
              source: bookingChannel,
              sourceDetail: bookingSourceDetail,
              ...clickIdInsert,
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
          .set({
            lastContactAt: new Date(),
            // First-touch: fill any click id we didn't already have, never
            // overwrite one. First click id wins.
            ...clickIdFirstTouch,
          })
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
            ...clickIdInsert,
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
