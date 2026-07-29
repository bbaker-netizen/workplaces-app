/**
 * Drafting a proposed agenda for a session that has not happened yet.
 *
 * The briefing already says what is OPEN going into a session. It has
 * never helped decide what the session should be ABOUT — that is still
 * built from memory, or by re-reading the Soul File on the drive over.
 * This closes that: by 07:00 there is a proposed agenda for each of the
 * day's sessions, drawn from what actually happened last time and what
 * has moved since.
 *
 * Three inputs, in order of weight:
 *
 *   1. **Last session's transcript summary.** What was left unresolved
 *      is the strongest signal for what this session is for.
 *   2. **Open and overdue commitments** on that engagement. A commitment
 *      that has slipped is a conversation, not a status update.
 *   3. **Deliverables in flight**, especially any past their promised
 *      date.
 *
 * Two rules the code enforces rather than trusting to the prompt:
 *
 *   - **Nothing is written until Bruce accepts.** Agenda items are
 *     client-visible in the portal. A model must not be able to put
 *     talking points in front of a client unread, so drafts live in
 *     `ea_agenda_proposals` until an approve link is tapped.
 *   - **Carried-forward items are never re-proposed.** Anything already
 *     on the session — carried over from last time or added by hand — is
 *     passed to the model as "already covered". Without that the agenda
 *     would quietly duplicate the very items the carry-forward mechanism
 *     exists to preserve.
 */

import { and, asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import {
  actionItems,
  agendaItems,
  bbsSessions,
  deliverables,
  eaAgendaProposals,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext, type Tx } from "@/lib/db/tenant";
import { complete } from "@/lib/ai/anthropic";
import { fetchMeetingDetail } from "@/lib/integrations/fireflies";
import { sessionWasHeld } from "./held-sessions";
import { mintApprovalToken } from "./tokens";

/** Most talking points to propose. An agenda longer than this is a wish
 *  list, and a wish list gets skimmed rather than worked. */
const MAX_ITEMS = 6;

const agendaSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(3),
        body: z.string().nullable().optional(),
      }),
    )
    .max(12),
});

const AGENDA_SYSTEM = `You draft the agenda for a business coaching session, for the coach's eyes before he accepts it.

You are given: what happened last session, what the client and coach still owe each other, what is being built, and what is ALREADY on the agenda.

Return STRICT JSON, no code fences:
{"items": [{"title": string, "body": string | null}]}

title: the talking point, as a short phrase a coach would write on a whiteboard. Not a question, not a sentence. "Second shift start date" not "We should discuss when the second shift will start."
body: one sentence of context only where the title is not self-explanatory, otherwise null.

Rules:
- Never repeat anything listed as already on the agenda. Those are covered.
- Lead with what was left unresolved last session. That is what the session is for.
- A commitment that has slipped is worth a line. A commitment merely in progress is not.
- Between four and six items. Fewer if there is genuinely less to talk about; an honest short agenda beats a padded one.
- Canadian spelling. No em dashes. Sentence case.
- Never mention price, fees, or rates.
- Never invent a fact, a name, or a date that is not in the material you were given.`;

export type ProposedAgendaItem = { title: string; body: string | null };

export type AgendaProposal = {
  proposalId: string;
  bbsSessionId: string;
  engagementLabel: string;
  items: ProposedAgendaItem[];
  approveUrl: string;
};

/**
 * Build the material the model reasons over. Read-only, one transaction.
 */
async function gatherAgendaContext(
  tx: Tx,
  session: { id: string; engagementId: string; scheduledAt: Date },
): Promise<{
  alreadyOnAgenda: string[];
  commitments: { title: string; owner: string; overdue: boolean }[];
  deliverablesInFlight: { title: string; status: string; late: boolean }[];
  previousRecordingId: string | null;
} | null> {
  const existing = await tx
    .select({ title: agendaItems.title })
    .from(agendaItems)
    .where(eq(agendaItems.bbsSessionId, session.id))
    .orderBy(asc(agendaItems.sortOrder));

  const items = await tx
    .select({
      title: actionItems.title,
      dueDate: actionItems.dueDate,
      status: actionItems.status,
      owner: userProfiles.fullName,
    })
    .from(actionItems)
    .leftJoin(userProfiles, eq(userProfiles.id, actionItems.assigneeUserProfileId))
    .where(
      and(
        eq(actionItems.engagementId, session.engagementId),
        ne(actionItems.status, "done"),
        ne(actionItems.status, "draft"),
      ),
    );

  const delivs = await tx
    .select({
      title: deliverables.title,
      status: deliverables.status,
      targetDate: deliverables.targetDate,
    })
    .from(deliverables)
    .where(eq(deliverables.engagementId, session.engagementId));

  const [previous] = await tx
    .select({ recordingId: bbsSessions.firefliesRecordingId })
    .from(bbsSessions)
    .where(
      and(
        eq(bbsSessions.engagementId, session.engagementId),
        ne(bbsSessions.id, session.id),
        // Held before THIS session — not merely "not cancelled", or the
        // DESC ordering below would happily return a future session as
        // the previous one. See lib/ea/held-sessions.ts for why this is
        // no longer `status = 'completed'`.
        sessionWasHeld(session.scheduledAt),
      ),
    )
    .orderBy(desc(bbsSessions.scheduledAt))
    .limit(1);

  const now = new Date();
  return {
    alreadyOnAgenda: existing.map((e) => e.title),
    commitments: items.map((i) => ({
      title: i.title,
      owner: i.owner ?? "Unassigned",
      overdue: Boolean(i.dueDate && i.dueDate < now),
    })),
    deliverablesInFlight: delivs
      .filter((d) => d.status !== "delivered" && d.status !== "archived")
      .map((d) => ({
        title: d.title,
        status: d.status,
        late: Boolean(d.targetDate && d.targetDate < now),
      })),
    previousRecordingId: previous?.recordingId ?? null,
  };
}

