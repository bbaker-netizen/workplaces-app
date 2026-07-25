/**
 * Inbound triage — turning "can we grab 30 minutes" into a draft reply.
 *
 * Draft only, always. The sweep never sends. Two reasons, and the second
 * is the important one:
 *
 *   1. A classifier will be wrong sometimes, and a wrong auto-reply to a
 *      prospect is expensive in a way a wrong draft is not.
 *   2. Everything the practice sends goes out under Bruce's name. The
 *      standing rule is that nothing does so unread.
 *
 * The draft lands in the real Gmail thread, so replying is the normal
 * act of opening Gmail and pressing send.
 *
 * **The draft never names a price.** That is not a style preference, it
 * is the sales protocol: price is never named before a face to face or
 * video conversation. The prompt says so and the fallback copy obeys it,
 * because the fallback is what ships when the model call fails.
 *
 * Idempotency is `ea_email_threads.gmail_thread_id` UNIQUE. Every thread
 * the sweep looks at is logged whether or not it classified as a meeting
 * request, so a re-run never classifies the same thread twice (and never
 * bills for it twice) and never drafts a second reply.
 */

import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { eaEmailThreads, schedulingLinks } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { classify } from "@/lib/ai/anthropic";
import {
  createGmailDraft,
  getMessage,
  listMessagesSince,
  parseGmailMessage,
  type ParsedGmailMessage,
} from "@/lib/integrations/gmail";
import {
  getConnectionStatus,
  getValidAccessToken,
} from "@/lib/integrations/google-calendar";
import { EA_TIMEZONE } from "./digest-data";
import { listEaRecipients, type EaRecipient } from "./recipients";
import { freeWindowsForDay, loadCalendarWindow } from "./time-blocks";

/**
 * How far back each sweep looks. Deliberately longer than the hourly
 * cadence: an overlap means a message arriving as a run starts is not
 * missed, and the UNIQUE thread ledger makes the overlap free.
 */
const LOOKBACK_MINUTES = 150;

/** Most threads to classify in one run. A runaway guard, not a target. */
const MAX_THREADS_PER_RUN = 40;

const CLASSIFIER_SYSTEM = `You decide one thing about an email: is the sender asking for time with the recipient?

Answer with exactly one word, lowercase, nothing else:
  meeting  - the sender wants a call, a meeting, a demo, a chat, a coffee, or asks about availability
  other    - anything else

"other" includes: newsletters, invoices, receipts, automated notifications, calendar invitations already booked, marketing, recruiters pitching candidates, and ordinary conversation that does not ask for time.

When genuinely ambiguous, answer other. A missed draft costs nothing; a wrong one wastes the recipient's attention.`;

export type SweepResult = {
  recipients: number;
  threadsSeen: number;
  drafted: number;
  skipped: number;
  failed: number;
};

/* --------------------------- booking link --------------------------- */

/**
 * This Builder's OWN booking link, preferred over the shared env var.
 *
 * Order matters. The Builder's own `scheduling_links` row wins, so each
 * one's drafts offer their own calendar; `EA_BOOKING_URL` is only the
 * fallback for a Builder who has not made a link yet. The reverse
 * precedence would hand every Builder in the practice the same booking
 * page, which is the exact single-user assumption this build had to
 * remove elsewhere.
 */
async function resolveBookingUrl(recipient: EaRecipient): Promise<string | null> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  const [link] = await withSystemContext((tx) =>
    tx
      .select({ slug: schedulingLinks.slug })
      .from(schedulingLinks)
      .where(eq(schedulingLinks.coachUserProfileId, recipient.userProfileId))
      .limit(1),
  );
  if (link) return `${base}/book/${link.slug}`;

  const shared = process.env.EA_BOOKING_URL?.trim();
  return shared && shared.length > 0 ? shared : null;
}

/* ---------------------------- open slots ---------------------------- */

/**
 * Two or three concrete times, pulled from the real calendar.
 *
 * "Let me know what works" puts the work back on the prospect. Naming
 * actual times is what turns a reply into a booking.
 */
