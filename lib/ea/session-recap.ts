/**
 * Post-session recaps — draft, approve, send, file.
 *
 * A recap goes out only after Bruce has read it. That is not a nicety:
 * a recap listing commitments the client never agreed to is worse than
 * no recap at all, and it goes out under his name. So the pipeline is
 * always draft first, approval second, send third.
 *
 * Two rules enforced in code rather than trusted to a prompt:
 *
 *   - **Draft action items are never published.** Only items already
 *     moved out of `draft` reach the client. Claude proposes items from
 *     the transcript; until Bruce has published them they are guesses,
 *     and a guess in a client email reads as a commitment.
 *   - **The client-facing HTML is assembled here, not by the model.**
 *     Claude supplies prose (a headline, the decisions, a closing note)
 *     as JSON; every fact with a consequence — who owns what, by when,
 *     when the next session is — comes from the database, and every
 *     string is escaped on the way into the markup. A model cannot
 *     invent an owner or inject markup into a client's inbox.
 *
 * The recap also carries the next session's agenda forward, which is
 * what makes it useful rather than ceremonial: the client sees what was
 * decided, what they own, and what the next conversation is about.
 */

import { and, asc, eq, gt, inArray, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import {
  actionItems,
  agendaItems,
  bbsSessions,
  coaches,
  engagementMeetings,
  engagements,
  messages,
  sessionRecaps,
  userProfiles,
} from "@/lib/db/schema";
import { getConnectionStatus } from "@/lib/integrations/google-calendar";
import { withSystemContext, type Tx } from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import { sendEmailQuietly } from "@/lib/email/send";
import {
  sessionRecapApprovalEmail,
  sessionRecapClientEmail,
} from "@/lib/email/templates";
import { fetchMeetingDetail } from "@/lib/integrations/fireflies";
import { THREAD_TYPE } from "@/lib/communication/audience";
import {
  signatureLooksLikeHtml,
  signatureToEmailHtml,
  signatureToPlainText,
} from "@/lib/templates/markdown-to-html";
import { EA_TIMEZONE } from "./digest-data";
import { approvalUrl, mintApprovalToken } from "./tokens";

/* ----------------------------- helpers ----------------------------- */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function whenMt(d: Date): string {
  return DateTime.fromJSDate(d, { zone: EA_TIMEZONE }).toFormat(
    "cccc d LLLL, h:mm a",
  );
}

function dateMt(d: Date): string {
  return DateTime.fromJSDate(d, { zone: EA_TIMEZONE }).toFormat("ccc d LLL");
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/* --------------------------- model output --------------------------- */

const recapSchema = z.object({
  headline: z.string(),
  decisions: z.array(z.string()),
  closingNote: z.string(),
});

const RECAP_SYSTEM = `You write the recap a business coach sends a client after a working session.

You are given a meeting summary. Return STRICT JSON, no code fences, matching:
{"headline": string, "decisions": string[], "closingNote": string}

headline: one sentence naming what the session was actually about. No greeting.
decisions: what was DECIDED, one per entry, in plain past tense ("Agreed to move the shop to a two-shift pattern from September"). Decisions only. Not topics discussed, not tasks — tasks are handled elsewhere and will be added below your text. If nothing was decided, return an empty array.
closingNote: two sentences at most, forward-looking, warm but not effusive.

House style: Canadian spelling. No em dashes. Sentence case. Never mention price, fees, or rates. Never invent a name, a number, or a date that is not in the summary.`;

/* -------------------------- draft creation -------------------------- */

export type RecapGenerationResult =
  | { ok: true; recapId: string; created: boolean }
  | { ok: false; reason: string };

/**
 * Build the draft recap for a completed session and email it to the
 * Business Builder for approval.
 *
 * Idempotent: `session_recaps.bbs_session_id` is UNIQUE, so a re-run of
 * the Fireflies sync returns the existing recap rather than drafting a
 * second one or emailing Bruce twice.
 */
export async function generateSessionRecap(
  bbsSessionId: string,
): Promise<RecapGenerationResult> {
  const ctx = await withSystemContext(async (tx) => {
    const [session] = await tx
      .select()
      .from(bbsSessions)
      .where(eq(bbsSessions.id, bbsSessionId))
      .limit(1);
    if (!session) return null;

    const [existing] = await tx
      .select({ id: sessionRecaps.id })
      .from(sessionRecaps)
      .where(eq(sessionRecaps.bbsSessionId, bbsSessionId))
      .limit(1);

    const [engagement] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.id, session.engagementId))
      .limit(1);

    // The Business Builder who OWNS this engagement, not whoever happens
    // to be master admin. Jen's client produces Jen's approval email and
    // sends from Jen's address; anything else would have every recap in
    // the practice routing through one person.
    const owner = engagement
      ? await resolveEngagementOwner(tx, engagement.coachId)
      : null;

    return {
      session,
      existing: existing ?? null,
      engagement: engagement ?? null,
      owner,
    };
  });

  if (!ctx) return { ok: false, reason: "session-missing" };
  if (ctx.existing) {
    return { ok: true, recapId: ctx.existing.id, created: false };
  }
  if (!ctx.engagement) return { ok: false, reason: "engagement-missing" };
  if (ctx.engagement.isInternal) {
    // Internal touch-bases have no client to send a recap to.
    return { ok: false, reason: "internal-engagement" };
  }

  const { session, engagement } = ctx;

  /* ---- transcript summary, if Fireflies has one ---- */
  let firefliesUrl: string | null = null;
  let summaryText = "";
  // The meeting workspace row for this session, when we have one. It is
  // what the "open it in the console" link points at — see the note on
  // `reviewUrl` below.
  let engagementMeetingId: string | null = null;
  if (session.firefliesRecordingId) {
    // OUR OWN COPY FIRST. The hourly sync already stores every meeting's
    // overview and bullets in `engagement_meetings`, so re-fetching from
    // Fireflies here bought nothing and added a way to fail: one refused
    // call — a rate limit, a dropped connection, a field the schema no
    // longer likes — and the recap quietly fell back to neutral copy while
    // the material sat in our own database. That is exactly what produced
    // the empty Impactica recap on 29 Jul: 885 characters of overview and
    // 3,406 of bullets, stored and unread.
    const stored = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          id: engagementMeetings.id,
          overview: engagementMeetings.summaryOverview,
          bullets: engagementMeetings.summaryBullets,
          url: engagementMeetings.transcriptUrl,
        })
        .from(engagementMeetings)
        .where(
          eq(
            engagementMeetings.firefliesTranscriptId,
            session.firefliesRecordingId as string,
          ),
        )
        .limit(1);
      return row ?? null;
    });
    if (stored) {
      engagementMeetingId = stored.id;
      firefliesUrl = stored.url;
      summaryText = [stored.overview ?? "", stored.bullets ?? ""]
        .filter(Boolean)
        .join("\n\n");
    }

    // Reach for the API only when we genuinely have nothing — a meeting
    // recorded since the last sync ran.
    if (summaryText.trim().length === 0) {
      try {
        const detail = await fetchMeetingDetail(session.firefliesRecordingId);
        if (detail) {
          firefliesUrl = firefliesUrl ?? detail.transcript_url;
          summaryText = [
            detail.summary?.overview ?? "",
            detail.summary?.shorthand_bullet ?? "",
          ]
            .filter(Boolean)
            .join("\n\n");
        }
      } catch (e) {
        console.error("[ea] Fireflies detail fetch failed:", e);
      }
    }
  }

  // NO MATERIAL, NO APPROVAL EMAIL. A recap built from the neutral
  // fallback copy is a heading, a sign-off, and nothing in between.
  // Asking someone to approve sending that to a client is worse than
  // sending nothing at all, because it reads as though the session itself
  // produced nothing worth saying. Skipped rather than drafted, so the
  // next sweep retries it once Fireflies has finished processing.
  if (summaryText.trim().length === 0) {
    console.warn(
      `[ea] no transcript summary for session ${session.id}; skipping recap rather than drafting an empty one.`,
    );
    return { ok: false, reason: "no-transcript-content" };
  }

  /* ---- prose, BEFORE anything is written ---- */
  //
  // Ordered ahead of the carry-forward deliberately: nothing may be
  // mutated until we know a real recap can be produced. An abort here
  // leaves the session exactly as it was, so the next sweep retries it
  // cleanly.
  //
  // NO PROSE, NO RECAP. This used to fall back to neutral copy — a
  // headline, a sign-off, and nothing in between — and store it as a
  // draft. That is worse than failing, for two reasons. It asks someone
  // to approve sending a client an email that says nothing, and because
  // `bbs_session_id` is UNIQUE it permanently consumes the session's one
  // recap slot, so the retry that would have worked never runs. That is
  // what produced the empty A&M Abatement recap on 30 Jul 2026 while
  // 2,420 characters of Fireflies summary sat in the database unread.
  let prose: z.infer<typeof recapSchema>;
  try {
    const result = await complete({
      system: RECAP_SYSTEM,
      user: `Client: ${engagement.name ?? "the client"}\nSession date: ${dateMt(session.scheduledAt)}\n\nMeeting summary:\n${summaryText}`,
      maxTokens: 1200,
    });
    const cleaned = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
    prose = recapSchema.parse(JSON.parse(cleaned));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[ea] recap prose failed for session ${session.id}; not drafting an empty recap:`,
      e,
    );
    return { ok: false, reason: `prose-failed: ${message}` };
  }

  /* ---- carry the agenda forward, then read what the next session holds ---- */
  const forward = await withSystemContext(async (tx) => {
    const [next] = await tx
      .select({ id: bbsSessions.id, scheduledAt: bbsSessions.scheduledAt })
      .from(bbsSessions)
      .where(
        and(
          eq(bbsSessions.engagementId, session.engagementId),
          eq(bbsSessions.status, "scheduled"),
          gt(bbsSessions.scheduledAt, session.scheduledAt),
        ),
      )
      .orderBy(asc(bbsSessions.scheduledAt))
      .limit(1);

    if (!next) return { next: null, agenda: [] as { title: string }[] };

    await carryForwardAgendaAsSystem(tx, session.id, next.id, session.orgId);

    const agenda = await tx
      .select({ title: agendaItems.title })
      .from(agendaItems)
      .where(
        and(
          eq(agendaItems.bbsSessionId, next.id),
          eq(agendaItems.status, "pending"),
        ),
      )
      .orderBy(asc(agendaItems.sortOrder));

    return { next, agenda };
  });

  /* ---- published commitments only ---- */
  const commitments = await withSystemContext(async (tx) =>
    tx
      .select({
        title: actionItems.title,
        dueDate: actionItems.dueDate,
        assigneeName: userProfiles.fullName,
      })
      .from(actionItems)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, actionItems.assigneeUserProfileId),
      )
      .where(
        and(
          eq(actionItems.bbsSessionId, session.id),
          // Draft items are Claude's guesses until Bruce publishes them.
          // They never reach a client.
          ne(actionItems.status, "draft"),
        ),
      ),
  );

  /* ---- assemble the client-facing body ---- */
  const built = buildRecapBody({
    clientName: engagement.name ?? "there",
    sessionAt: session.scheduledAt,
    headline: prose.headline,
    decisions: prose.decisions,
    closingNote: prose.closingNote,
    commitments: commitments.map((c) => ({
      title: c.title,
      assigneeName: c.assigneeName,
      dueDate: c.dueDate,
    })),
    firefliesUrl,
    nextSessionAt: forward.next?.scheduledAt ?? null,
    nextAgenda: forward.agenda.map((a) => a.title),
    signature: ctx.owner?.emailSignature ?? null,
  });

  const subject = `Recap: our session on ${dateMt(session.scheduledAt)}`;

  /* ---- store + notify ---- */
  const stored = await withSystemContext(async (tx) => {
    const inserted = await tx
      .insert(sessionRecaps)
      .values({
        orgId: session.orgId,
        engagementId: session.engagementId,
        bbsSessionId: session.id,
        status: "draft",
        subject,
        bodyHtml: built.html,
        bodyText: built.text,
        bodyMarkdown: built.markdown,
        firefliesUrl,
        nextSessionId: forward.next?.id ?? null,
      })
      // UNIQUE on bbs_session_id. A concurrent sync inserts nothing.
      .onConflictDoNothing()
      .returning({ id: sessionRecaps.id });

    if (inserted.length === 0) return null;
    const recapId = inserted[0].id;

    const owner = ctx.owner;
    if (!owner) return { recapId, approval: null };

    const token = await mintApprovalToken(tx, {
      orgId: owner.orgId,
      userProfileId: owner.id,
      subjectType: "session_recap",
      subjectId: recapId,
    });

    return { recapId, approval: { owner, token } };
  });

  if (stored === null) {
    const [existing] = await withSystemContext((tx) =>
      tx
        .select({ id: sessionRecaps.id })
        .from(sessionRecaps)
        .where(eq(sessionRecaps.bbsSessionId, session.id))
        .limit(1),
    );
    return existing
      ? { ok: true, recapId: existing.id, created: false }
      : { ok: false, reason: "insert-raced" };
  }

  if (stored.approval) {
    const { owner, token } = stored.approval;
    await sendEmailQuietly(
      sessionRecapApprovalEmail({
        to: owner.eaNotifyEmail?.trim() || owner.email,
        recipientName: owner.fullName,
        clientLabel: engagement.name ?? "Client",
        sessionWhen: whenMt(session.scheduledAt),
        recapHtml: built.html,
        approveUrl: approvalUrl(token),
        // The MEETING WORKSPACE, not the BBS session record.
        //
        // This link previously pointed at
        // /business-builder/sessions/<sessionId> — one path segment,
        // where the route is /sessions/[engagementId]/[sessionId]. The
        // session id landed in the engagementId slot, matched no
        // engagement, and 404'd. That was the reported bug.
        //
        // Fixing the segment alone would have been the wrong repair:
        // the session record holds only the scheduled time, a status
        // and calendar-sync notes. It shows nothing about the recap, so
        // "needs an edit first?" led somewhere with nothing to edit.
        // The meeting workspace is the page that actually carries the
        // session's material — transcript, Fireflies recap, drafted
        // items awaiting review.
        //
        // Falls back to the session record when no meeting row resolved
        // (no transcript matched). A recap is only drafted from a
        // transcript today, so that path is defensive rather than
        // expected — but a link to a thin page still beats no link.
        reviewUrl: engagementMeetingId
          ? `${appUrl()}/business-builder/engagements/${session.engagementId}/meetings/${engagementMeetingId}`
          : `${appUrl()}/business-builder/sessions/${session.engagementId}/${session.id}`,
      }),
    );
  }

  return { ok: true, recapId: stored.recapId, created: true };
}

/**
 * The Business Builder who owns an engagement, resolved from the
 * engagement's coach row. Falls back to the master admin so a client
 * whose coach record is missing still produces an approval email rather
 * than silently dropping the recap.
 */
async function resolveEngagementOwner(
  tx: Tx,
  coachId: string,
): Promise<{
  id: string;
  orgId: string;
  fullName: string;
  email: string;
  eaNotifyEmail: string | null;
  emailSignature: string | null;
} | null> {
  const [byCoach] = await tx
    .select({
      id: userProfiles.id,
      orgId: userProfiles.orgId,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
      eaNotifyEmail: userProfiles.eaNotifyEmail,
      emailSignature: userProfiles.emailSignature,
    })
    .from(coaches)
    .innerJoin(userProfiles, eq(userProfiles.id, coaches.userProfileId))
    .where(eq(coaches.id, coachId))
    .limit(1);
  if (byCoach) return byCoach;

  const [fallback] = await tx
    .select({
      id: userProfiles.id,
      orgId: userProfiles.orgId,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
      eaNotifyEmail: userProfiles.eaNotifyEmail,
      emailSignature: userProfiles.emailSignature,
    })
    .from(userProfiles)
    .where(eq(userProfiles.role, "master_admin"))
    .limit(1);
  return fallback ?? null;
}

/* --------------------------- body builder --------------------------- */

export function buildRecapBody(args: {
  clientName: string;
  sessionAt: Date;
  headline: string;
  decisions: string[];
  closingNote: string;
  commitments: {
    title: string;
    assigneeName: string | null;
    dueDate: Date | null;
  }[];
  firefliesUrl: string | null;
  nextSessionAt: Date | null;
  nextAgenda: string[];
  /** The Builder's own sign-off, appended so the recap reads as coming
   *  from a person rather than from a system. */
  signature?: string | null;
}): { html: string; text: string; markdown: string } {
  const NAVY = "#2E4057";
  const MUTED = "#666666";
  const RULE = "#E5E5E5";

  const h: string[] = [];
  h.push(
    `<p style="margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">${esc(args.headline)}</p>`,
  );

  if (args.decisions.length > 0) {
    h.push(
      `<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 8px 0;">What we decided</div>
<ul style="margin:0;padding-left:18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;">${args.decisions
        .map((d) => `<li style="margin:0 0 6px 0;">${esc(d)}</li>`)
        .join("")}</ul>`,
    );
  }

  if (args.commitments.length > 0) {
    h.push(
      `<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 8px 0;">Who is doing what</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;font-size:14px;">${args.commitments
        .map(
          (c) => `<tr>
  <td style="padding:8px 0;border-bottom:1px solid ${RULE};line-height:1.5;">
    ${esc(c.title)}<br>
    <span style="font-size:12px;color:${MUTED};">${esc(c.assigneeName ?? "Unassigned")}${
      c.dueDate ? ` &middot; by ${esc(dateMt(c.dueDate))}` : " &middot; no date set"
    }</span>
  </td>
</tr>`,
        )
        .join("")}</table>`,
    );
  }

  if (args.nextSessionAt) {
    h.push(
      `<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${NAVY};text-transform:uppercase;letter-spacing:0.06em;margin:24px 0 8px 0;">Next session</div>
<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;">${esc(whenMt(args.nextSessionAt))}</p>` +
        (args.nextAgenda.length > 0
          ? `<p style="margin:0 0 4px 0;font-family:Arial,sans-serif;font-size:13px;color:${MUTED};">On the agenda:</p>
<ul style="margin:0;padding-left:18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${args.nextAgenda
              .map((a) => `<li style="margin:0 0 4px 0;">${esc(a)}</li>`)
              .join("")}</ul>`
          : ""),
    );
  }

  if (args.firefliesUrl) {
    h.push(
      `<p style="margin:24px 0 0 0;font-family:Arial,sans-serif;font-size:14px;"><a href="${esc(args.firefliesUrl)}" style="color:${NAVY};">Full transcript and recording</a></p>`,
    );
  }

  h.push(
    `<p style="margin:24px 0 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">${esc(args.closingNote)}</p>`,
  );

  // The stored signature is HTML whenever it was written in the
  // signature editor (which emits HTML), and plain text only for legacy
  // ones. Escaping it produced literal `<p style="text-align: left;">`
  // in the email — which is what a client would have read. Same helpers
  // the client-message path has always used.
  const sigRaw = args.signature?.trim() ?? "";
  const sigIsHtml = sigRaw.length > 0 && signatureLooksLikeHtml(sigRaw);
  const sigPlain = sigIsHtml ? signatureToPlainText(sigRaw) : sigRaw;

  if (sigRaw.length > 0) {
    h.push(
      `<div style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid ${RULE};font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:${MUTED};">${
        sigIsHtml
          ? signatureToEmailHtml(sigRaw)
          : esc(sigRaw).replace(/\n/g, "<br>")
      }</div>`,
    );
  }

  /* ---- markdown, for the portal thread ---- */
  //
  // The portal renders message bodies as Markdown with raw HTML stripped
  // (multi-tenant user content), so this is the only formatting that
  // survives that surface. Headings, bold owners, real lists.
  const m: string[] = [args.headline, ""];
  if (args.decisions.length > 0) {
    m.push("### What we decided", "");
    for (const d of args.decisions) m.push(`- ${d}`);
    m.push("");
  }
  if (args.commitments.length > 0) {
    m.push("### Who is doing what", "");
    for (const c of args.commitments) {
      const who = c.assigneeName ?? "Unassigned";
      const when = c.dueDate ? `by ${dateMt(c.dueDate)}` : "no date set";
      m.push(`- **${c.title}** — ${who}, ${when}`);
    }
    m.push("");
  }
  if (args.nextSessionAt) {
    m.push("### Next session", "", `**${whenMt(args.nextSessionAt)}**`, "");
    if (args.nextAgenda.length > 0) {
      m.push("On the agenda:", "");
      for (const a of args.nextAgenda) m.push(`- ${a}`);
      m.push("");
    }
  }
  if (args.firefliesUrl) {
    m.push(`[Full transcript and recording](${args.firefliesUrl})`, "");
  }
  m.push(args.closingNote);
  // Plain text, not the raw HTML: the portal renders this through
  // react-markdown with raw HTML stripped, so tags would either vanish
  // or show as escaped noise on the client's own record of the session.
  if (sigPlain.length > 0) {
    m.push("", "---", "", sigPlain);
  }

  /* ---- plain text ---- */
  const t: string[] = [args.headline, ""];
  if (args.decisions.length) {
    t.push("WHAT WE DECIDED");
    for (const d of args.decisions) t.push(`  - ${d}`);
    t.push("");
  }
  if (args.commitments.length) {
    t.push("WHO IS DOING WHAT");
    for (const c of args.commitments) {
      t.push(
        `  - ${c.title} (${c.assigneeName ?? "Unassigned"}${c.dueDate ? `, by ${dateMt(c.dueDate)}` : ""})`,
      );
    }
    t.push("");
  }
  if (args.nextSessionAt) {
    t.push("NEXT SESSION");
    t.push(`  ${whenMt(args.nextSessionAt)}`);
    for (const a of args.nextAgenda) t.push(`    - ${a}`);
    t.push("");
  }
  if (args.firefliesUrl) {
    t.push(`Full transcript: ${args.firefliesUrl}`);
    t.push("");
  }
  t.push(args.closingNote);
  if (sigPlain.length > 0) {
    t.push("", sigPlain);
  }

  return {
    html: h.join("\n"),
    text: t.join("\n"),
    markdown: m.join("\n"),
  };
}

