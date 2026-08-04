/**
 * Telling someone a commitment is now theirs.
 *
 * One path for every assignee — client or Business Builder — because the
 * two used to be handled by the same code with only one of them working.
 *
 * **The bug this exists to close.** `createActionItem` and
 * `updateActionItem` both looked the assignee's email up *inside* the
 * write transaction, which `withEngagementContext` binds to the
 * ENGAGEMENT's org. Bruce and Jen live in the master org, so on any
 * client engagement that read was filtered out by RLS: `assignee` came
 * back undefined, the email was silently never sent, and the in-app
 * notification row was written with the client's `org_id` into a tenant
 * neither Builder's bell can see. It worked only on the internal team
 * engagement, where the bound org happens to be theirs — which is
 * exactly why it looked fine in testing.
 *
 * The UI makes this reachable on purpose: `listEngagementMembers`
 * deliberately prepends the Business Builders to the assignee picker on
 * client engagements, so "assign Jen a task on Crown and Ember" is a
 * normal thing to do and produced silence.
 *
 * Same family as `notifyBuildersOfMessage` and
 * `notifyBuildersOfClientAgendaItem`, and the fix is the same shape:
 * resolve the recipient under `withSystemContext`, and write the
 * notification row with the RECIPIENT's own `org_id` rather than the
 * bound one. The bell reads under the signed-in user's tenant; a row
 * carrying anyone else's org is invisible rather than wrong-looking.
 *
 * NO `"use server"` directive, deliberately. Every export of a
 * `"use server"` module becomes a browser-reachable POST endpoint, and
 * this one writes notifications and sends mail with no authorization of
 * its own — the calling server action is the gate. Same rule as
 * `lib/integrations/fireflies-sync.ts` and `lib/documents/new-version.ts`.
 */

import { eq } from "drizzle-orm";
import { notifications, userProfiles, type UserProfile } from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { actionItemAssignedEmail } from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/push/web-push";

/** Roles that sit on our side of the glass. */
const BUILDER_ROLES: ReadonlyArray<UserProfile["role"]> = [
  "master_admin",
  "coach",
];

export function isBuilderRole(role: UserProfile["role"]): boolean {
  return (BUILDER_ROLES as readonly string[]).includes(role);
}

export type AssignmentNotice = {
  actionItemId: string;
  assigneeUserProfileId: string;
  /** Who did the assigning. Skipped if it matches the assignee — nobody
   *  needs telling about a commitment they just gave themselves. */
  assignerUserProfileId: string;
  assignerName: string;
  itemTitle: string;
  itemDescription: string | null;
  /** `date` column comes back as a string; `new Date()` where it exists. */
  dueDate: string | Date | null;
};

/**
 * Write the in-app row, email the assignee, and push to their devices.
 *
 * Best-effort throughout: this runs AFTER the item is committed, and a
 * mail or push failure must never unwind a commitment that was correctly
 * recorded. Returns nothing; failures are logged.
 */
export async function notifyActionItemAssigned(
  notice: AssignmentNotice,
): Promise<void> {
  if (notice.assigneeUserProfileId === notice.assignerUserProfileId) return;

  try {
    const assignee = await withSystemContext(async (tx) => {
      const [row] = await tx
        .select({
          orgId: userProfiles.orgId,
          fullName: userProfiles.fullName,
          email: userProfiles.email,
          eaNotifyEmail: userProfiles.eaNotifyEmail,
          role: userProfiles.role,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, notice.assigneeUserProfileId))
        .limit(1);
      if (!row) return null;

      await tx.insert(notifications).values({
        // The RECIPIENT's own org, never the bound one. This is the
        // whole fix — see the header.
        orgId: row.orgId,
        userProfileId: notice.assigneeUserProfileId,
        type: "action_item_assigned",
        parentEntityType: "action_item",
        parentEntityId: notice.actionItemId,
        sentVia: "both",
      });

      return row;
    });

    if (!assignee) {
      console.error(
        "[action-items] assignee profile not found; no notice sent",
        notice.assigneeUserProfileId,
      );
      return;
    }

    const builder = isBuilderRole(assignee.role);

    // A Builder's own console, not the client portal. The old code sent
    // Bruce and Jen a /portal/... link, which is the client's surface.
    const url = builder
      ? `/business-builder/action-items/${notice.actionItemId}`
      : `/portal/action-items/${notice.actionItemId}`;

    // The address they actually watch beats the sign-in address — same
    // rule as lib/db/queries/engagement-builders.ts.
    const to = (assignee.eaNotifyEmail?.trim() || assignee.email || "").trim();

    if (to.includes("@")) {
      await sendEmailQuietly({
        ...actionItemAssignedEmail({
          to,
          recipientName: assignee.fullName,
          assignerName: notice.assignerName,
          itemTitle: notice.itemTitle,
          itemDescription: notice.itemDescription,
          dueDate: notice.dueDate ? new Date(notice.dueDate) : null,
          url,
        }),
        // Builder-to-Builder mail ignores the working-hours window;
        // client mail does not. The guard exists to keep US out of a
        // CLIENT's inbox at 9pm, and Bruce asked to hear about an
        // assignment as soon as it happens. It matters more than it
        // sounds: `sendEmail` does not queue an out-of-hours message, it
        // DROPS it (the `email_pending_send_at` queue its header
        // describes was never built), so without this a task assigned at
        // 6:30pm would notify nobody, ever.
        bypassWorkingHours: builder,
      });
    }

    await sendPushToUser(notice.assigneeUserProfileId, {
      title: `${notice.assignerName} assigned you a task`,
      body: notice.itemTitle,
      url,
      tag: `action-item-${notice.actionItemId}`,
    });
  } catch (e) {
    console.error("[action-items] assignment notification failed", e);
  }
}
