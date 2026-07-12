/**
 * Booking follow-through runner — the engine behind the three-email
 * NDA/paperwork sequence. Called every 15 minutes by the
 * `/api/cron/booking-follow-through` route (Netlify Scheduled Function),
 * and by the "Send now" button on the prospect card.
 *
 * The ERP owns state and timing; Make.com only sends. For each due email
 * we render the template, POST it to the Make "Booking Follow-Through -
 * Send" webhook, and stamp the `*_sent_at` column ONLY on a 2xx — a
 * failed POST simply retries next tick. Retries cap at 3, after which a
 * next-action is raised for Bruce.
 *
 * Timing rules (all Mountain / America/Edmonton):
 *   - Email 1: the moment the row exists, any hour. attach_nda = "yes".
 *   - Email 2: once now >= session − 3 days, if docs not in. attach_nda = "no".
 *   - Email 3: the morning of the session (>= 07:30), if docs not in. "no".
 *   - Emails 2 and 3 only send inside 07:30–18:00; email 1 sends anytime.
 *   - Suppressed once documents_received_at or cancelled_at is set.
 */

import { and, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import {
  bookingFollowThrough,
  emailTemplates,
  orgs,
  prospects,
  type BookingFollowThrough,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { applyTemplate } from "@/lib/templates/variables";
import { markdownToEmailHtml } from "@/lib/templates/markdown-to-html";

const TZ = "America/Edmonton";
const WEBHOOK_URL =
  process.env.BOOKING_FOLLOWTHROUGH_WEBHOOK_URL ??
  "https://hook.us1.make.com/daw17w49fx88u2rra1crg2x4arus3qu4";
const MAX_ATTEMPTS = 3;
const WINDOW_START_MIN = 7 * 60 + 30; // 07:30
const WINDOW_END_MIN = 18 * 60; // 18:00

export type BookingEmailNum = 1 | 2 | 3;

/** Fallback copy if a template row is missing (seed didn't run). Keeps the
 *  sequence alive rather than dropping a send. */
const DEFAULTS: Record<BookingEmailNum, { subject: string; body: string }> = {
  1: {
    subject: "Your ninety minutes, and the paperwork first",
    body: "Hello {{first_name}},\n\nThanks for booking. You're set for {{session_day}}, {{session_date}} at {{session_time}}.\n\nI've attached a mutual NDA, already signed on my end, so you can speak freely about your business when we meet. There's nothing for you to do with it right now.\n\nLooking forward to it.\n\nBruce",
  },
  2: {
    subject: "Before we meet, the quick paperwork",
    body: "Hello {{first_name}},\n\nWe're on for {{session_day}}, {{session_date}} at {{session_time}}. I'm looking forward to it.\n\nIf it's helpful to have the NDA countersigned before we talk, send it back whenever you get a minute. No rush, and no problem if you'd rather sort it on the call.\n\nBruce",
  },
  3: {
    subject: "Today is the day, one last thing",
    body: "Hello {{first_name}},\n\nToday's the day. I'll see you at {{session_time}}. If you'd like the NDA squared away, we can do it at the start of the call.\n\nBruce",
  },
};

/** Which single email (if any) is due for this row right now, in order. */
export function dueBookingEmail(
  ft: BookingFollowThrough,
  now: Date,
): BookingEmailNum | null {
  if (ft.cancelledAt || ft.documentsReceivedAt) return null;

  const nowM = DateTime.fromJSDate(now).setZone(TZ);
  const session = DateTime.fromJSDate(ft.sessionAt).setZone(TZ);
  const minutes = nowM.hour * 60 + nowM.minute;
  const inWindow = minutes >= WINDOW_START_MIN && minutes <= WINDOW_END_MIN;

  // Email 1 — as soon as the row exists, any hour. Must go before 2/3.
  if (!ft.email1SentAt) return 1;

  // Email 2 — from 3 days out; window-gated.
  if (!ft.email2SentAt && inWindow && nowM >= session.minus({ days: 3 })) {
    return 2;
  }

  // Email 3 — the morning of the session (>= 07:30), same calendar day.
  if (
    !ft.email3SentAt &&
    inWindow &&
    nowM.hasSame(session, "day") &&
    minutes >= WINDOW_START_MIN
  ) {
    return 3;
  }

  return null;
}

function attemptsFor(ft: BookingFollowThrough, n: BookingEmailNum): number {
  return n === 1
    ? ft.email1Attempts
    : n === 2
      ? ft.email2Attempts
      : ft.email3Attempts;
}

function sentPatch(n: BookingEmailNum, at: Date): Partial<BookingFollowThrough> {
  if (n === 1) return { email1SentAt: at };
  if (n === 2) return { email2SentAt: at };
  return { email3SentAt: at };
}

function attemptsPatch(
  n: BookingEmailNum,
  count: number,
): Partial<BookingFollowThrough> {
  if (n === 1) return { email1Attempts: count };
  if (n === 2) return { email2Attempts: count };
  return { email3Attempts: count };
}

function buildVars(
  sessionAt: Date,
  contactName: string | null,
): Record<string, string> {
  const session = DateTime.fromJSDate(sessionAt).setZone(TZ);
  const firstName = (contactName ?? "").trim().split(/\s+/)[0] || "there";
  return {
    first_name: firstName,
    session_day: session.toFormat("cccc"), // Thursday
    session_date: session.toFormat("d LLLL yyyy"), // 11 July 2026
    session_time: session.toFormat("h:mm a"), // 2:00 PM
  };
}

/**
 * Render + send one booking email through the Make webhook and record the
 * outcome. Stamps `*_sent_at` only on a 2xx; on failure bumps the attempt
 * counter and, once capped, raises a next-action for Bruce.
 *
 * `manual` (the "Send now" button) bypasses the attempt cap — Bruce is
 * explicitly overriding — but still records the outcome the same way.
 */
export async function sendBookingFollowThroughEmail(
  ftId: string,
  n: BookingEmailNum,
  now: Date = new Date(),
  opts: { manual?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const loaded = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        ft: bookingFollowThrough,
        email: prospects.contactEmail,
        contactName: prospects.contactName,
        companyName: prospects.companyName,
      })
      .from(bookingFollowThrough)
      .innerJoin(prospects, eq(prospects.id, bookingFollowThrough.prospectId))
      .where(eq(bookingFollowThrough.id, ftId))
      .limit(1);
    if (!row) return null;
    const [tpl] = await tx
      .select({ subject: emailTemplates.subject, body: emailTemplates.body })
      .from(emailTemplates)
      .where(
        and(
          eq(emailTemplates.orgId, row.ft.orgId),
          eq(emailTemplates.templateKey, `booking_follow_through_${n}`),
        ),
      )
      .limit(1);
    return { row, tpl: tpl ?? null };
  });

  if (!loaded) return { ok: false, error: "Booking row not found." };
  const { row, tpl } = loaded;
  if (!opts.manual && attemptsFor(row.ft, n) >= MAX_ATTEMPTS) {
    return { ok: false, error: "Retry cap reached." };
  }

  const copy = tpl ?? DEFAULTS[n];
  const vars = buildVars(row.ft.sessionAt, row.contactName);
  const payload = {
    to: row.email,
    subject: applyTemplate(copy.subject, vars),
    body_html: markdownToEmailHtml(applyTemplate(copy.body, vars)),
    attach_nda: n === 1 ? "yes" : "no",
    // NDA merge fields — only read by Make when attach_nda is "yes", but
    // sent every time per the payload contract.
    prospect_name: row.contactName ?? "",
    company_name: row.companyName ?? "",
    city: "", // prospects carry no city; blank unless Bruce edits the NDA.
    effective_date: DateTime.fromJSDate(now).setZone(TZ).toFormat("d LLLL yyyy"),
  };

  let ok = false;
  let lastError: string | null = null;
  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    ok = resp.ok;
    if (!ok) lastError = `Make webhook returned ${resp.status}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }

  await withSystemContext(async (tx) => {
    if (ok) {
      await tx
        .update(bookingFollowThrough)
        .set(sentPatch(n, now))
        .where(eq(bookingFollowThrough.id, row.ft.id));
    } else {
      const nextAttempts = attemptsFor(row.ft, n) + 1;
      await tx
        .update(bookingFollowThrough)
        .set({ ...attemptsPatch(n, nextAttempts), lastError })
        .where(eq(bookingFollowThrough.id, row.ft.id));

      if (nextAttempts >= MAX_ATTEMPTS && !row.ft.failureFlaggedAt) {
        await tx
          .update(prospects)
          .set({
            nextActionNote: `Booking email ${n} failed to send ${MAX_ATTEMPTS}×. Send by hand or check the automation.`,
            nextActionDate: now,
          })
          .where(eq(prospects.id, row.ft.prospectId));
        await tx
          .update(bookingFollowThrough)
          .set({ failureFlaggedAt: now })
          .where(eq(bookingFollowThrough.id, row.ft.id));
      }
    }
  });

  return ok ? { ok: true } : { ok: false, error: lastError ?? "Send failed." };
}

/** The 15-minute sweep: find booking rows with a due email and send it. */
export async function runBookingFollowThrough(now: Date = new Date()): Promise<{
  candidates: number;
  sent: number;
  failed: number;
}> {
  const rows = await withSystemContext(async (tx) => {
    const [master] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.type, "master"))
      .limit(1);
    if (!master) return [] as BookingFollowThrough[];
    return tx
      .select()
      .from(bookingFollowThrough)
      .where(
        and(
          eq(bookingFollowThrough.orgId, master.id),
          isNull(bookingFollowThrough.cancelledAt),
          isNull(bookingFollowThrough.documentsReceivedAt),
        ),
      );
  });

  let sent = 0;
  let failed = 0;
  for (const ft of rows) {
    const due = dueBookingEmail(ft, now);
    if (!due) continue;
    if (attemptsFor(ft, due) >= MAX_ATTEMPTS) continue;
    const r = await sendBookingFollowThroughEmail(ft.id, due, now);
    if (r.ok) sent += 1;
    else failed += 1;
  }
  return { candidates: rows.length, sent, failed };
}