/* ---------------------------- approval ---------------------------- */

export type RecapApprovalResult =
  | { ok: true; sentTo: number; clientLabel: string }
  | { ok: false; reason: string };

/**
 * Approve a draft recap: file it on the client's portal thread, then
 * send it.
 *
 * Order matters. The portal message is written first, in the same
 * transaction that flips the recap out of `draft`, so the permanent
 * record exists before anything leaves the building. `sent_at` is
 * stamped only after the email actually goes, which means a delivery
 * failure leaves the recap `approved` and retryable rather than
 * silently marked done.
 */
export async function approveSessionRecap(
  recapId: string,
  approverUserProfileId: string,
): Promise<RecapApprovalResult> {
  const claimed = await withSystemContext(async (tx) => {
    const [recap] = await tx
      .select()
      .from(sessionRecaps)
      .where(eq(sessionRecaps.id, recapId))
      .limit(1);
    if (!recap) return { kind: "error" as const, error: "not-found" };
    if (recap.status === "sent") return { kind: "error" as const, error: "already-sent" };

    const [engagement] = await tx
      .select()
      .from(engagements)
      .where(eq(engagements.id, recap.engagementId))
      .limit(1);
    if (!engagement) return { kind: "error" as const, error: "engagement-missing" };

    // Flip out of draft, guarded on the current status so two
    // simultaneous approvals cannot both proceed.
    const flipped = await tx
      .update(sessionRecaps)
      .set({
        status: "approved",
        approvedByUserProfileId: approverUserProfileId,
        approvedAt: new Date(),
      })
      .where(
        and(eq(sessionRecaps.id, recapId), eq(sessionRecaps.status, "draft")),
      )
      .returning({ id: sessionRecaps.id });
    if (flipped.length === 0) return { kind: "error" as const, error: "already-approved" };

    // The permanent portal record. `engagement_team` so everyone on the
    // engagement can see it, which is what makes it a record rather than
    // a private note.
    const [message] = await tx
      .insert(messages)
      .values({
        orgId: recap.orgId,
        engagementId: recap.engagementId,
        parentEntityType: THREAD_TYPE.engagementTeam,
        parentEntityId: recap.engagementId,
        // Markdown, not HTML and not flat text. The portal renders
        // message bodies through react-markdown with raw HTML stripped,
        // so this is the only form that arrives formatted. Pre-0087
        // recaps have no markdown column and fall back.
        body: recap.bodyMarkdown ?? recap.bodyText,
        authorUserProfileId: approverUserProfileId,
      })
      .returning({ id: messages.id });

    await tx
      .update(sessionRecaps)
      .set({ messageId: message.id })
      .where(eq(sessionRecaps.id, recapId));

    // Client contacts: the people who lead the engagement on their side.
    // Deliberately NOT every profile in the org. Employees and prospects
    // can read the recap on the portal thread if they have access, but a
    // recap that lands unbidden in a junior employee's inbox is a
    // different thing from one the client lead expects.
    const contacts = await tx
      .select({ email: userProfiles.email, fullName: userProfiles.fullName })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, engagement.orgId),
          inArray(userProfiles.role, ["client_lead", "client_manager"]),
        ),
      );

    return {
      kind: "ok" as const,
      recap,
      engagement,
      contacts: contacts.filter((c) => c.email && c.email.includes("@")),
    };
  });

  if (claimed.kind === "error") {
    const copy: Record<string, string> = {
      "not-found": "That recap no longer exists.",
      "already-sent": "That recap has already gone to the client.",
      "already-approved": "That recap has already been approved.",
      "engagement-missing": "The engagement for that recap is missing.",
    };
    return { ok: false, reason: copy[claimed.error] ?? claimed.error };
  }

  const { recap, engagement, contacts } = claimed;
  const portalUrl = `${appUrl()}/portal/communication`;
  const envelope = sessionRecapClientEmail({
    to: "",
    subject: recap.subject,
    recapHtml: recap.bodyHtml,
    recapText: recap.bodyText,
    portalUrl,
  });

  // Send from the Business Builder's OWN mailbox, not the app's
  // notification address.
  //
  // A recap is a coaching artefact, not a system receipt. Sent from
  // their address it lands as a normal note from their coach, a reply
  // reaches a human instead of a no-reply mailbox, and a copy sits in
  // their Sent folder with the rest of the client correspondence.
  //
  // Falls back to the app's transactional sender when Google is not
  // connected. That is a deliberate degradation rather than a hard
  // failure: an approved recap that never leaves because a token
  // expired is the worse outcome.
  const google = await getConnectionStatus(approverUserProfileId);
  const fromAddress = google.connected ? google.email : null;

  let delivered = 0;
  for (const c of contacts) {
    if (fromAddress) {
      try {
        const { sendGmailMessage } = await import("@/lib/integrations/gmail");
        await sendGmailMessage(approverUserProfileId, fromAddress, {
          to: [c.email],
          subject: recap.subject,
          body: envelope.text,
          bodyHtml: envelope.html,
        });
        delivered++;
        continue;
      } catch (e) {
        console.error(
          "[ea] Gmail send failed, falling back to the app sender:",
          e,
        );
      }
    }
    const result = await sendEmailQuietly({ ...envelope, to: c.email });
    if (result.delivered) delivered++;
  }

  if (delivered > 0) {
    await withSystemContext((tx) =>
      tx
        .update(sessionRecaps)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(sessionRecaps.id, recapId)),
    );
  }

  return {
    ok: true,
    sentTo: delivered,
    clientLabel: engagement.name ?? "the client",
  };
}