async function nextOpenSlots(
  recipient: EaRecipient,
  now: Date,
  wanted = 3,
): Promise<string[]> {
  const external = await loadCalendarWindow(recipient.userProfileId, now);
  if (external === null) return [];

  const busy = external.map((e) => ({
    start: DateTime.fromJSDate(e.start, { zone: EA_TIMEZONE }),
    end: DateTime.fromJSDate(e.end, { zone: EA_TIMEZONE }),
  }));

  const nowMt = DateTime.fromJSDate(now, { zone: EA_TIMEZONE });
  // Never offer something in the next couple of hours; a prospect
  // reading at 09:00 cannot make a 09:30.
  const earliest = nowMt.plus({ hours: 2 });

  const out: string[] = [];
  let day = nowMt.startOf("day");
  for (let i = 0; i < 10 && out.length < wanted; i++, day = day.plus({ days: 1 })) {
    const windows = freeWindowsForDay(day, busy, earliest);
    for (const w of windows) {
      if (w.end.diff(w.start, "minutes").minutes < 30) continue;
      out.push(w.start.toFormat("cccc d LLLL 'at' h:mm a"));
      break; // one suggestion per day reads better than three on Tuesday
    }
  }
  return out.slice(0, wanted);
}

/* ----------------------------- the draft ----------------------------- */

