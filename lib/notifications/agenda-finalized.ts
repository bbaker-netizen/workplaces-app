/**
 * Announcing an agenda.
 *
 * Two moments, one path: the first time a session's agenda is declared
 * ready, and every time it changes after that. Both go to Business
 * Builders only — a client never receives these, and never sees the
 * control that sends them.
 *
 * **Why the recipients are resolved here and not in the caller.** The
 * write that sets `agenda_finalized_at` runs under
 * `withEngagementContext`, which binds RLS to the ENGAGEMENT's org. Bruce
 * and Jen live in the master org, so a `user_profiles` read in there
 * returns nothing for them and a notification row written with the bound
 * org lands in a tenant whose bell neither of them can see. Same trap as
 * the client-message and client-agenda notifications, and the same fix:
 * `withSystemContext`, and write the row with the RECIPIENT's own org id.
 *
 * The actor is excluded. Being emailed about a button you just pressed
 * teaches you to ignore the sender.
 *
 * NO `"use server"` — every export of such a module is a browser-reachable
 * POST endpoint, and nothing in here authorizes anything. The calling
 * server action is the gate.
 */

import { eq } from "drizzle-orm";
import { engagements, notifications } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { resolveAgendaAudience } from "@/lib/db/queries/engagement-builders";
import { sendEmailQuietly } from "@/lib/email/send";
import {
  agendaFinalizedEmail,
  agendaUpdatedEmail,
  type AgendaLine,
} from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/push/web-push";

export type AgendaAnnouncement = {
  sessionId: string;
  engagementId: string;
  actorUserProfileId: string;
  actorName: string;
  /** Human session time, already formatted in Mountain Time by the
   *  caller — `components/sessions/utils` owns that formatting and this
   *  module must not grow a second opinion about it. */
  sessionWhenLabel: string;
  /** The agenda as it now stands. */
  items: AgendaLine[];
  /** Empty on a first finalize; the delta on every one after. */
  added: AgendaLine[];
  changed: AgendaLine[];
  /** False on the first announcement, true on every re-finalize. */
  isUpdate: boolean;
};

/** Returns how many people were told. Zero is legitimate — a Builder
 *  finalizing an agenda nobody else is on has nobody to notify. */
export async function notifyAgendaFinalized(
  a: AgendaAnnouncement,
): Promise<number> {
  try {
    const ctx = await withSystemContext(async (tx) => {
      const audience = (
        await resolveAgendaAudience(tx, a.engagementId)
      ).filter((b) => b.userProfileId !== a.actorUserProfileId);
      if (audience.length === 0) return null;

      const [eng] = await tx
        .select({ name: engagements.name, isInternal: engagements.isInternal })
        .from(engagements)
        .where(eq(engagements.id, a.engagementId))
        .limit(1);

      await tx.insert(notifications).values(
        audience.map((b) => ({
          // The recipient's own org — see the header.
          orgId: b.orgId,
          userProfileId: b.userProfileId,
          type: (a.isUpdate ? "agenda_updated" : "agenda_finalized") as
            | "agenda_updated"
            | "agenda_finalized",
          // Points at the SESSION. The agenda has no page of its own;
          // it renders inside the session, which is also where the
          // recipient would go to add to it.
          parentEntityType: a.isUpdate
            ? "agenda_updated"
            : "agenda_finalized",
          parentEntityId: a.sessionId,
          sentVia: "both" as const,
        })),
      );

      return {
        audience,
        isInternal: Boolean(eng?.isInternal),
        engagementLabel: eng?.isInternal
          ? "the team touch-base"
          : eng?.name?.trim() || "a client",
      };
    });
    if (!ctx) return 0;

    // The internal workspace has its own route; a client session lives
    // under the engagement. Getting this wrong is how the recap approval
    // links 404'd on 2026-08-03.
    const url = ctx.isInternal
      ? `/business-builder/team/${a.sessionId}`
      : `/business-builder/sessions/${a.engagementId}/${a.sessionId}`;

    const common = {
      finalizedByName: a.actorName,
      engagementLabel: ctx.engagementLabel,
      sessionWhenLabel: a.sessionWhenLabel,
      items: a.items,
      url,
    };

    await Promise.all(
      ctx.audience.map((b) =>
        sendEmailQuietly({
          ...(a.isUpdate
            ? agendaUpdatedEmail({
                ...common,
                to: b.email,
                recipientName: b.fullName,
                added: a.added,
                changed: a.changed,
              })
            : agendaFinalizedEmail({
                ...common,
                to: b.email,
                recipientName: b.fullName,
              })),
          // Builder-to-Builder only, so the working-hours window does not
          // apply — and `sendEmail` DROPS an out-of-hours message rather
          // than queueing it, so without this an agenda finalized after
          // six would reach nobody at all. A session is often prepared
          // for the evening before.
          bypassWorkingHours: true,
        }),
      ),
    );

    const pushBody = a.isUpdate
      ? `${a.added.length + a.changed.length} change${
          a.added.length + a.changed.length === 1 ? "" : "s"
        } before ${a.sessionWhenLabel}`
      : `${a.items.length} point${a.items.length === 1 ? "" : "s"} for ${a.sessionWhenLabel}`;

    await Promise.all(
      ctx.audience.map((b) =>
        sendPushToUser(b.userProfileId, {
          title: a.isUpdate
            ? `Agenda updated — ${ctx.engagementLabel}`
            : `Agenda ready — ${ctx.engagementLabel}`,
          body: pushBody,
          url,
          // Same tag for both states: a later announcement about the
          // same session should replace the earlier one on the lock
          // screen, not stack beneath it.
          tag: `agenda-final-${a.sessionId}`,
        }),
      ),
    );

    return ctx.audience.length;
  } catch (e) {
    console.error("[agenda] finalize notification failed", e);
    return 0;
  }
}