/** Summary for the approve link's confirmation page. */
export async function describeRecap(recapId: string): Promise<{
  clientLabel: string;
  subject: string;
  bodyHtml: string;
  status: string;
  /**
   * How many client contacts would actually be emailed. Counted for the
   * confirmation page, because zero is common and invisible: a client
   * who has never been invited to their portal has no user rows at all,
   * so approving files the record and emails nobody. Saying that BEFORE
   * the tap is the difference between a considered decision and
   * believing a client was written to when they were not.
   */
  recipientCount: number;
} | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        subject: sessionRecaps.subject,
        bodyHtml: sessionRecaps.bodyHtml,
        status: sessionRecaps.status,
        clientLabel: engagements.name,
        orgId: engagements.orgId,
      })
      .from(sessionRecaps)
      .innerJoin(engagements, eq(engagements.id, sessionRecaps.engagementId))
      .where(eq(sessionRecaps.id, recapId))
      .limit(1);
    if (!row) return null;

    // Same rule the send path uses, so the count cannot disagree with
    // what actually happens.
    const contacts = await tx
      .select({ email: userProfiles.email })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.orgId, row.orgId),
          inArray(userProfiles.role, ["client_lead", "client_manager"]),
        ),
      );

    return {
      clientLabel: row.clientLabel ?? "Client",
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      status: row.status,
      recipientCount: contacts.filter((c) => c.email?.includes("@")).length,
    };
  });
}

