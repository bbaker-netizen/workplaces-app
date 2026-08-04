"use server";

/**
 * Action Items — server actions (mutations).
 *
 * Phase 1.2 surface for create / update / delete. Reads live in
 * `lib/db/queries/action-items.ts`. Notifications fan out on assignment
 * (sent_via='in_app' for now; email triggers added in Phase 1.4 with
 * Resend).
 *
 * Role-based authorization (per CLAUDE.md role enum):
 *   - master_admin / Coach / client_lead: full edit on items in their
 *     engagements (create, update any field, delete).
 *   - client_manager / client_employee: status-only updates, and only on
 *     items where they are the assignee.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  clientWriteBlocked,
  READ_ONLY_ERROR,
} from "@/lib/server/engagement-guard";
import {
  actionItems,
  agendaItems,
  bbsSessions,
  engagementMeetings,
  userProfiles,
  type UserProfile,
} from "@/lib/db/schema";
import { DELIVERABLE_TYPES } from "@/lib/deliverables/types";
import {
  resolveEngagementIdFromRecord,
  withEngagementContext,
  withTenantContext,
} from "@/lib/db/tenant";
import { notifyActionItemAssigned } from "@/lib/notifications/action-item-assigned";
import { notifyBuildersOfProgress } from "@/lib/notifications/action-item-progress";
import type { ActionItemStatus } from "@/components/action-items/utils";
import { syncActionItemToEa, expireInEa } from "@/lib/assistant/ea-sync";

type Role = UserProfile["role"];

/**
 * Whether two due dates are the same calendar day.
 *
 * `due_date` is a `date` column, so Drizzle hands back midnight-anchored
 * values and a plain `!==` on two Date objects is always true — which
 * would report a date change on every save that merely re-posted the
 * existing one. Compares the ISO day, and treats null-vs-null as equal.
 */
function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    new Date(a).toISOString().slice(0, 10) ===
    new Date(b).toISOString().slice(0, 10)
  );
}

// The Business Builder controls action-item creation and assignment.
// Clients (including client_lead) can only update the status of items
// assigned to them — they can't create, reassign, or edit content.
const FULL_EDITOR_ROLES: ReadonlyArray<Role> = ["master_admin", "coach"];

function canEditAnything(role: Role): boolean {
  return (FULL_EDITOR_ROLES as readonly string[]).includes(role);
}

const statusEnum = z.enum([
  "draft",
  "open",
  "in_progress",
  "done",
  "blocked",
]);

const createSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(10000).nullable().optional(),
  status: statusEnum.default("open"),
  assigneeUserProfileId: z.string().uuid().nullable().optional(),
  // YYYY-MM-DD or null. Form sends ISO date; null = no due date.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
  revenueImpact: z.boolean().default(false),
  marginImpact: z.boolean().default(false),
  /** Optional link to the parent project this action item is part
   *  of. Null = one-off commitment, not part of a project. */
  projectId: z.string().uuid().nullable().optional(),
  /** Optional link to the agenda item this commitment came out of.
   *  Set when a talking point is turned into a task during a meeting,
   *  so the commitment traces back to the discussion. */
  agendaItemId: z.string().uuid().nullable().optional(),
  /** Optional link to the session this came out of. */
  bbsSessionId: z.string().uuid().nullable().optional(),
  /** Which of the nine methodology documents this item IS. Null (the
   *  default) means an ordinary commitment. Migration 0109 retired the
   *  separate `deliverables` table; this is what replaced it. */
  deliverableType: z.enum(DELIVERABLE_TYPES).nullable().optional(),
  /** The synced meeting this came out of, so it appears in that
   *  meeting's workspace beside everything else from the same session. */
  engagementMeetingId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: statusEnum.optional(),
  assigneeUserProfileId: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  revenueImpact: z.boolean().optional(),
  marginImpact: z.boolean().optional(),
  projectId: z.string().uuid().nullable().optional(),
  /** Retype an item, or clear the type to turn a document back into an
   *  ordinary commitment. Full editors only — see FULL_EDITOR_ROLES. */
  deliverableType: z.enum(DELIVERABLE_TYPES).nullable().optional(),
});

export type CreateActionItemInput = z.input<typeof createSchema>;
export type UpdateActionItemInput = z.input<typeof updateSchema>;

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function revalidateActionItemPaths() {
  revalidatePath("/portal/action-items");
  revalidatePath("/business-builder/action-items");
}

