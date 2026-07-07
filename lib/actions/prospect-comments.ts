"use server";

/**
 * Internal Business Builder comments on a prospect / client.
 *
 * A private discussion thread between Business Builders (Bruce, Jen, and
 * future hires) about a lead — never shown in the client portal. Authors
 * can @notify teammates, who get an in-app notification (surfaced in the
 * Business Builder notifications feed) plus an email.
 *
 * Comments live in the master org alongside the prospect. Notifications
 * are written with the master org id so the recipient's tenant-scoped
 * notification queries pick them up. The parent entity is the prospect
 * itself, so a notification links straight to the prospect page.
 */

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureUserProfile } from "@/lib/db/provisioning";
import {
  notifications,
  prospectComments,
  prospects,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import { sendEmailQuietly } from "@/lib/email/send";
import { mentionEmail } from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/push/web-push";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const createSchema = z.object({
  prospectId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a comment first.").max(20_000),
  notifyIds: z.array(z.string().uuid()).max(20).optional().default([]),
});

export async function createProspectComment(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  const data = parsed.data;

  // Don't notify yourself even if the picker somehow included you.
  const notifyIds = Array.from(
    new Set(data.notifyIds.filter((id) => id !== profile.userProfileId)),
  );

  try {
    const result = await withSystemContext(async (tx) => {
      const [p] = await tx
        .select({
          orgId: prospects.orgId,
          companyName: prospects.companyName,
          contactName: prospects.contactName,
        })
        .from(prospects)
        .where(eq(prospects.id, data.prospectId))
        .limit(1);
      if (!p) throw new Error("Prospect not found.");

      const [comment] = await tx
        .insert(prospectComments)
        .values({
          orgId: p.orgId,
          prospectId: data.prospectId,
          authorUserProfileId: profile.userProfileId,
          body: data.body,
          notifiedUserProfileIds: notifyIds,
        })
        .returning({ id: prospectComments.id });

      // Only notify teammates who are real internal users. This also
      // gives us their email + name for the outbound mail.
      let recipients: {
        id: string;
        email: string | null;
        fullName: string | null;
      }[] = [];
      if (notifyIds.length > 0) {
        recipients = await tx
          .select({
            id: userProfiles.id,
            email: userProfiles.email,
            fullName: userProfiles.fullName,
          })
          .from(userProfiles)
          .where(inArray(userProfiles.id, notifyIds));

        if (recipients.length > 0) {
          await tx.insert(notifications).values(
            recipients.map((r) => ({
              orgId: p.orgId,
              userProfileId: r.id,
              type: "mention" as const,
              // Point straight at the prospect so the notifications feed
              // can deep-link into /business-builder/pipeline/<id>.
              parentEntityType: "prospect_comment",
              parentEntityId: data.prospectId,
              sentVia: "both" as const,
            })),
          );
        }
      }

      return {
        commentId: comment.id,
        companyName: p.companyName,
        contactName: p.contactName,
        recipients,
      };
    });

    // Fire the emails outside the DB transaction — a send failure must
    // not roll back the comment. sendEmailQuietly handles working-hours
    // queueing internally.
    if (result.recipients.length > 0) {
      const authorName = profile.fullName || "A teammate";
      const label = result.contactName
        ? `${result.companyName} (${result.contactName})`
        : result.companyName;
      const contextLabel = `a comment on ${label}`;
      const url = `/business-builder/pipeline/${data.prospectId}`;
      await Promise.all(
        result.recipients
          .filter((r): r is typeof r & { email: string } => Boolean(r.email))
          .map((r) =>
            sendEmailQuietly(
              mentionEmail({
                to: r.email,
                recipientName: r.fullName ?? "there",
                authorName,
                contextLabel,
                messageBody: data.body,
                url,
              }),
            ),
          ),
      );
      // Desktop push (best-effort) to every notified teammate — reaches
      // them with the tab closed.
      await Promise.all(
        result.recipients.map((r) =>
          sendPushToUser(r.id, {
            title: "New comment",
            body: `${authorName} commented on ${label}`,
            url,
            tag: `prospect-comment-${data.prospectId}`,
          }),
        ),
      );
    }

    revalidatePath(`/business-builder/pipeline/${data.prospectId}`);
    return { ok: true, data: { id: result.commentId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** Delete a comment. Author or a master_admin (moderation) only. */
export async function deleteProspectComment(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const profile = await ensureUserProfile();
  if (profile.status !== "ok")
    return { ok: false, error: "Not authenticated." };
  if (profile.role !== "master_admin" && profile.role !== "coach")
    return { ok: false, error: "Business Builders only." };

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };

  const prospectId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .select({
        prospectId: prospectComments.prospectId,
        authorId: prospectComments.authorUserProfileId,
      })
      .from(prospectComments)
      .where(eq(prospectComments.id, parsed.data.id))
      .limit(1);
    if (!row) return null;
    // Author can always delete their own; master_admin can moderate any.
    if (
      row.authorId !== profile.userProfileId &&
      profile.role !== "master_admin"
    ) {
      throw new Error("You can only delete your own comments.");
    }
    await tx
      .delete(prospectComments)
      .where(eq(prospectComments.id, parsed.data.id));
    return row.prospectId;
  });

  if (!prospectId) return { ok: false, error: "Comment not found." };
  revalidatePath(`/business-builder/pipeline/${prospectId}`);
  return { ok: true, data: undefined };
}