function buildDraft(args: {
  senderFirstName: string | null;
  builderName: string;
  bookingUrl: string | null;
  slots: string[];
}): { text: string; html: string } {
  const greeting = args.senderFirstName ? `Hi ${args.senderFirstName},` : "Hi,";
  const builderFirst = args.builderName.split(" ")[0] ?? args.builderName;

  const lines: string[] = [
    greeting,
    "",
    `Thanks for reaching out. I look after ${builderFirst}'s calendar, so I am picking this one up.`,
    "",
  ];

  if (args.slots.length > 0) {
    lines.push("A few times that are open on his side:");
    lines.push("");
    for (const s of args.slots) lines.push(`  - ${s} Mountain Time`);
    lines.push("");
  }

  if (args.bookingUrl) {
    lines.push(
      args.slots.length > 0
        ? `If one of those suits, the quickest way to lock it in is here: ${args.bookingUrl}`
        : `The quickest way to find a time is his booking page: ${args.bookingUrl}`,
    );
  } else {
    lines.push("Let me know which day suits and I will get it in the diary.");
  }

  lines.push("");
  lines.push("Happy to work around you if none of those land.");
  lines.push("");
  lines.push("Best,");
  lines.push(`${builderFirst}'s assistant`);

  const text = lines.join("\n");

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1A1A1A;">
<p>${esc(greeting)}</p>
<p>Thanks for reaching out. I look after ${esc(builderFirst)}'s calendar, so I am picking this one up.</p>
${
  args.slots.length > 0
    ? `<p>A few times that are open on his side:</p><ul>${args.slots
        .map((s) => `<li>${esc(s)} Mountain Time</li>`)
        .join("")}</ul>`
    : ""
}
${
  args.bookingUrl
    ? `<p>${args.slots.length > 0 ? "If one of those suits, the quickest way to lock it in is" : "The quickest way to find a time is his booking page"}: <a href="${esc(args.bookingUrl)}">${esc(args.bookingUrl)}</a></p>`
    : `<p>Let me know which day suits and I will get it in the diary.</p>`
}
<p>Happy to work around you if none of those land.</p>
<p>Best,<br>${esc(builderFirst)}'s assistant</p>
</div>`;

  return { text, html };
}

function firstNameFrom(msg: ParsedGmailMessage): string | null {
  const addr = msg.from[0];
  if (!addr) return null;
  const local = addr.split("@")[0] ?? "";
  const guess = local.split(/[._-]/)[0] ?? "";
  if (guess.length < 2 || /\d/.test(guess)) return null;
  return guess.charAt(0).toUpperCase() + guess.slice(1);
}

/* ------------------------------ sweep ------------------------------ */

export async function runInboxSweep(now: Date = new Date()): Promise<SweepResult> {
  const recipients = await listEaRecipients();
  const out: SweepResult = {
    recipients: recipients.length,
    threadsSeen: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const recipient of recipients) {
    try {
      const one = await sweepForRecipient(recipient, now);
      out.threadsSeen += one.threadsSeen;
      out.drafted += one.drafted;
      out.skipped += one.skipped;
      out.failed += one.failed;
    } catch (e) {
      out.failed++;
      console.error(`[ea] inbox sweep failed for ${recipient.userProfileId}:`, e);
    }
  }

  return out;
}

async function sweepForRecipient(
  recipient: EaRecipient,
  now: Date,
): Promise<Omit<SweepResult, "recipients">> {
  const result = { threadsSeen: 0, drafted: 0, skipped: 0, failed: 0 };

  const token = await getValidAccessToken(recipient.userProfileId);
  if (!token) return result;

  const status = await getConnectionStatus(recipient.userProfileId);
  const fromAddress = status.connected && status.email ? status.email : null;
  if (!fromAddress) {
    console.warn(
      `[ea] no Google address on file for ${recipient.userProfileId}; cannot draft.`,
    );
    return result;
  }

  const since = now.getTime() - LOOKBACK_MINUTES * 60 * 1000;
  const ids = await listMessagesSince(token.token, since, 200);
  if (ids.length === 0) return result;

  // One message per thread is enough to classify it, and the ledger is
  // keyed by thread, so collapse early.
  const seenThreads = new Set<string>();
  const candidates: ParsedGmailMessage[] = [];
  for (const id of ids) {
    if (candidates.length >= MAX_THREADS_PER_RUN) break;
    let parsed: ParsedGmailMessage;
    try {
      parsed = parseGmailMessage(await getMessage(token.token, id));
    } catch {
      continue;
    }
    if (seenThreads.has(parsed.threadId)) continue;
    // Skip our own outbound and anything already filed as a draft.
    if (parsed.labelIds.includes("SENT") || parsed.labelIds.includes("DRAFT")) {
      continue;
    }
    if (parsed.from.some((f) => f === fromAddress.toLowerCase())) continue;
    seenThreads.add(parsed.threadId);
    candidates.push(parsed);
  }

  if (candidates.length === 0) return result;

  // Threads already in the ledger are done, whichever way they went.
  const known = new Set(
    (
      await withSystemContext((tx) =>
        tx
          .select({ gmailThreadId: eaEmailThreads.gmailThreadId })
          .from(eaEmailThreads)
          .where(eq(eaEmailThreads.userProfileId, recipient.userProfileId)),
      )
    ).map((r) => r.gmailThreadId),
  );

  const fresh = candidates.filter((c) => !known.has(c.threadId));
  result.threadsSeen = fresh.length;
  if (fresh.length === 0) return result;

  const bookingUrl = await resolveBookingUrl(recipient);
  let slots: string[] | null = null; // fetched lazily, only on a hit

  for (const msg of fresh) {
    let verdict = "other";
    try {
      verdict = (
        await classify(
          CLASSIFIER_SYSTEM,
          `Subject: ${msg.subject}\n\n${msg.text.slice(0, 4000)}`,
          { maxTokens: 8 },
        )
      )
        .trim()
        .toLowerCase();
    } catch (e) {
      console.error("[ea] classification failed:", e);
      await logThread(recipient, msg, "other", "failed", "classifier error");
      result.failed++;
      continue;
    }

    if (!verdict.startsWith("meeting")) {
      await logThread(recipient, msg, "other", "skipped", null);
      result.skipped++;
      continue;
    }

    try {
      if (slots === null) slots = await nextOpenSlots(recipient, now);
      const body = buildDraft({
        senderFirstName: firstNameFrom(msg),
        builderName: recipient.fullName,
        bookingUrl,
        slots,
      });

      const draft = await createGmailDraft(recipient.userProfileId, fromAddress, {
        to: msg.from,
        subject: msg.subject.toLowerCase().startsWith("re:")
          ? msg.subject
          : `Re: ${msg.subject}`,
        body: body.text,
        bodyHtml: body.html,
        threadId: msg.threadId,
        inReplyTo: msg.rfcMessageId,
        references: msg.references ?? msg.rfcMessageId,
      });

      await logThread(
        recipient,
        msg,
        "meeting_request",
        "drafted",
        null,
        draft.draftId,
      );
      result.drafted++;
    } catch (e) {
      console.error("[ea] draft creation failed:", e);
      await logThread(
        recipient,
        msg,
        "meeting_request",
        "failed",
        e instanceof Error ? e.message.slice(0, 400) : String(e),
      );
      result.failed++;
    }
  }

  return result;
}

/**
 * Record the thread whichever way it went.
 *
 * Logging the misses is what stops the next sweep paying to classify the
 * same newsletter again, and it is also the audit trail for "why did the
 * assistant not draft on this one".
 */
async function logThread(
  recipient: EaRecipient,
  msg: ParsedGmailMessage,
  classification: "meeting_request" | "other",
  status: "drafted" | "skipped" | "failed",
  note: string | null,
  draftId?: string,
): Promise<void> {
  try {
    await withSystemContext((tx) =>
      tx
        .insert(eaEmailThreads)
        .values({
          orgId: recipient.orgId,
          userProfileId: recipient.userProfileId,
          gmailThreadId: msg.threadId,
          classification,
          status,
          note,
          draftId: draftId ?? null,
        })
        .onConflictDoNothing(),
    );
  } catch (e) {
    console.error("[ea] could not log triage thread:", e);
  }
}