/* ----------------------- agenda carry-forward ----------------------- */

/**
 * System-context carry-forward.
 *
 * `carryForwardAgenda` in lib/actions/agenda-items.ts does the same job
 * but authorises through `ensureUserProfile()`, which has no signed-in
 * user in a background run. Rather than loosening that action's checks,
 * this is the cron-side equivalent: copy everything still pending onto
 * the next session and mark the sources deferred, so "we keep punting
 * this" stays visible.
 *
 * Guarded against double-running by checking for an existing copy on the
 * target session; a second sweep carries nothing.
 */
async function carryForwardAgendaAsSystem(
  tx: Tx,
  fromSessionId: string,
  toSessionId: string,
  orgId: string,
): Promise<number> {
  const pending = await tx
    .select({
      id: agendaItems.id,
      title: agendaItems.title,
      body: agendaItems.body,
      sortOrder: agendaItems.sortOrder,
      raisedBy: agendaItems.raisedByUserProfileId,
    })
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.bbsSessionId, fromSessionId),
        eq(agendaItems.status, "pending"),
      ),
    );
  if (pending.length === 0) return 0;

  const alreadyCarried = await tx
    .select({ from: agendaItems.carriedFromAgendaItemId })
    .from(agendaItems)
    .where(eq(agendaItems.bbsSessionId, toSessionId));
  const carriedIds = new Set(
    alreadyCarried.map((r) => r.from).filter((v): v is string => v !== null),
  );

  const toCopy = pending.filter((p) => !carriedIds.has(p.id));
  if (toCopy.length === 0) return 0;

  await tx.insert(agendaItems).values(
    toCopy.map((p) => ({
      orgId,
      bbsSessionId: toSessionId,
      title: p.title,
      body: p.body,
      sortOrder: p.sortOrder,
      status: "pending" as const,
      raisedByUserProfileId: p.raisedBy,
      carriedFromAgendaItemId: p.id,
    })),
  );

  for (const p of toCopy) {
    await tx
      .update(agendaItems)
      .set({ status: "deferred" })
      .where(eq(agendaItems.id, p.id));
  }

  return toCopy.length;
}
