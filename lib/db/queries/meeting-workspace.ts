/**
 * Everything one meeting's workspace needs, in one hop.
 *
 * The point of the workspace is that a session has ONE page: the recap,
 * the transcript, and every commitment and document that came out of it,
 * with somewhere to add what the transcript missed. Before this, those
 * lived across the Meetings library, the Action items module, the
 * Deliverables module and the BBS session page, which is the redundancy
 * Bruce asked to be rid of.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import {
  actionItems,
  engagementMeetings,
  engagements,
  userProfiles,
} from "@/lib/db/schema";
import { withSystemContext } from "@/lib/db/tenant";
import type { DeliverableType } from "@/lib/deliverables/types";

export type FollowThroughItem = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "open" | "in_progress" | "done" | "blocked";
  assigneeUserProfileId: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  deliverableType: DeliverableType | null;
  revenueImpact: boolean;
  marginImpact: boolean;
  createdBy: "coach" | "claude";
  confidenceFlag: "high" | "medium" | "low" | null;
};

export type MeetingWorkspace = {
  meeting: typeof engagementMeetings.$inferSelect;
  engagementName: string | null;
  items: FollowThroughItem[];
  /** Everyone who could own something out of this session: the client's
   *  own people AND the Business Builders. Drives the owner dropdown. */
  members: { id: string; name: string | null; role: string }[];
};

export async function getMeetingWorkspace(
  meetingId: string,
): Promise<MeetingWorkspace | null> {
  return withSystemContext(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(engagementMeetings)
      .where(eq(engagementMeetings.id, meetingId))
      .limit(1);
    if (!meeting) return null;

    const [eng] = await tx
      .select({ name: engagements.name, orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, meeting.engagementId))
      .limit(1);

    const rows = await tx
      .select({
        id: actionItems.id,
        title: actionItems.title,
        description: actionItems.description,
        status: actionItems.status,
        assigneeUserProfileId: actionItems.assigneeUserProfileId,
        assigneeName: userProfiles.fullName,
        dueDate: actionItems.dueDate,
        deliverableType: actionItems.deliverableType,
        revenueImpact: actionItems.revenueImpact,
        marginImpact: actionItems.marginImpact,
        createdBy: actionItems.createdBy,
        confidenceFlag: actionItems.confidenceFlag,
      })
      .from(actionItems)
      .leftJoin(
        userProfiles,
        eq(userProfiles.id, actionItems.assigneeUserProfileId),
      )
      .where(eq(actionItems.engagementMeetingId, meetingId))
      // Drafts first — they are the ones needing a decision, and the
      // whole page exists so they get one. Then newest.
      .orderBy(asc(actionItems.status), desc(actionItems.createdAt));

    // The client's own people, plus every Business Builder. A commitment
    // out of a session is as often ours as theirs, so an owner list of
    // only the client's team would force half of them to be assigned
    // somewhere else.
    const clientPeople = eng
      ? await tx
          .select({
            id: userProfiles.id,
            name: userProfiles.fullName,
            role: userProfiles.role,
          })
          .from(userProfiles)
          .where(eq(userProfiles.orgId, eng.orgId))
      : [];

    const builders = await tx
      .select({
        id: userProfiles.id,
        name: userProfiles.fullName,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(eq(userProfiles.role, "coach"));

    const admins = await tx
      .select({
        id: userProfiles.id,
        name: userProfiles.fullName,
        role: userProfiles.role,
      })
      .from(userProfiles)
      .where(eq(userProfiles.role, "master_admin"));

    const seen = new Set<string>();
    const members = [...admins, ...builders, ...clientPeople].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return {
      meeting,
      engagementName: eng?.name ?? null,
      items: rows as FollowThroughItem[],
      members,
    };
  });
}

/** Pending-review counts for the meetings index, batched. */
export async function countDraftsByMeeting(
  engagementId: string,
): Promise<Map<string, number>> {
  const rows = await withSystemContext(async (tx) =>
    tx
      .select({
        meetingId: actionItems.engagementMeetingId,
        status: actionItems.status,
      })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.engagementId, engagementId),
          eq(actionItems.status, "draft"),
        ),
      ),
  );
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.meetingId) continue;
    out.set(r.meetingId, (out.get(r.meetingId) ?? 0) + 1);
  }
  return out;
}