export async function createActionItem(
  input: CreateActionItemInput,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEditAnything(profile.role)) {
    return {
      ok: false,
      error: "Your role can't create action items.",
    };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const txResult = await withEngagementContext(
      profile.orgId,
      profile.role,
      data.engagementId,
      async (tx, boundOrgId) => {
      // Both link ids arrive from a client component, so neither can be
      // trusted to belong to this engagement. RLS blocks cross-ORG, not
      // cross-engagement-within-org, and FK checks run as the table
      // owner so a bad id would insert happily and then render nowhere.
      // Verify inside the bound transaction and drop anything that
      // doesn't match rather than failing the whole create.
      let validSessionId: string | null = null;
      if (data.bbsSessionId) {
        const [s] = await tx
          .select({ id: bbsSessions.id })
          .from(bbsSessions)
          .where(
            and(
              eq(bbsSessions.id, data.bbsSessionId),
              eq(bbsSessions.engagementId, data.engagementId),
            ),
          )
          .limit(1);
        validSessionId = s?.id ?? null;
      }

      let validAgendaItemId: string | null = null;
      if (data.agendaItemId) {
        const [a] = await tx
          .select({ id: agendaItems.id })
          .from(agendaItems)
          .innerJoin(bbsSessions, eq(bbsSessions.id, agendaItems.bbsSessionId))
          .where(
            and(
              eq(agendaItems.id, data.agendaItemId),
              eq(bbsSessions.engagementId, data.engagementId),
            ),
          )
          .limit(1);
        validAgendaItemId = a?.id ?? null;
      }

      // Same check, same reason, for the meeting link: RLS stops
      // cross-org but not cross-engagement-within-org, so an id from
      // another client's meeting would insert cleanly and then put this
      // client's commitment in that client's workspace.
      let validMeetingId: string | null = null;
      if (data.engagementMeetingId) {
        const [m] = await tx
          .select({ id: engagementMeetings.id })
          .from(engagementMeetings)
          .where(
            and(
              eq(engagementMeetings.id, data.engagementMeetingId),
              eq(engagementMeetings.engagementId, data.engagementId),
            ),
          )
          .limit(1);
        validMeetingId = m?.id ?? null;
      }

      const [item] = await tx
        .insert(actionItems)
        .values({
          orgId: boundOrgId,
          engagementId: data.engagementId,
          title: data.title,
          description: data.description ?? null,
          status: data.status,
          assigneeUserProfileId: data.assigneeUserProfileId ?? null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          revenueImpact: data.revenueImpact,
          marginImpact: data.marginImpact,
          projectId: data.projectId ?? null,
          agendaItemId: validAgendaItemId,
          bbsSessionId: validSessionId,
          deliverableType: data.deliverableType ?? null,
          engagementMeetingId: validMeetingId,
          createdBy: "coach",
        })
        .returning({ id: actionItems.id });

      return { item };
    },
    );

    // Notify the assignee outside the transaction. Deliberately NOT done
    // in here: the assignee may be a Business Builder, who lives in the
    // master org, and this transaction is bound to the engagement's org —
    // so both the profile read and the notification insert have to happen
    // under withSystemContext. See lib/notifications/action-item-assigned.ts.
    if (data.assigneeUserProfileId) {
      await notifyActionItemAssigned({
        actionItemId: txResult.item.id,
        assigneeUserProfileId: data.assigneeUserProfileId,
        assignerUserProfileId: profile.userProfileId,
        assignerName: await loadAuthorName(profile),
        itemTitle: data.title,
        itemDescription: data.description ?? null,
        dueDate: data.dueDate ?? null,
      });
    }

    revalidateActionItemPaths();
    // Push the new item out to the EA Command Central sheet (best-effort).
    await syncActionItemToEa(txResult.item.id);
    return { ok: true, data: txResult.item };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function loadAuthorName(profile: {
  orgId: string;
  userProfileId: string;
}): Promise<string> {
  try {
    const name = await withTenantContext(profile.orgId, async (tx) => {
      const [row] = await tx
        .select({ fullName: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.id, profile.userProfileId))
        .limit(1);
      return row?.fullName ?? null;
    });
    return name ?? "Someone";
  } catch {
    return "Someone";
  }
}

export async function updateActionItem(
  id: string,
  input: UpdateActionItemInput,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  try {
    const engagementId = await resolveEngagementIdFromRecord(
      "action_items",
      id,
    );
    if (!engagementId) {
      return { ok: false, error: "Action item not found." };
    }
    if (await clientWriteBlocked(profile.role, engagementId)) {
      return { ok: false, error: READ_ONLY_ERROR };
    }
    // A client working their own item is the only case that raises a
    // progress notice. A Business Builder editing their own client's
    // item must not ring their own bell, and telling the OTHER Builder
    // about a client that isn't theirs is the cross-book noise
    // own-book-by-default exists to prevent.
    const actorIsClient = !canEditAnything(profile.role);

    const outcome = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        // Read existing — RLS already scopes to the engagement's org.
        const [existing] = await tx
          .select()
          .from(actionItems)
          .where(eq(actionItems.id, id))
          .limit(1);
        if (!existing) {
          throw new Error("Action item not found.");
        }

        // Role-based field restrictions.
        if (!canEditAnything(profile.role)) {
          const isAssignee =
            existing.assigneeUserProfileId === profile.userProfileId;
          if (!isAssignee) {
            throw new Error("You can only update items assigned to you.");
          }
          // `dueDate` is deliberately NOT here. An assignee owns when
          // their own work lands — the alternative is a client staring
          // at a date they know is wrong with no way to say so except a
          // message that isn't attached to the item. Bruce's call, and
          // the same "straight on, not a request queue" decision as
          // client-raised agenda points. The Business Builder is told:
          // see notifyBuildersOfProgress below.
          const restrictedKeys = [
            "title",
            "description",
            "assigneeUserProfileId",
            "revenueImpact",
            "marginImpact",
            "projectId",
            // What KIND of thing this is is a Business Builder's call.
            // Without this, a client_manager updating the status of
            // their own item could also retype it as a business plan.
            "deliverableType",
          ] as const;
          for (const key of restrictedKeys) {
            if (data[key] !== undefined) {
              throw new Error(
                `Your role can update status only — not ${key}.`,
              );
            }
          }
        }

        // Build the partial update payload.
        const update: Partial<typeof actionItems.$inferInsert> = {};
        if (data.title !== undefined) update.title = data.title;
        if (data.description !== undefined)
          update.description = data.description;
        if (data.status !== undefined) update.status = data.status;
        if (data.assigneeUserProfileId !== undefined)
          update.assigneeUserProfileId = data.assigneeUserProfileId;
        if (data.dueDate !== undefined)
          update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        if (data.revenueImpact !== undefined)
          update.revenueImpact = data.revenueImpact;
        if (data.marginImpact !== undefined)
          update.marginImpact = data.marginImpact;
        if (data.projectId !== undefined) update.projectId = data.projectId;
        if (data.deliverableType !== undefined)
          update.deliverableType = data.deliverableType;

        // Self-heal the session link at the moment of publication.
        //
        // A drafted item needs BOTH links: the meeting workspace reads by
        // `engagement_meeting_id`, the client recap's "Who is doing what"
        // section reads by `bbs_session_id`. Until 2026-08-04 the drafting
        // path wrote only the first, so 36 legacy rows carry a null
        // session and would never appear in a recap however they were
        // published.
        //
        // Healing HERE rather than by backfilling those rows is the
        // deliberate choice: linking a draft to a session makes it
        // reachable from the client-facing session page, and repairing
        // them all in the database would have made 35 unreviewed machine
        // drafts client-reachable the moment the statement ran, ahead of
        // the deploy carrying the query's draft filter. Doing it on the
        // status change means the link appears exactly when the item
        // stops being a draft — which is exactly when it is allowed to be
        // seen. No exposure window, no deploy ordering to remember.
        //
        // A no-op for anything created after this date: the drafting
        // paths now set both links up front.
        if (
          data.status !== undefined &&
          data.status !== "draft" &&
          existing.status === "draft" &&
          !existing.bbsSessionId &&
          existing.firefliesTranscriptId
        ) {
          const [session] = await tx
            .select({ id: bbsSessions.id })
            .from(bbsSessions)
            .where(
              and(
                eq(bbsSessions.engagementId, existing.engagementId),
                eq(
                  bbsSessions.firefliesRecordingId,
                  existing.firefliesTranscriptId,
                ),
              ),
            )
            .limit(1);
          if (session) update.bbsSessionId = session.id;
        }

        if (Object.keys(update).length === 0) return null; // no-op

        const [updated] = await tx
          .update(actionItems)
          .set(update)
          .where(eq(actionItems.id, id))
          .returning();

        // What actually moved, measured against the row as it was.
        // Comparing the BEFORE and AFTER rows rather than trusting the
        // submitted payload means a save that re-posts the same date
        // doesn't manufacture a "they changed the date" notice.
        const statusChanged =
          data.status !== undefined && data.status !== existing.status;
        const dueChanged =
          data.dueDate !== undefined &&
          sameDay(existing.dueDate, updated.dueDate) === false;

        const progress =
          actorIsClient && (statusChanged || dueChanged)
            ? {
                itemTitle: updated.title,
                statusChange: statusChanged
                  ? {
                      from: existing.status as ActionItemStatus,
                      to: updated.status as ActionItemStatus,
                    }
                  : null,
                dueDateChange: dueChanged
                  ? { from: existing.dueDate, to: updated.dueDate }
                  : null,
              }
            : null;

        // Notify on reassignment to a different user (and not self-assign).
        const newAssignee = data.assigneeUserProfileId;
        const shouldNotify =
          newAssignee !== undefined &&
          newAssignee !== existing.assigneeUserProfileId &&
          newAssignee &&
          newAssignee !== profile.userProfileId;

        // The rows and the emails are raised outside this transaction —
        // it is bound to the engagement's org, and a Business Builder
        // recipient lives in the master org. See the create path above.
        return {
          progress,
          reassignment:
            shouldNotify && newAssignee
              ? {
                  assigneeUserProfileId: newAssignee,
                  itemId: updated.id,
                  itemTitle: updated.title,
                  itemDescription: updated.description,
                  dueDate: updated.dueDate,
                }
              : null,
        };
      },
    );

    if (outcome?.reassignment) {
      const r = outcome.reassignment;
      await notifyActionItemAssigned({
        actionItemId: r.itemId,
        assigneeUserProfileId: r.assigneeUserProfileId,
        assignerUserProfileId: profile.userProfileId,
        assignerName: await loadAuthorName(profile),
        itemTitle: r.itemTitle,
        itemDescription: r.itemDescription,
        dueDate: r.dueDate,
      });
    }

    if (outcome?.progress) {
      await notifyBuildersOfProgress({
        actionItemId: id,
        engagementId,
        itemTitle: outcome.progress.itemTitle,
        actorUserProfileId: profile.userProfileId,
        actorName: await loadAuthorName(profile),
        statusChange: outcome.progress.statusChange,
        dueDateChange: outcome.progress.dueDateChange,
      });
    }

    // Completing the item retires any focus block the assistant placed
    // for it: the future calendar event is deleted and the block stops
    // being re-proposed. Best-effort — a Google failure must not undo
    // the completion the user just performed.
    if (data.status === "done") {
      try {
        const { retireBlocksForCompletedItem } = await import(
          "@/lib/ea/time-blocks"
        );
        await retireBlocksForCompletedItem(id);
      } catch (e) {
        console.error("[ea] could not retire time blocks for", id, e);
      }
    }

    revalidateActionItemPaths();
    // Mirror the change out to the EA Command Central sheet (best-effort).
    await syncActionItemToEa(id);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteActionItem(
  id: string,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok") {
    return { ok: false, error: "Not authenticated." };
  }
  if (!canEditAnything(profile.role)) {
    return {
      ok: false,
      error: "Your role can't delete action items.",
    };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id." };
  }

  try {
    const engagementId = await resolveEngagementIdFromRecord(
      "action_items",
      id,
    );
    if (!engagementId) {
      return { ok: false, error: "Action item not found." };
    }
    // Delete the calendar events BEFORE the row goes. `ea_time_blocks`
    // cascades on delete, so once the item is gone we would no longer
    // know which Google events to clean up and they would sit on the
    // calendar forever pointing at nothing.
    try {
      const { retireBlocksForCompletedItem } = await import(
        "@/lib/ea/time-blocks"
      );
      await retireBlocksForCompletedItem(id);
    } catch (e) {
      console.error("[ea] could not retire time blocks for", id, e);
    }

    const externalId = await withEngagementContext(
      profile.orgId,
      profile.role,
      engagementId,
      async (tx) => {
        const [existing] = await tx
          .select({ ext: actionItems.eaExternalId })
          .from(actionItems)
          .where(eq(actionItems.id, id))
          .limit(1);
        await tx.delete(actionItems).where(eq(actionItems.id, id));
        return existing?.ext ?? null;
      },
    );
    revalidateActionItemPaths();
    // Retire the matching EA sheet row (best-effort).
    await expireInEa(externalId);
    return { ok: true, data: undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
