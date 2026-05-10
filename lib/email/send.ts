/**
 * Email send wrapper — Resend client + working-hours guard.
 *
 * Phase 1.4. Every transactional email goes through `sendEmail`. Two
 * delivery modes:
 *
 *   - **Now.** During Bruce's stated working hours
 *     (Mon–Fri, 8:30 AM – 6:00 PM Mountain Time), Resend ships the
 *     message immediately and we return `{ delivered: true }`.
 *
 *   - **Queued.** Outside that window, we DON'T send. The caller is
 *     responsible for marking the matching `notifications` row with
 *     `email_pending_send_at = nextValidWorkingMoment(now)`. The daily
 *     scheduled function (`netlify/functions/email-flush.ts`) drains
 *     those rows when the window opens.
 *
 * Why guard at the wrapper, not at the call site: every email path needs
 * the same answer ("send now or queue?"), and the working-hours rule is
 * a single CLAUDE.md-mandated constraint. Centralising it means a future
 * change ("Bruce is off Friday this week") is one file edit.
 *
 * `RESEND_API_KEY` and `RESEND_FROM_EMAIL` come from env; missing either
 * fails loudly at first send. `NEXT_PUBLIC_APP_URL` is consumed by
 * templates for absolute link URLs.
 */

import { Resend } from "resend";
import { DateTime } from "luxon";

const TIMEZONE = "America/Edmonton";
const WORK_DAYS = new Set<number>([1, 2, 3, 4, 5]); // Luxon: Mon=1 … Sun=7
const WORK_START = { hour: 8, minute: 30 };
const WORK_END = { hour: 18, minute: 0 };

let cachedClient: Resend | null = null;
function client(): Resend {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local (or the Netlify dashboard for production).",
    );
  }
  cachedClient = new Resend(key);
  return cachedClient;
}

function fromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "RESEND_FROM_EMAIL is not set. Add it to .env.local (e.g. `The Builder <notifications@4workplaces.com>`).",
    );
  }
  return from;
}

/* ---------------------------- working-hours ---------------------------- */

/**
 * True if `at` lies within Bruce's working window: Mon–Fri,
 * 08:30 ≤ time < 18:00, evaluated in America/Edmonton (Mountain Time,
 * DST-aware via Luxon).
 */
export function isWithinWorkingHours(at: Date = new Date()): boolean {
  const mt = DateTime.fromJSDate(at, { zone: TIMEZONE });
  if (!WORK_DAYS.has(mt.weekday)) return false;
  const minutes = mt.hour * 60 + mt.minute;
  const startMinutes = WORK_START.hour * 60 + WORK_START.minute;
  const endMinutes = WORK_END.hour * 60 + WORK_END.minute;
  return minutes >= startMinutes && minutes < endMinutes;
}

/**
 * Return the next moment at which `isWithinWorkingHours` would be true,
 * starting from `at`. Returns `at` itself if already inside the window.
 *
 * Cases handled:
 *   - Weekday before 08:30 → today at 08:30.
 *   - Weekday at/after 18:00 → next workday at 08:30.
 *   - Weekend → next Monday at 08:30.
 */
export function nextValidWorkingMoment(at: Date = new Date()): Date {
  let mt = DateTime.fromJSDate(at, { zone: TIMEZONE });
  if (isWithinWorkingHours(at)) return mt.toJSDate();

  // Move to start-of-window on the next eligible day. We loop at most
  // 7 times — `weekday` cycles through Mon..Sun.
  for (let i = 0; i < 8; i++) {
    const sameDayStart = mt.set({
      hour: WORK_START.hour,
      minute: WORK_START.minute,
      second: 0,
      millisecond: 0,
    });
    if (WORK_DAYS.has(mt.weekday) && sameDayStart > mt) {
      return sameDayStart.toJSDate();
    }
    // Otherwise advance to the next day's 08:30 MT.
    mt = mt
      .plus({ days: 1 })
      .set({
        hour: WORK_START.hour,
        minute: WORK_START.minute,
        second: 0,
        millisecond: 0,
      });
    if (WORK_DAYS.has(mt.weekday)) return mt.toJSDate();
  }
  // Unreachable in practice; defensive fallback to "now + 1 minute".
  return DateTime.fromJSDate(at).plus({ minutes: 1 }).toJSDate();
}

/* ------------------------------ send ------------------------------ */

export type EmailAttachment = {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
};

export type EmailEnvelope = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional binary attachments (e.g. signed PDF). Resend handles these. */
  attachments?: EmailAttachment[];
  /**
   * If true, bypass the working-hours guard and send immediately. Used
   * by the queue flusher (which only runs INSIDE the window) so it
   * doesn't double-check.
   */
  bypassWorkingHours?: boolean;
};

export type SendEmailResult =
  | { delivered: true; id: string }
  | { delivered: false; reason: "outside_working_hours"; nextSendAt: Date }
  | { delivered: false; reason: "error"; error: string };

/**
 * Send a transactional email through Resend. Returns a discriminated
 * result so callers can decide whether to mark the related notification
 * row as queued.
 */
export async function sendEmail(
  envelope: EmailEnvelope,
): Promise<SendEmailResult> {
  if (!envelope.bypassWorkingHours && !isWithinWorkingHours()) {
    return {
      delivered: false,
      reason: "outside_working_hours",
      nextSendAt: nextValidWorkingMoment(),
    };
  }

  try {
    const resp = await client().emails.send({
      from: fromAddress(),
      to: envelope.to,
      subject: envelope.subject,
      html: envelope.html,
      text: envelope.text,
      ...(envelope.attachments && envelope.attachments.length > 0
        ? {
            attachments: envelope.attachments.map((a) => ({
              filename: a.filename,
              content:
                a.content instanceof Uint8Array
                  ? Buffer.from(a.content)
                  : a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    if (resp.error) {
      return {
        delivered: false,
        reason: "error",
        error: resp.error.message ?? String(resp.error),
      };
    }
    return { delivered: true, id: resp.data?.id ?? "" };
  } catch (e) {
    return {
      delivered: false,
      reason: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Best-effort fire-and-forget send. Used by server actions where a
 * failure to send shouldn't roll back the message/notification write.
 * Logs errors server-side; doesn't surface to the user.
 */
export async function sendEmailQuietly(
  envelope: EmailEnvelope,
): Promise<SendEmailResult> {
  const result = await sendEmail(envelope);
  if (!result.delivered && result.reason === "error") {
    console.error("[email] send failed:", result.error, "to:", envelope.to);
  }
  return result;
}