/**
 * Draft an agenda for one session and store it as a proposal.
 *
 * Returns null when there is nothing worth proposing — no material to
 * work from, or a proposal already exists. Never throws into the digest:
 * a failed agenda draft must not cost Bruce his morning briefing.
 */
export async function proposeAgendaForSession(args: {
  session: { id: string; engagementId: string; orgId: string; scheduledAt: Date };
  engagementLabel: string;
  recipientUserProfileId: string;
  recipientOrgId: string;
  digestId: string;
}): Promise<AgendaProposal | null> {
  const { session } = args;

  try {
    const existingProposal = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({ id: eaAgendaProposals.id })
        .from(eaAgendaProposals)
        .where(eq(eaAgendaProposals.bbsSessionId, session.id))
        .limit(1);
      return row ?? null;
    });
    // One proposal per session, ever. A declined agenda stays declined.
    if (existingProposal) return null;

    const context = await withSystemContext((tx) =>
      gatherAgendaContext(tx, session),
    );
    if (!context) return null;

    /* ---- last session's transcript, if there is one ---- */
    let lastSession = "";
    if (context.previousRecordingId) {
      try {
        const detail = await fetchMeetingDetail(context.previousRecordingId);
        if (detail) {
          lastSession = [
            detail.summary?.overview ?? "",
            detail.summary?.shorthand_bullet ?? "",
          ]
            .filter(Boolean)
            .join("\n\n");
        }
      } catch (e) {
        console.error("[ea] agenda draft: transcript fetch failed:", e);
      }
    }

    // With no transcript AND no open commitments there is nothing to
    // reason from, and a model asked to invent an agenda will invent one.
    if (!lastSession && context.commitments.length === 0) return null;

    const overdue = context.commitments.filter((c) => c.overdue);
    const userPrompt = [
      `Client: ${args.engagementLabel}`,
      "",
      lastSession
        ? `WHAT HAPPENED LAST SESSION:\n${lastSession}`
        : "WHAT HAPPENED LAST SESSION:\n(no transcript available)",
      "",
      "STILL OWED:",
      ...(context.commitments.length
        ? context.commitments.map(
            (c) =>
              `  - ${c.title} (${c.owner})${c.overdue ? " [OVERDUE]" : ""}`,
          )
        : ["  (nothing outstanding)"]),
      "",
      "BEING BUILT:",
      ...(context.deliverablesInFlight.length
        ? context.deliverablesInFlight.map(
            (d) =>
              `  - ${d.title} (${d.status.replace(/_/g, " ")})${d.late ? " [PAST PROMISED DATE]" : ""}`,
          )
        : ["  (nothing in flight)"]),
      "",
      "ALREADY ON THE AGENDA — do not repeat these:",
      ...(context.alreadyOnAgenda.length
        ? context.alreadyOnAgenda.map((t) => `  - ${t}`)
        : ["  (nothing yet)"]),
      "",
      overdue.length > 0
        ? `${overdue.length} commitment(s) have slipped past their date. Those deserve airtime.`
        : "Nothing has slipped.",
    ].join("\n");

    const result = await complete({
      system: AGENDA_SYSTEM,
      user: userPrompt,
      maxTokens: 1200,
    });

    const cleaned = result.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
    const parsed = agendaSchema.parse(JSON.parse(cleaned));

    // Belt and braces on the "do not repeat" instruction: the model is
    // told, and then the overlap is removed anyway. A duplicated talking
    // point makes the carry-forward mechanism look broken.
    const covered = new Set(
      context.alreadyOnAgenda.map((t) => t.trim().toLowerCase()),
    );
    const items: ProposedAgendaItem[] = parsed.items
      .filter((i) => !covered.has(i.title.trim().toLowerCase()))
      .slice(0, MAX_ITEMS)
      .map((i) => ({ title: i.title.trim(), body: i.body?.trim() || null }));

    if (items.length === 0) return null;

    const stored = await withSystemContext(async (tx) => {
      const inserted = await tx
        .insert(eaAgendaProposals)
        .values({
          orgId: session.orgId,
          engagementId: session.engagementId,
          bbsSessionId: session.id,
          items,
          status: "proposed",
          digestId: args.digestId,
        })
        .onConflictDoNothing()
        .returning({ id: eaAgendaProposals.id });
      if (inserted.length === 0) return null;

      const token = await mintApprovalToken(tx, {
        orgId: args.recipientOrgId,
        userProfileId: args.recipientUserProfileId,
        subjectType: "agenda_proposal",
        subjectId: inserted[0].id,
      });
      return { id: inserted[0].id, token };
    });

    if (!stored) return null;

    const { approvalUrl } = await import("./tokens");
    return {
      proposalId: stored.id,
      bbsSessionId: session.id,
      engagementLabel: args.engagementLabel,
      items,
      approveUrl: approvalUrl(stored.token),
    };
  } catch (e) {
    // Never let a failed agenda cost the briefing it rides in.
    console.error(
      `[ea] agenda draft failed for session ${session.id}:`,
      e,
    );
    return null;
  }
}

/* ---------------------------- accepting ---------------------------- */

export type AcceptAgendaResult =
  | { ok: true; added: number; engagementLabel: string }
  | { ok: false; reason: string };

/**
 * Copy an accepted proposal into real agenda items.
 *
 * A pure copy of the stored text — no second model call — so what lands
 * on the client's agenda is exactly what was reviewed. Items are
 * appended after anything already there (carried-forward points keep
 * their place at the top, where they have earned it by being punted).
 */
export async function acceptAgendaProposal(
  proposalId: string,
  acceptedByUserProfileId: string,
): Promise<AcceptAgendaResult> {
  return withSystemContext(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(eaAgendaProposals)
      .where(eq(eaAgendaProposals.id, proposalId))
      .limit(1);
    if (!proposal) return { ok: false as const, reason: "That agenda is gone." };
    if (proposal.status !== "proposed") {
      return {
        ok: false as const,
        reason: `That agenda has already been ${proposal.status}.`,
      };
    }

    // Guarded on the current status so two taps cannot both write.
    const claimed = await tx
      .update(eaAgendaProposals)
      .set({
        status: "accepted",
        acceptedByUserProfileId,
        acceptedAt: new Date(),
      })
      .where(
        and(
          eq(eaAgendaProposals.id, proposalId),
          eq(eaAgendaProposals.status, "proposed"),
        ),
      )
      .returning({ id: eaAgendaProposals.id });
    if (claimed.length === 0) {
      return { ok: false as const, reason: "That agenda was already actioned." };
    }

    const [{ maxOrder } = { maxOrder: 0 }] = await tx
      .select({ maxOrder: agendaItems.sortOrder })
      .from(agendaItems)
      .where(eq(agendaItems.bbsSessionId, proposal.bbsSessionId))
      .orderBy(desc(agendaItems.sortOrder))
      .limit(1);

    const items = proposal.items as ProposedAgendaItem[];
    await tx.insert(agendaItems).values(
      items.map((item, i) => ({
        orgId: proposal.orgId,
        bbsSessionId: proposal.bbsSessionId,
        title: item.title,
        body: item.body,
        sortOrder: (maxOrder ?? 0) + i + 1,
        status: "pending" as const,
        // Attributed to whoever accepted it. They are raising these
        // points; the assistant only suggested them.
        raisedByUserProfileId: acceptedByUserProfileId,
      })),
    );

    return { ok: true as const, added: items.length, engagementLabel: "" };
  });
}

/** Summary for the approve link's confirmation page. */
export async function describeAgendaProposal(proposalId: string): Promise<{
  items: ProposedAgendaItem[];
  status: string;
  sessionAt: Date | null;
} | null> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        items: eaAgendaProposals.items,
        status: eaAgendaProposals.status,
        sessionAt: bbsSessions.scheduledAt,
      })
      .from(eaAgendaProposals)
      .innerJoin(
        bbsSessions,
        eq(bbsSessions.id, eaAgendaProposals.bbsSessionId),
      )
      .where(eq(eaAgendaProposals.id, proposalId))
      .limit(1);
    if (!row) return null;
    return {
      items: row.items as ProposedAgendaItem[],
      status: row.status,
      sessionAt: row.sessionAt,
    };
  });
}
